-- Qapp v2 — Fix: cohorte & durată/LTV pe PREZENȚĂ, nu pe acoperire de înrolare.
--
-- PROBLEMĂ (descoperită la smoke test): get_retentie_cohorte pe acoperire de
-- înrolare (reziliat=false) dădea 100% peste tot — recurentele „Per luna" au
-- data_final NULL (acoperă orice lună) iar filtrul reziliat=false transformă
-- cohorta în „doar supraviețuitori" (bias de selecție). Identic cu motivul pentru
-- care get_retentie_membri folosește prezența, nu înrolarea (vezi migrația lui).
--
-- SOLUȚIE: cohortă = luna primei prezențe „Prezent" (cursuri recurent+trupă);
-- reținut la offset k = a fost prezent în luna cohort+k. Doar luni ÎNCHEIATE
-- (luna curentă e incompletă → ar arăta fals de mic). Durata medie = întinderea
-- prezenței (prima→ultima lună cu prezență), tot independent de data_reziliere.

create or replace function get_retentie_cohorte(p_sezon uuid default null)
returns table (
  cohorta_luna     text,
  luni_de_la_start int,
  total_initial    int,
  ramasi           int,
  procent          numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with prez as (
    select distinct p.client, date_trunc('month', p.data)::date as m
    from prezente p
    join enrollments e on e.id = p.enrollment
    join cursuri c on c.id = e.cursul
    where p.status = 'Prezent'
      and coalesce(c.facultativ, false) = false
      and p.client is not null
      and p.data is not null
      and p.data < date_trunc('month', current_date)::date
      and (p_sezon is null or e.sezon_id = p_sezon)
  ),
  cohort as (
    select client, min(m) as cohort_m
    from prez group by client
  ),
  cohort_win as (
    select * from cohort
    where p_sezon is not null
       or cohort_m >= (date_trunc('month', current_date) - interval '11 months')::date
  ),
  tot as (
    select cohort_m, count(*)::int as total_initial from cohort_win group by cohort_m
  ),
  expanded as (
    select cw.client, cw.cohort_m, o.k,
           (cw.cohort_m + make_interval(months => o.k))::date as off_m
    from cohort_win cw
    cross join generate_series(0, 11) o(k)
    where (cw.cohort_m + make_interval(months => o.k))::date < date_trunc('month', current_date)::date
  ),
  ret as (
    select x.cohort_m, x.k, count(distinct pz.client)::int as ramasi
    from expanded x
    left join prez pz on pz.client = x.client and pz.m = x.off_m
    group by x.cohort_m, x.k
  )
  select
    to_char(r.cohort_m, 'YYYY-MM') as cohorta_luna,
    r.k as luni_de_la_start,
    t.total_initial,
    r.ramasi,
    case when t.total_initial > 0 then round(100.0 * r.ramasi / t.total_initial, 0) else 0 end as procent
  from ret r
  join tot t on t.cohort_m = r.cohort_m
  where is_admin()
  order by r.cohort_m, r.k;
$$;

grant execute on function get_retentie_cohorte(uuid) to authenticated;

create or replace function get_durata_medie_ltv(p_locatie uuid default null)
returns table (
  durata_medie_luni numeric,
  ltv_mediu         numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with prez as (
    select p.client,
           min(date_trunc('month', p.data)) as m0,
           max(date_trunc('month', p.data)) as m1
    from prezente p
    join enrollments e on e.id = p.enrollment
    join cursuri c on c.id = e.cursul
    where p.status = 'Prezent'
      and coalesce(c.facultativ, false) = false
      and p.client is not null
      and p.data is not null
      and (p_locatie is null or c.locatie = p_locatie)
    group by p.client
  ),
  durata as (
    select client,
           (extract(year from age(m1, m0)) * 12 + extract(month from age(m1, m0)) + 1)::numeric as luni
    from prez
  ),
  ltv as (
    select i.client, sum(i.suma) as total
    from incasari i
    where i.client is not null
    group by i.client
  )
  select
    round(avg(d.luni), 1) as durata_medie_luni,
    case when is_admin() then round(avg(coalesce(l.total, 0)), 0) else null end as ltv_mediu
  from durata d
  left join ltv l on l.client = d.client;
$$;

grant execute on function get_durata_medie_ltv(uuid) to authenticated;
