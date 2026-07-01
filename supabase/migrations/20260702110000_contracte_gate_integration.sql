-- Modul Contracte Faza 2 — integrare cu poarta de reînscrieri (act adițional).
--
-- Fluxul: bulk send pe campanie → gate upsert (act_status='trimis', act_canal='app')
-- → părintele semnează în app → contract-finalize setează 'semnat' + document_link
-- → admin verifică și aprobă (fluxul existent approve_act_aditional rămâne neatins)
-- → _try_activate_gate activează reînscrierea.

-- ============================================================
-- 0) tip nou de eveniment în jurnal: gate_semnat
-- ============================================================
alter table contract_events drop constraint if exists contract_events_tip_check;
alter table contract_events add constraint contract_events_tip_check
  check (tip in (
    'creat', 'trimis', 'sms_pus_in_coada', 'email_trimis', 'deschis',
    'consimtamant', 'semnat', 'pdf_generat', 'sigilat', 'drive_upload',
    'gate_semnat', 'reminder', 'expirat', 'respins', 'anulat', 'eroare'
  ));

-- ============================================================
-- 1) act_canal acceptă 'app'
-- ============================================================
alter table reinscrieri_gate drop constraint if exists reinscrieri_gate_act_canal_check;
alter table reinscrieri_gate add constraint reinscrieri_gate_act_canal_check
  check (act_canal in ('esemneaza', 'manual', 'app'));

-- ============================================================
-- 2) Progress: „de verificat" include și semnat-în-app (act_status='semnat' + canal 'app')
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
         and (taxa_platita_la is not null or act_status in ('de_verificat','verificat','semnat','trimis'))
         and client_id not in (select client_id from activ)),
    (select count(*)::int from g where taxa_platita_la is not null),
    (select count(*)::int from g where act_status = 'verificat'),
    (select count(*)::int from g
       where act_status = 'de_verificat'
          or (act_status = 'semnat' and act_canal = 'app')),
    case when coalesce((select target_clienti from cr), 0) > 0
         then round(100.0 * (select count(*) from activ) / (select target_clienti from cr), 1)
         else 0 end;
$$;
grant execute on function get_campanie_progress(uuid) to authenticated;

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
           count(*) filter (where act_status = 'de_verificat'
                               or (act_status = 'semnat' and act_canal = 'app'))::int as act_de_verificat,
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

-- ============================================================
-- 3) list_targets_campanie — țintele pentru bulk send (toate cursurile campaniei)
--    Un rând per client eligibil × curs țintă, cu familia și starea actului.
-- ============================================================
create or replace function list_targets_campanie(p_campanie_id uuid)
returns table (
  client_id     uuid,
  client_nume   text,
  familie_id    uuid,
  familie_nume  text,
  telefon       text,
  curs_tinta_id uuid,
  curs_nume     text,
  act_status    text,
  are_contract  boolean
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
    select c.id as curs_id, c.numele, c.cursul_original
    from cursuri c, camp
    where c.sezon = camp.sezon_tinta
      and c.facultativ = false
      and c.cursul_original is not null
  ),
  eligibili as (
    select distinct t.curs_id, e.client
    from target t
    join enrollments e on e.cursul = t.cursul_original
    where e.activ = true
      and e.reziliat = false
      and (e.data_incepere is null or e.data_incepere <= current_date)
      and (e.data_final is null or e.data_final >= current_date)
  )
  select
    c.id,
    (c.nume || ' ' || coalesce(c.prenume, ''))::text,
    f.id,
    f.nume_familie,
    coalesce(f.telefon, c.telefon),
    t.curs_id,
    t.numele,
    coalesce(g.act_status, 'nesemnat'),
    exists (
      select 1 from contracte ct
      where ct.client_id = c.id
        and ct.campanie_id = p_campanie_id
        and ct.status in ('trimis', 'deschis', 'semnat', 'finalizat')
    )
  from eligibili el
  join target t on t.curs_id = el.curs_id
  join clienti c on c.id = el.client
  left join familii f on f.id = c.familia
  left join reinscrieri_gate g
    on g.client_id = el.client
   and g.curs_tinta_id = el.curs_id
   and g.campanie_id = p_campanie_id
  order by t.numele, c.nume;
$$;
grant execute on function list_targets_campanie(uuid) to authenticated;
