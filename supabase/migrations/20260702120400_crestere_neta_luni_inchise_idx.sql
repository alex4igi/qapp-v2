-- Qapp v2 — retușuri post-sanity la pachetul de luni (2026-07-02).
--
-- 1. get_crestere_neta: seria se oprea la LUNA CURENTĂ (parțială) → pe 2 iulie
--    arăta „pierduți 474 / net −466" (definiția lunară abia începe să se umple
--    cu prezențe). Seria se oprește acum la ultima lună ÎNCHEIATĂ — aceeași
--    convenție ca retenția/cohortele; și etichetele „(luna trecută)" din
--    Section1 devin corecte.
--
-- 2. Index pentru ramura de prezență a definiției canonice: EXISTS-ul per
--    înrolare (p.enrollment = e.id AND p.data > D-21) probează pe enrollment,
--    nu pe dată — indexul din 20260702120000 (data, enrollment) nu-l servea.

create or replace function get_crestere_neta(
  p_locatie uuid default null,
  p_luni    integer default 12
)
returns table (
  luna     text,
  intrati  integer,
  pierduti integer,
  net      integer,
  activi   integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with bounds as (
    select (date_trunc('month', current_date) - interval '1 month')::date as last_closed,
           greatest(coalesce(p_luni, 12), 1) as n
  ),
  months_calc as (
    select gs::date as m_start,
           (extract(year from gs) * 12 + extract(month from gs))::int as midx,
           to_char(gs, 'YYYY-MM') as luna
    from bounds b,
      generate_series(
        (b.last_closed - make_interval(months => b.n))::date,
        b.last_closed,
        interval '1 month'
      ) gs
  ),
  cm as (
    select distinct ia.client, m.midx
    from months_calc m
    cross join lateral inrolari_active_luna(m.m_start) ia
    join cursuri c on c.id = ia.cursul
    where (p_locatie is null or c.locatie = p_locatie)
  ),
  per_month as (
    select
      m.luna, m.midx,
      (select count(distinct a.client)::int from cm a where a.midx = m.midx) as activi,
      (select count(distinct a.client)::int from cm a
         where a.midx = m.midx
           and not exists (select 1 from cm b where b.client = a.client and b.midx = m.midx - 1)
      ) as intrati,
      (select count(distinct a.client)::int from cm a
         where a.midx = m.midx - 1
           and not exists (select 1 from cm b where b.client = a.client and b.midx = m.midx)
      ) as pierduti
    from months_calc m
  )
  select luna, intrati, pierduti, (intrati - pierduti) as net, activi
  from per_month
  order by luna
  offset 1;
$$;

grant execute on function get_crestere_neta(uuid, integer) to authenticated;

create index if not exists idx_prezente_prezent_enrollment_data
  on prezente(enrollment, data)
  where status = 'Prezent';
