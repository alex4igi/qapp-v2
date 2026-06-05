-- Qapp v2 — KPI-uri reînscrieri (pierderi promo, conversie plată, comparație sezoane)
--
-- 1. enrollments.promo_anulat_la — timestamp seting de cancel_expired_reinscrieri()
-- 2. cancel_expired_reinscrieri() modificat să seteze promo_anulat_la = now() la downgrade
-- 3. get_reinscrieri_pierderi(p_sezon_tinta) — per curs țintă: activați (current) + pierduți
-- 4. get_reinscrieri_conversie(p_sezon_tinta) — per curs țintă: activați + plătit cel puțin o dată
-- 5. get_incasari_per_sezon() — sum incasari per sezon_id

-- ============================================================
-- 1. enrollments.promo_anulat_la
-- ============================================================
alter table enrollments
  add column if not exists promo_anulat_la timestamptz;

create index if not exists idx_enrollments_promo_anulat
  on enrollments(promo_anulat_la) where promo_anulat_la is not null;

-- ============================================================
-- 2. cancel_expired_reinscrieri — setează promo_anulat_la
-- ============================================================
create or replace function cancel_expired_reinscrieri()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_today date := current_date;
begin
  if extract(day from v_today)::int < 16 then
    return 0;
  end if;

  with expirate as (
    select distinct e.client as client_id, e.cursul as curs_id
    from enrollments e
    left join incasari i on i.inregistrare = e.id
    where e.este_reinscriere = true
      and e.reziliat = false
      and e.data_incepere >= date_trunc('month', v_today)::date
      and e.data_incepere < (date_trunc('month', v_today) + interval '1 month')::date
    group by e.id, e.client, e.cursul, e.suma
    having coalesce(sum(i.suma), 0) < coalesce(e.suma, 0)
  )
  update enrollments e
  set suma = c.pret_lunar,
      este_reinscriere = false,
      promo_anulat_la = now(),
      updated = now()
  from expirate ex
  join cursuri c on c.id = ex.curs_id
  where e.client = ex.client_id
    and e.cursul = ex.curs_id
    and e.reziliat = false
    and e.este_reinscriere = true
    and e.data_incepere >= date_trunc('month', v_today)::date;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function cancel_expired_reinscrieri() to authenticated;

-- ============================================================
-- 3. get_reinscrieri_pierderi(p_sezon_tinta)
--    Pentru fiecare curs din sezonul țintă:
--      activati_curent = înrolări cu este_reinscriere=true, nereziliat (promo activ)
--      pierduti        = înrolări cu promo_anulat_la IS NOT NULL (urma istorică)
--      procent_pierdere = pierduti / (activati_curent + pierduti) * 100
-- ============================================================
create or replace function get_reinscrieri_pierderi(p_sezon_tinta uuid)
returns table (
  curs_id           uuid,
  curs_nume         text,
  varsta            varsta_curs,
  activati_curent   integer,
  pierduti          integer,
  procent_pierdere  numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with cursuri_tinta as (
    select id, numele, varsta from cursuri where sezon = p_sezon_tinta
  ),
  activi as (
    select e.cursul as curs_id, count(distinct e.client)::int as total
    from enrollments e
    where e.sezon_id = p_sezon_tinta
      and e.este_reinscriere = true
      and e.reziliat = false
    group by e.cursul
  ),
  pierderi as (
    select e.cursul as curs_id, count(distinct e.client)::int as total
    from enrollments e
    where e.sezon_id = p_sezon_tinta
      and e.promo_anulat_la is not null
    group by e.cursul
  )
  select
    ct.id,
    ct.numele,
    ct.varsta,
    coalesce(a.total, 0),
    coalesce(p.total, 0),
    case
      when coalesce(a.total, 0) + coalesce(p.total, 0) > 0
        then round(100.0 * coalesce(p.total, 0)
                   / (coalesce(a.total, 0) + coalesce(p.total, 0)), 1)
      else 0
    end
  from cursuri_tinta ct
  left join activi   a on a.curs_id = ct.id
  left join pierderi p on p.curs_id = ct.id
  order by ct.numele;
$$;

grant execute on function get_reinscrieri_pierderi(uuid) to authenticated;

-- ============================================================
-- 4. get_reinscrieri_conversie(p_sezon_tinta)
--    Pentru fiecare curs din sezonul țintă:
--      activati  = înrolări este_reinscriere=true, nereziliate
--      platiti   = activați care au cel puțin o plată asociată în incasari
--      procent_conversie = platiti / activati * 100
-- ============================================================
create or replace function get_reinscrieri_conversie(p_sezon_tinta uuid)
returns table (
  curs_id            uuid,
  curs_nume          text,
  varsta             varsta_curs,
  activati           integer,
  platiti            integer,
  procent_conversie  numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with cursuri_tinta as (
    select id, numele, varsta from cursuri where sezon = p_sezon_tinta
  ),
  inrolari_active as (
    select e.id, e.cursul as curs_id
    from enrollments e
    where e.sezon_id = p_sezon_tinta
      and e.este_reinscriere = true
      and e.reziliat = false
  ),
  total_activati as (
    select curs_id, count(*)::int as total from inrolari_active group by curs_id
  ),
  cu_plata as (
    select ia.curs_id, count(distinct ia.id)::int as total
    from inrolari_active ia
    where exists (
      select 1 from incasari i where i.inregistrare = ia.id and coalesce(i.suma, 0) > 0
    )
    group by ia.curs_id
  )
  select
    ct.id,
    ct.numele,
    ct.varsta,
    coalesce(ta.total, 0),
    coalesce(cp.total, 0),
    case
      when coalesce(ta.total, 0) > 0
        then round(100.0 * coalesce(cp.total, 0) / ta.total, 1)
      else 0
    end
  from cursuri_tinta ct
  left join total_activati ta on ta.curs_id = ct.id
  left join cu_plata cp on cp.curs_id = ct.id
  order by ct.numele;
$$;

grant execute on function get_reinscrieri_conversie(uuid) to authenticated;

-- ============================================================
-- 5. get_incasari_per_sezon — totaluri grupate pe sezon
-- ============================================================
create or replace function get_incasari_per_sezon()
returns table (
  sezon_id         uuid,
  numele_sezonului text,
  tip              text,
  stare            text,
  data_incepere    date,
  data_final       date,
  total_incasari   numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    s.id,
    s.numele_sezonului,
    s.tip,
    s.stare,
    s.data_incepere,
    s.data_final,
    coalesce(sum(i.suma), 0)::numeric as total_incasari
  from sezoane s
  left join incasari i on i.sezon = s.id
  group by s.id
  order by s.data_incepere desc nulls last;
$$;

grant execute on function get_incasari_per_sezon() to authenticated;
