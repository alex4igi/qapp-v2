-- Rata restanțe LUNARĂ, aceeași definiție pe /datorii și pe /scorecard (decizie
-- user 2026-08-25: e cifra pe care se dau bonusurile lunare, nu poate diferi
-- între ecrane). Divergența constatată pe august: 14,6% pe /datorii vs 14,7% pe
-- /scorecard, pentru că /scorecard citea `restante_locatie_luna` = DOAR abonamente,
-- fără datoriile one-off (bilete/taxe/merch).
--
-- Soluție: o singură funcție-sursă `datorii_luna(p_luna)` (abonamente + one-off,
-- per locație), folosită și de dashboard, și de rata din scorecard. View-urile
-- `restante_*_luna` rămân neatinse (le folosesc /financiar și statisticile pe
-- alte tăieturi — nu le schimb baza sub picioare).

-- ============================================================
-- 1. Sursa unică: cifrele unei luni, per locație
-- ============================================================
create or replace function datorii_luna(p_luna date)
returns table (
  id_locatie      uuid,
  de_incasat      numeric,
  rest_abonament  numeric,
  rest_oneoff     numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with m as (
    select date_trunc('month', p_luna)::date as start,
           (date_trunc('month', p_luna) + interval '1 month')::date as fin
  ),
  unite as (
    -- Abonamente: rata e „a lunii" după luna facturată (data_incepere = ziua 1).
    select pi.id_locatie,
      coalesce(pi.total_de_plata, 0) as de_incasat,
      case when pi.rest > 0 and not pi.prescris and not pi.viitor then pi.rest else 0 end as rest_abonament,
      0::numeric as rest_oneoff
    from plati_inrolari pi cross join m
    where pi.data_incepere >= m.start and pi.data_incepere < m.fin
    union all
    -- One-off (bilet/taxă/merch): „luna" e cea în care s-a creat creanța.
    select dr.locatie,
      coalesce(dr.suma_datorata, 0),
      0::numeric,
      case when dr.rest > 0 then dr.rest else 0 end
    from datorii_rest dr cross join m
    where dr.created >= m.start and dr.created < m.fin
  )
  select u.id_locatie,
         sum(u.de_incasat),
         sum(u.rest_abonament),
         sum(u.rest_oneoff)
  from unite u
  group by u.id_locatie;
$$;

revoke execute on function datorii_luna(date) from anon, public;
grant execute on function datorii_luna(date) to authenticated;

-- ============================================================
-- 2. Dashboardul /datorii — aceleași coloane, calculate acum din sursa unică
-- ============================================================
create or replace function get_datorii_dashboard(p_locatie uuid default null)
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
  ),
  -- Recuperat în luna curentă din datorii ANTERIOARE: încasări cu data în luna
  -- curentă, pe rate facturate înainte de luna curentă (sau datorii one-off
  -- create înainte). Prescrisele intră — cash recuperat rămâne cash recuperat.
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
    coalesce(dl.de_incasat, 0) as de_incasat_luna,
    coalesce(dl.rest_abonament, 0) as rest_luna,
    coalesce(dl.rest_oneoff, 0) as rest_luna_oneoff,
    coalesce(r.suma, 0) as recuperat_luna
  from agg a
  left join datornici d
    on coalesce(d.id_locatie::text, '') = coalesce(a.id_locatie::text, '')
  left join recuperat r
    on coalesce(r.id_locatie::text, '') = coalesce(a.id_locatie::text, '')
  left join datorii_luna(current_date) dl
    on coalesce(dl.id_locatie::text, '') = coalesce(a.id_locatie::text, '')
  where auth_role() in ('owner', 'admin', 'manager', 'front_desk')
  order by coalesce(dl.rest_abonament, 0) + coalesce(dl.rest_oneoff, 0) desc,
           a.rest_net + a.rest_oneoff desc;
$$;

revoke execute on function get_datorii_dashboard(uuid) from anon, public;
grant execute on function get_datorii_dashboard(uuid) to authenticated;

-- ============================================================
-- 3. Rata restanțe pentru /scorecard — ORICE lună, aceeași bază (cu one-off).
--    Înlocuiește citirea directă a view-ului restante_locatie_luna din client.
-- ============================================================
create or replace function get_rata_restante(p_luna date, p_locatie uuid default null)
returns table (
  id_locatie uuid,
  de_incasat numeric,
  rest       numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select d.id_locatie, d.de_incasat, d.rest_abonament + d.rest_oneoff
  from datorii_luna(p_luna) d
  where (p_locatie is null or d.id_locatie = p_locatie)
    and auth_role() in ('owner', 'admin', 'manager', 'front_desk');
$$;

revoke execute on function get_rata_restante(date, uuid) from anon, public;
grant execute on function get_rata_restante(date, uuid) to authenticated;
