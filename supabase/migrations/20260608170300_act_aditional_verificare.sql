-- Qapp v2 — Verificare act adițional: un link adăugat NU trece poarta singur.
--
-- Problemă: dacă orice link adăugat valida poarta, se putea urca orice fișier.
-- Soluție: link adăugat → stare 'de_verificat' (în așteptare); un ADMIN deschide
-- documentul și îl aprobă → stare 'verificat' (abia atunci contează poarta). Audit:
-- act_verificat_de + act_verificat_la. Activarea reînscrierii cere taxă + act 'verificat'.
-- (esemneaza API rămâne Faza 2; când vine, webhook-ul poate seta direct 'verificat'.)

-- ============================================================
-- 1) Coloane audit + stare nouă
-- ============================================================
alter table reinscrieri_gate
  add column if not exists act_verificat_la timestamptz,
  add column if not exists act_verificat_de uuid references auth.users(id) on delete set null;

alter table reinscrieri_gate drop constraint if exists reinscrieri_gate_act_status_check;
alter table reinscrieri_gate add constraint reinscrieri_gate_act_status_check
  check (act_status in ('nesemnat','de_verificat','verificat','trimis','semnat','expirat','anulat'));

-- ============================================================
-- 2) _try_activate_gate: poarta 2 trece doar dacă act_status='verificat'
-- ============================================================
create or replace function _try_activate_gate(p_gate_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  g        reinscrieri_gate%rowtype;
  v_sezon  uuid;
  v_enroll uuid;
begin
  select * into g from reinscrieri_gate where id = p_gate_id;
  if not found then
    return;
  end if;

  if g.taxa_platita_la is not null
     and g.act_status = 'verificat'
     and g.activat_la is null then
    perform activate_reinscriere_pe_sezon(g.client_id, g.curs_tinta_id);

    select sezon into v_sezon from cursuri where id = g.curs_tinta_id;
    select id into v_enroll
    from enrollments
    where client = g.client_id
      and cursul = g.curs_tinta_id
      and sezon_id = v_sezon
      and este_reinscriere = true
      and reziliat = false
    order by created desc
    limit 1;

    update reinscrieri_gate
    set activat_la = now(), enrollment_id = v_enroll, updated = now()
    where id = p_gate_id;
  end if;
end;
$$;
revoke execute on function _try_activate_gate(uuid) from public;

-- ============================================================
-- 3) set_act_aditional_manual: linkul intră ca 'de_verificat' (NU trece poarta)
-- ============================================================
create or replace function set_act_aditional_manual(
  p_campanie_id uuid,
  p_client_id uuid,
  p_curs_tinta_id uuid,
  p_document_link text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gate_id uuid;
begin
  if p_document_link is null or length(trim(p_document_link)) = 0 then
    raise exception 'Link-ul documentului este obligatoriu.';
  end if;
  if not exists (select 1 from campanii_reinscriere where id = p_campanie_id) then
    raise exception 'Campania nu există.';
  end if;

  insert into reinscrieri_gate (
    campanie_id, client_id, curs_tinta_id,
    act_status, act_canal, document_link
  ) values (
    p_campanie_id, p_client_id, p_curs_tinta_id,
    'de_verificat', 'manual', trim(p_document_link)
  )
  on conflict (campanie_id, client_id, curs_tinta_id)
  do update set act_status      = 'de_verificat',
                act_canal       = 'manual',
                document_link   = excluded.document_link,
                act_semnat_la   = null,
                act_verificat_la = null,
                act_verificat_de = null,
                updated         = now()
  returning id into v_gate_id;

  return v_gate_id;
end;
$$;
grant execute on function set_act_aditional_manual(uuid, uuid, uuid, text) to authenticated;

-- ============================================================
-- 4) approve_act_aditional — admin aprobă documentul (poarta 2 trece)
-- ============================================================
create or replace function approve_act_aditional(
  p_campanie_id uuid,
  p_client_id uuid,
  p_curs_tinta_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gate_id uuid;
begin
  if not is_admin() then
    raise exception 'Acces refuzat: doar un admin poate aproba actul adițional.';
  end if;

  update reinscrieri_gate
  set act_status      = 'verificat',
      act_verificat_la = now(),
      act_verificat_de = auth.uid(),
      updated         = now()
  where campanie_id = p_campanie_id
    and client_id = p_client_id
    and curs_tinta_id = p_curs_tinta_id
    and document_link is not null
  returning id into v_gate_id;

  if v_gate_id is null then
    raise exception 'Nu există un act încărcat de aprobat pentru acest client.';
  end if;

  perform _try_activate_gate(v_gate_id);
  return v_gate_id;
end;
$$;
grant execute on function approve_act_aditional(uuid, uuid, uuid) to authenticated;

-- ============================================================
-- 5) reject_act_aditional — admin respinge (curăță linkul); doar înainte de activare
-- ============================================================
create or replace function reject_act_aditional(
  p_campanie_id uuid,
  p_client_id uuid,
  p_curs_tinta_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gate_id uuid;
begin
  if not is_admin() then
    raise exception 'Acces refuzat: doar un admin poate respinge actul adițional.';
  end if;

  update reinscrieri_gate
  set act_status      = 'nesemnat',
      act_canal       = null,
      document_link   = null,
      act_semnat_la   = null,
      act_verificat_la = null,
      act_verificat_de = null,
      updated         = now()
  where campanie_id = p_campanie_id
    and client_id = p_client_id
    and curs_tinta_id = p_curs_tinta_id
    and activat_la is null
  returning id into v_gate_id;

  if v_gate_id is null then
    raise exception 'Nu se poate respinge (act inexistent sau reînscriere deja activată).';
  end if;

  return v_gate_id;
end;
$$;
grant execute on function reject_act_aditional(uuid, uuid, uuid) to authenticated;

-- ============================================================
-- 6) get_campanie_progress — act_done = verificat; + act_de_verificat
-- ============================================================
drop function if exists get_campanie_progress(uuid);
create function get_campanie_progress(p_campanie_id uuid)
returns table (
  target_clienti   integer,
  re_inscrisi      integer,
  in_proces        integer,
  taxa_done        integer,
  act_done         integer,
  act_de_verificat integer,
  procent          numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with cr as (
    select target_clienti from campanii_reinscriere where id = p_campanie_id
  ),
  g as (
    select * from reinscrieri_gate where campanie_id = p_campanie_id
  ),
  activ as (
    select distinct client_id from g where activat_la is not null
  )
  select
    coalesce((select target_clienti from cr), 0),
    (select count(*)::int from activ),
    (select count(distinct client_id)::int from g
       where activat_la is null
         and (taxa_platita_la is not null or act_status in ('de_verificat','verificat'))
         and client_id not in (select client_id from activ)),
    (select count(*)::int from g where taxa_platita_la is not null),
    (select count(*)::int from g where act_status = 'verificat'),
    (select count(*)::int from g where act_status = 'de_verificat'),
    case when coalesce((select target_clienti from cr), 0) > 0
         then round(100.0 * (select count(*) from activ) / (select target_clienti from cr), 1)
         else 0 end;
$$;
grant execute on function get_campanie_progress(uuid) to authenticated;

-- ============================================================
-- 7) get_campanie_progress_curs — act_done = verificat; + act_de_verificat
-- ============================================================
drop function if exists get_campanie_progress_curs(uuid);
create function get_campanie_progress_curs(p_campanie_id uuid)
returns table (
  curs_id          uuid,
  curs_nume        text,
  varsta           varsta_curs,
  total_eligibili  integer,
  taxa_done        integer,
  act_done         integer,
  act_de_verificat integer,
  ambele           integer,
  ramasi           integer,
  procent          numeric,
  activi           integer,
  capacitate       integer,
  procent_ocupare  numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with camp as (
    select sezon_tinta from campanii_reinscriere where id = p_campanie_id
  ),
  target as (
    select c.id as curs_id, c.numele, c.varsta, c.cursul_original, c.capacitate_maxima
    from cursuri c, camp
    where c.sezon = camp.sezon_tinta
      and c.facultativ = false
  ),
  eligibili as (
    select t.curs_id, count(distinct e.client)::int as total
    from target t
    join enrollments e on e.cursul = t.cursul_original
    where t.cursul_original is not null
      and e.activ = true
      and e.reziliat = false
      and (e.data_incepere is null or e.data_incepere <= current_date)
      and (e.data_final is null or e.data_final >= current_date)
    group by t.curs_id
  ),
  gates as (
    select curs_tinta_id,
           count(*) filter (where taxa_platita_la is not null)::int  as taxa_done,
           count(*) filter (where act_status = 'verificat')::int     as act_done,
           count(*) filter (where act_status = 'de_verificat')::int  as act_de_verificat,
           count(*) filter (where activat_la is not null)::int       as ambele
    from reinscrieri_gate
    where campanie_id = p_campanie_id
    group by curs_tinta_id
  ),
  ocupare as (
    select e.cursul as curs_id, count(distinct e.client)::int as activi
    from enrollments e, camp
    where e.sezon_id = camp.sezon_tinta
      and e.reziliat = false
    group by e.cursul
  )
  select
    t.curs_id,
    t.numele,
    t.varsta,
    coalesce(el.total, 0),
    coalesce(g.taxa_done, 0),
    coalesce(g.act_done, 0),
    coalesce(g.act_de_verificat, 0),
    coalesce(g.ambele, 0),
    (coalesce(el.total, 0) - coalesce(g.ambele, 0)),
    case when coalesce(el.total, 0) > 0
         then round(100.0 * coalesce(g.ambele, 0) / el.total, 1)
         else 0 end,
    coalesce(o.activi, 0),
    t.capacitate_maxima,
    case when coalesce(t.capacitate_maxima, 0) > 0
         then round(100.0 * coalesce(o.activi, 0) / t.capacitate_maxima, 1)
         else null end
  from target t
  left join eligibili el on el.curs_id = t.curs_id
  left join gates g      on g.curs_tinta_id = t.curs_id
  left join ocupare o    on o.curs_id = t.curs_id
  order by t.numele;
$$;
grant execute on function get_campanie_progress_curs(uuid) to authenticated;
