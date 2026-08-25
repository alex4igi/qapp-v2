-- Fix get_datorii_dashboard: „FULL JOIN is only supported with merge-joinable
-- or hash-joinable join conditions" — full outer join pe `is not distinct from`
-- (uuid nullabil) nu se poate planifica. Restructurat pe UNION ALL + GROUP BY
-- (group by tratează NULL ca o singură grupă), iar join-ul la datornici e pe
-- egalitate de text coalesce-uit (hash-joinable). Semantică identică.

create or replace function get_datorii_dashboard(p_locatie uuid default null)
returns table (
  id_locatie    uuid,
  nume_locatie  text,
  de_incasat    numeric,
  incasat       numeric,
  rest_net      numeric,
  rest_oneoff   numeric,
  rest_prescris numeric,
  nr_datornici  int
)
language sql
stable
security invoker
set search_path = public
as $$
  with enr as (
    select pi.id_locatie, pi.nume_locatie, pi.id_cursant as client,
           pi.total_de_plata, pi.platit, pi.rest, pi.prescris, pi.viitor
    from plati_inrolari pi
    where (p_locatie is null or pi.id_locatie = p_locatie)
  ),
  oneoff as (
    select dr.locatie as id_locatie, l.nume as nume_locatie, dr.client,
           dr.suma_datorata, dr.platit, dr.rest
    from datorii_rest dr
    left join locatii l on l.id = dr.locatie
    where (p_locatie is null or dr.locatie = p_locatie)
  ),
  unite as (
    select id_locatie, nume_locatie,
      coalesce(sum(total_de_plata) filter (where not prescris and not viitor), 0) as de_incasat,
      coalesce(sum(platit)         filter (where not prescris and not viitor), 0) as incasat,
      coalesce(sum(rest) filter (where rest > 0 and not prescris and not viitor), 0) as rest_net,
      0::numeric as rest_oneoff,
      coalesce(sum(rest) filter (where rest > 0 and prescris), 0) as rest_prescris
    from enr group by id_locatie, nume_locatie
    union all
    select id_locatie, nume_locatie,
      coalesce(sum(suma_datorata), 0),
      coalesce(sum(platit), 0),
      0::numeric,
      coalesce(sum(rest) filter (where rest > 0), 0),
      0::numeric
    from oneoff group by id_locatie, nume_locatie
  ),
  agg as (
    select u.id_locatie,
      coalesce(max(u.nume_locatie), 'Fără locație') as nume_locatie,
      sum(u.de_incasat) as de_incasat,
      sum(u.incasat) as incasat,
      sum(u.rest_net) as rest_net,
      sum(u.rest_oneoff) as rest_oneoff,
      sum(u.rest_prescris) as rest_prescris
    from unite u
    group by u.id_locatie
  ),
  datornici as (
    select id_locatie, count(distinct client)::int as nr
    from (
      select id_locatie, client from enr where rest > 0 and not prescris and not viitor
      union
      select id_locatie, client from oneoff where rest > 0
    ) x
    group by id_locatie
  )
  select
    a.id_locatie,
    a.nume_locatie,
    a.de_incasat,
    a.incasat,
    a.rest_net,
    a.rest_oneoff,
    a.rest_prescris,
    coalesce(d.nr, 0) as nr_datornici
  from agg a
  left join datornici d
    on coalesce(d.id_locatie::text, '') = coalesce(a.id_locatie::text, '')
  where auth_role() in ('owner', 'admin', 'manager', 'front_desk')
  order by a.rest_net + a.rest_oneoff desc;
$$;

revoke execute on function get_datorii_dashboard(uuid) from anon, public;
grant execute on function get_datorii_dashboard(uuid) to authenticated;
