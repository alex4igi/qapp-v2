-- Qapp v2 — RPC-uri campanie de reînscrieri.
--
--  create_campanie_reinscriere  — admin creează campania pe un sezon planificat
--  record_taxa_rezervare        — poarta 1 (taxă), validează încasarea Taxa
--  set_act_aditional_manual     — poarta 2 manual (link scan Drive)
--  _try_activate_gate           — intern: dacă ambele porți gata → activate_reinscriere_pe_sezon
--  get_campanie_progress        — KPI campanie vs target
--  get_campanie_progress_curs   — progres + ocupare per curs țintă
--  list_campanie_clienti_curs   — clienți eligibili + starea porților, per curs
--  close_campanie_reinscriere   — admin închide campania (lock)

-- ============================================================
-- Intern: încearcă activarea când ambele porți sunt completate.
-- Idempotent: doar dacă activat_la is null. NU se acordă PUBLIC (apelat din definer).
-- ============================================================
create or replace function _try_activate_gate(p_gate_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  g       reinscrieri_gate%rowtype;
  v_sezon uuid;
  v_enroll uuid;
begin
  select * into g from reinscrieri_gate where id = p_gate_id;
  if not found then
    return;
  end if;

  if g.taxa_platita_la is not null
     and g.act_semnat_la is not null
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
-- create_campanie_reinscriere — admin only
-- ============================================================
create or replace function create_campanie_reinscriere(
  p_sezon_tinta uuid,
  p_nume text,
  p_target integer,
  p_taxa numeric,
  p_data_incepere date,
  p_data_final date,
  p_zile_procesare integer default 7
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tip   text;
  v_stare text;
  v_id    uuid;
begin
  if not is_admin() then
    raise exception 'Acces refuzat: doar admin poate crea o campanie de reînscrieri.';
  end if;

  select tip, stare into v_tip, v_stare from sezoane where id = p_sezon_tinta;
  if v_tip is null then
    raise exception 'Sezonul țintă nu există.';
  end if;
  if v_tip <> 'principal' or v_stare <> 'planificat' then
    raise exception 'Campania se poate crea doar pe un sezon principal planificat (orarul de toamnă).';
  end if;
  if coalesce(trim(p_nume), '') = '' then
    raise exception 'Numele campaniei este obligatoriu.';
  end if;
  if p_taxa is null or p_taxa <= 0 then
    raise exception 'Taxa de rezervare trebuie să fie pozitivă.';
  end if;
  if p_data_incepere is null or p_data_final is null then
    raise exception 'Perioada campaniei (început/final) este obligatorie.';
  end if;
  if p_data_final < p_data_incepere then
    raise exception 'data_final nu poate fi înainte de data_incepere.';
  end if;
  if exists (select 1 from campanii_reinscriere where sezon_tinta = p_sezon_tinta) then
    raise exception 'Există deja o campanie pentru acest sezon.';
  end if;

  insert into campanii_reinscriere (
    sezon_tinta, nume, target_clienti, taxa_rezervare,
    data_incepere, data_final, zile_procesare, created_by
  ) values (
    p_sezon_tinta, trim(p_nume), greatest(coalesce(p_target, 0), 0), p_taxa,
    p_data_incepere, p_data_final, greatest(coalesce(p_zile_procesare, 7), 0), auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;
grant execute on function create_campanie_reinscriere(uuid, text, integer, numeric, date, date, integer) to authenticated;

-- ============================================================
-- record_taxa_rezervare — poarta 1
-- ============================================================
create or replace function record_taxa_rezervare(
  p_campanie_id uuid,
  p_client_id uuid,
  p_curs_tinta_id uuid,
  p_incasare_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_taxa      numeric;
  v_inc_client uuid;
  v_inc_suma   numeric;
  v_inc_cat    text;
  v_gate_id    uuid;
begin
  select taxa_rezervare into v_taxa from campanii_reinscriere where id = p_campanie_id;
  if v_taxa is null then
    raise exception 'Campania nu există.';
  end if;

  select client, suma, categorie::text
    into v_inc_client, v_inc_suma, v_inc_cat
  from incasari where id = p_incasare_id;
  if not found then
    raise exception 'Încasarea nu există.';
  end if;
  if v_inc_cat <> 'Taxa' then
    raise exception 'Încasarea nu este de tip Taxa.';
  end if;
  if v_inc_client is distinct from p_client_id then
    raise exception 'Încasarea nu aparține clientului indicat.';
  end if;
  if v_inc_suma < v_taxa then
    raise exception 'Suma încasată (%) este sub taxa de rezervare (%).', v_inc_suma, v_taxa;
  end if;

  insert into reinscrieri_gate (campanie_id, client_id, curs_tinta_id, taxa_incasare_id, taxa_platita_la)
  values (p_campanie_id, p_client_id, p_curs_tinta_id, p_incasare_id, now())
  on conflict (campanie_id, client_id, curs_tinta_id)
  do update set taxa_incasare_id = excluded.taxa_incasare_id,
                taxa_platita_la  = now(),
                updated          = now()
  returning id into v_gate_id;

  perform _try_activate_gate(v_gate_id);
  return v_gate_id;
end;
$$;
grant execute on function record_taxa_rezervare(uuid, uuid, uuid, uuid) to authenticated;

-- ============================================================
-- set_act_aditional_manual — poarta 2 (cale manuală)
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
    raise exception 'Link-ul documentului semnat este obligatoriu.';
  end if;
  if not exists (select 1 from campanii_reinscriere where id = p_campanie_id) then
    raise exception 'Campania nu există.';
  end if;

  insert into reinscrieri_gate (
    campanie_id, client_id, curs_tinta_id,
    act_status, act_canal, document_link, act_semnat_la
  ) values (
    p_campanie_id, p_client_id, p_curs_tinta_id,
    'semnat', 'manual', trim(p_document_link), now()
  )
  on conflict (campanie_id, client_id, curs_tinta_id)
  do update set act_status    = 'semnat',
                act_canal     = 'manual',
                document_link = excluded.document_link,
                act_semnat_la = now(),
                updated       = now()
  returning id into v_gate_id;

  perform _try_activate_gate(v_gate_id);
  return v_gate_id;
end;
$$;
grant execute on function set_act_aditional_manual(uuid, uuid, uuid, text) to authenticated;

-- ============================================================
-- get_campanie_progress — KPI campanie
-- ============================================================
create or replace function get_campanie_progress(p_campanie_id uuid)
returns table (
  target_clienti  integer,
  re_inscrisi     integer,
  in_proces       integer,
  taxa_done       integer,
  act_done        integer,
  procent         numeric
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
         and (taxa_platita_la is not null or act_semnat_la is not null)
         and client_id not in (select client_id from activ)),
    (select count(*)::int from g where taxa_platita_la is not null),
    (select count(*)::int from g where act_semnat_la is not null),
    case when coalesce((select target_clienti from cr), 0) > 0
         then round(100.0 * (select count(*) from activ) / (select target_clienti from cr), 1)
         else 0 end;
$$;
grant execute on function get_campanie_progress(uuid) to authenticated;

-- ============================================================
-- get_campanie_progress_curs — progres + ocupare grupă toamnă per curs țintă
-- (doar cursuri recurente: facultativ=false). Ocuparea = înrolări non-reziliate
-- pe cursul țintă în sezonul țintă / capacitate_maxima (NU get_grad_ocupare, care
-- e pe sezonul ACTIV).
-- ============================================================
create or replace function get_campanie_progress_curs(p_campanie_id uuid)
returns table (
  curs_id          uuid,
  curs_nume        text,
  varsta           varsta_curs,
  total_eligibili  integer,
  taxa_done        integer,
  act_done         integer,
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
           count(*) filter (where taxa_platita_la is not null)::int as taxa_done,
           count(*) filter (where act_semnat_la is not null)::int  as act_done,
           count(*) filter (where activat_la is not null)::int     as ambele
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

-- ============================================================
-- list_campanie_clienti_curs — clienți eligibili + starea porților
-- ============================================================
create or replace function list_campanie_clienti_curs(
  p_campanie_id uuid,
  p_curs_tinta_id uuid
)
returns table (
  client_id            uuid,
  nume                 text,
  prenume              text,
  telefon              text,
  email                text,
  taxa_platita_la      timestamptz,
  act_status           text,
  act_canal            text,
  document_link        text,
  esemneaza_request_id text,
  activat_la           timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with target as (
    select id, cursul_original from cursuri where id = p_curs_tinta_id
  ),
  eligibili as (
    select distinct e.client
    from enrollments e
    join target t on e.cursul = t.cursul_original
    where t.cursul_original is not null
      and e.activ = true
      and e.reziliat = false
      and (e.data_incepere is null or e.data_incepere <= current_date)
      and (e.data_final is null or e.data_final >= current_date)
  )
  select
    c.id,
    c.nume,
    c.prenume,
    c.telefon,
    c.email,
    g.taxa_platita_la,
    coalesce(g.act_status, 'nesemnat'),
    g.act_canal,
    g.document_link,
    g.esemneaza_request_id,
    g.activat_la
  from eligibili el
  join clienti c on c.id = el.client
  left join reinscrieri_gate g
    on g.client_id = el.client
   and g.curs_tinta_id = p_curs_tinta_id
   and g.campanie_id = p_campanie_id
  order by c.nume, c.prenume;
$$;
grant execute on function list_campanie_clienti_curs(uuid, uuid) to authenticated;

-- ============================================================
-- close_campanie_reinscriere — admin lock
-- ============================================================
create or replace function close_campanie_reinscriere(p_campanie_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Acces refuzat: doar admin poate închide campania.';
  end if;
  update campanii_reinscriere
  set inchisa_la = now(), updated = now()
  where id = p_campanie_id;
  if not found then
    raise exception 'Campania nu există.';
  end if;
end;
$$;
grant execute on function close_campanie_reinscriere(uuid) to authenticated;
