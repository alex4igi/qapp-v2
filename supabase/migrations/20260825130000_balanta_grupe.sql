-- „Balanța pe grupe" — înlocuiește pe /datorii graficele „Restanțe pe vechime" și
-- „Evoluția soldului" (decizie user 2026-08-25: la datorii vechi/sezoniere toate
-- vor fi >90 zile și soldul crește constant → ambele irelevante).
--
-- Per grupă (curs din sezonul ACTIV, la locația aleasă), pentru luna selectată:
--   incasat_luna     = TOȚI banii intrați în lună de la clienții grupei (după
--                      data plății, indiferent ce lună/rată plăteau — cash-in real)
--   restant_luna     = ratele facturate pentru luna selectată, încă neplătite
--   restant_anterior = ratele neplătite din lunile DINAINTEA celei selectate,
--                      doar din sezonul curent (cursurile sunt per sezon, deci
--                      „luni anterioare ale grupei" = luni anterioare din sezon)
-- Aceleași reguli ca definiția canonică pentru restanțe (nereziliat, neprescris,
-- fără luni viitoare). One-off-urile n-au grupă → nu intră.
-- Se întorc doar grupele cu activitate (vreo bară > 0), sortate după restanță.

drop function if exists get_datorii_evolutie(uuid, int);

create function get_balanta_grupe(p_luna date, p_locatie uuid default null)
returns table (
  id_curs             uuid,
  nume_curs           text,
  nume_locatie        text,
  incasat_luna        numeric,
  restant_luna        numeric,
  restant_anterior    numeric,
  nr_clienti_restanti int
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
  grupe as (
    select c.id, c.numele, l.nume as nume_locatie
    from cursuri c
    left join sali s on s.id = c.sala
    left join locatii l on l.id = s.locatie
    where c.sezon = (select id from sezoane where stare = 'activ' limit 1)
      and (p_locatie is null or s.locatie = p_locatie)
  ),
  inc as (
    select e.cursul as id_curs, sum(i.suma) as suma
    from incasari i
    join enrollments e on e.id = i.inregistrare
    cross join m
    where e.cursul in (select id from grupe)
      and i.data >= m.start and i.data < m.fin
    group by e.cursul
  ),
  rest as (
    select pi.id_curs,
      coalesce(sum(pi.rest) filter (where pi.data_incepere >= m.start and pi.data_incepere < m.fin), 0) as restant_luna,
      coalesce(sum(pi.rest) filter (where pi.data_incepere < m.start), 0) as restant_anterior,
      count(distinct pi.id_cursant) filter (where pi.data_incepere < m.fin)::int as nr_clienti
    from plati_inrolari pi
    cross join m
    where pi.id_curs in (select id from grupe)
      and pi.rest > 0 and not pi.prescris and not pi.viitor
    group by pi.id_curs
  )
  select
    g.id,
    g.numele,
    g.nume_locatie,
    coalesce(inc.suma, 0),
    coalesce(rest.restant_luna, 0),
    coalesce(rest.restant_anterior, 0),
    coalesce(rest.nr_clienti, 0)
  from grupe g
  left join inc on inc.id_curs = g.id
  left join rest on rest.id_curs = g.id
  where auth_role() in ('owner', 'admin', 'manager', 'front_desk')
    and coalesce(inc.suma, 0) + coalesce(rest.restant_luna, 0) + coalesce(rest.restant_anterior, 0) > 0
  order by coalesce(rest.restant_luna, 0) + coalesce(rest.restant_anterior, 0) desc, g.numele;
$$;

revoke execute on function get_balanta_grupe(date, uuid) from anon, public;
grant execute on function get_balanta_grupe(date, uuid) to authenticated;
