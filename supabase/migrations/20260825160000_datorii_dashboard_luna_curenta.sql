-- Dashboard Datorii — cifrele „de acțiune" devin cele ale LUNII CURENTE.
-- Decizie user (2026-08-25): un „rest recuperabil" cumulat, plin de datorii mai
-- vechi de un an, e descurajant și neacționabil; recuperarea se conduce (și se
-- bonusează) LUNAR. Deci:
--   • rest_luna / rest_luna_oneoff = restanța facturată în luna curentă
--   • recuperat_luna              = bani intrați în luna curentă pe datorii din
--                                   luni ANTERIOARE (inclusiv prescrise — cash
--                                   recuperat rămâne cash recuperat); înlocuiește
--                                   KPI-ul „Prescrise" cu unul încurajator
--   • de_incasat_luna             = baza ratei restanțe lunare (rest ÷ de-încasat,
--                                   aceeași formulă ca rata de pe /scorecard)
-- Totalurile cumulate (rest_net/rest_oneoff/rest_prescris) rămân în return type —
-- se afișează ca notă de subsol, nu ca titlu.
--
-- CREATE OR REPLACE nu poate schimba OUT-urile → drop + create.

drop function if exists get_datorii_dashboard(uuid);

create function get_datorii_dashboard(p_locatie uuid default null)
returns table (
  id_locatie       uuid,
  nume_locatie     text,
  de_incasat       numeric,
  incasat          numeric,
  rest_net         numeric,
  rest_oneoff      numeric,
  rest_prescris    numeric,
  nr_datornici     int,
  de_incasat_luna  numeric,
  rest_luna        numeric,
  rest_luna_oneoff numeric,
  recuperat_luna   numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with m as (
    select date_trunc('month', current_date)::date as start,
           (date_trunc('month', current_date) + interval '1 month')::date as fin
  ),
  enr as (
    select pi.id_locatie, pi.nume_locatie, pi.id_cursant as client,
           pi.data_incepere, pi.total_de_plata, pi.platit, pi.rest, pi.prescris, pi.viitor
    from plati_inrolari pi
    where (p_locatie is null or pi.id_locatie = p_locatie)
  ),
  oneoff as (
    select dr.locatie as id_locatie, l.nume as nume_locatie, dr.client,
           dr.created, dr.suma_datorata, dr.platit, dr.rest
    from datorii_rest dr
    left join locatii l on l.id = dr.locatie
    where (p_locatie is null or dr.locatie = p_locatie)
  ),
  unite as (
    select e.id_locatie, e.nume_locatie,
      coalesce(sum(e.total_de_plata) filter (where not e.prescris and not e.viitor), 0) as de_incasat,
      coalesce(sum(e.platit)         filter (where not e.prescris and not e.viitor), 0) as incasat,
      coalesce(sum(e.rest) filter (where e.rest > 0 and not e.prescris and not e.viitor), 0) as rest_net,
      0::numeric as rest_oneoff,
      coalesce(sum(e.rest) filter (where e.rest > 0 and e.prescris), 0) as rest_prescris,
      coalesce(sum(e.total_de_plata) filter (where e.data_incepere >= m.start and e.data_incepere < m.fin), 0) as de_incasat_luna,
      coalesce(sum(e.rest) filter (where e.rest > 0 and e.data_incepere >= m.start and e.data_incepere < m.fin), 0) as rest_luna,
      0::numeric as rest_luna_oneoff
    from enr e cross join m
    group by e.id_locatie, e.nume_locatie
    union all
    select o.id_locatie, o.nume_locatie,
      coalesce(sum(o.suma_datorata), 0),
      coalesce(sum(o.platit), 0),
      0::numeric,
      coalesce(sum(o.rest) filter (where o.rest > 0), 0),
      0::numeric,
      coalesce(sum(o.suma_datorata) filter (where o.created >= m.start and o.created < m.fin), 0),
      0::numeric,
      coalesce(sum(o.rest) filter (where o.rest > 0 and o.created >= m.start and o.created < m.fin), 0)
    from oneoff o cross join m
    group by o.id_locatie, o.nume_locatie
  ),
  agg as (
    select u.id_locatie,
      coalesce(max(u.nume_locatie), 'Fără locație') as nume_locatie,
      sum(u.de_incasat) as de_incasat,
      sum(u.incasat) as incasat,
      sum(u.rest_net) as rest_net,
      sum(u.rest_oneoff) as rest_oneoff,
      sum(u.rest_prescris) as rest_prescris,
      sum(u.de_incasat_luna) as de_incasat_luna,
      sum(u.rest_luna) as rest_luna,
      sum(u.rest_luna_oneoff) as rest_luna_oneoff
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
  ),
  -- Recuperat în luna curentă din datorii ANTERIOARE: încasări cu data în luna
  -- curentă, pe rate facturate înainte de luna curentă (sau datorii one-off
  -- create înainte). Locația = cea a cursului / a datoriei, ca peste tot.
  recuperat as (
    select x.id_locatie, sum(x.suma) as suma
    from (
      select l.id as id_locatie, i.suma
      from incasari i
      join enrollments e on e.id = i.inregistrare
      left join cursuri c on c.id = e.cursul
      left join sali s on s.id = c.sala
      left join locatii l on l.id = s.locatie
      cross join m
      where e.reziliat = false
        and e.data_incepere < m.start
        and coalesce(i.data, i.created::date) >= m.start
        and coalesce(i.data, i.created::date) < m.fin
      union all
      select d.locatie, i.suma
      from incasari i
      join datorii d on d.id = i.datorie
      cross join m
      where d.created < m.start
        and coalesce(i.data, i.created::date) >= m.start
        and coalesce(i.data, i.created::date) < m.fin
    ) x
    where (p_locatie is null or x.id_locatie = p_locatie)
    group by x.id_locatie
  )
  select
    a.id_locatie,
    a.nume_locatie,
    a.de_incasat,
    a.incasat,
    a.rest_net,
    a.rest_oneoff,
    a.rest_prescris,
    coalesce(d.nr, 0) as nr_datornici,
    a.de_incasat_luna,
    a.rest_luna,
    a.rest_luna_oneoff,
    coalesce(r.suma, 0) as recuperat_luna
  from agg a
  left join datornici d
    on coalesce(d.id_locatie::text, '') = coalesce(a.id_locatie::text, '')
  left join recuperat r
    on coalesce(r.id_locatie::text, '') = coalesce(a.id_locatie::text, '')
  where auth_role() in ('owner', 'admin', 'manager', 'front_desk')
  order by a.rest_luna + a.rest_luna_oneoff desc, a.rest_net + a.rest_oneoff desc;
$$;

revoke execute on function get_datorii_dashboard(uuid) from anon, public;
grant execute on function get_datorii_dashboard(uuid) to authenticated;
