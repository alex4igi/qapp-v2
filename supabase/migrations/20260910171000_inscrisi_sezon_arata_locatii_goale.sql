-- get_clienti_inscrisi_sezon: locațiile cu 0 înscriși trebuie să APARĂ, nu să lipsească.
--
-- Varianta inițială făcea join pe înrolări, deci o locație fără niciun înscris
-- dispărea din rezultat. Exact cazul de la 10 sept. 2026: Quasar 4 Kids are 7
-- cursuri deschise pe sezonul 2026-2027 și zero înrolări pe ele — iar în grafic
-- pur și simplu nu exista, ceea ce se citește ca „n-are locația asta", nu ca
-- „e goală". O locație goală e o informație, nu o absență.
--
-- Reperul e locația care are cel puțin un curs în sezonul activ (nu orice rând
-- din `locatii`), ca să nu apară pe Overview locații care nu joacă sezonul ăsta.

create or replace function get_clienti_inscrisi_sezon()
returns table (
  locatie_id   uuid,
  locatie_nume text,
  inscrisi     integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with sezon_loc as (
    select distinct c.locatie
    from cursuri c
    join sezoane s on s.id = c.sezon and s.activ
    where c.locatie is not null
  ),
  insc as (
    select distinct e.client as client, c.locatie as locatie
    from enrollments e
    join sezoane s on s.id = e.sezon_id and s.activ
    join cursuri c on c.id = e.cursul
    where e.client is not null
      and e.data_reziliere is null
  ),
  per_locatie as (
    select loc.id as locatie_id, loc.nume as locatie_nume,
           count(distinct i.client)::int as inscrisi
    from sezon_loc sl
    join locatii loc on loc.id = sl.locatie
    left join insc i on i.locatie = loc.id
    group by loc.id, loc.nume
  ),
  total as (
    select null::uuid as locatie_id, 'Total club'::text as locatie_nume,
           count(distinct client)::int as inscrisi
    from insc
  )
  select locatie_id, locatie_nume, inscrisi from total
  union all
  select locatie_id, locatie_nume, inscrisi from per_locatie
  order by locatie_id nulls first, locatie_nume;
$$;

grant execute on function get_clienti_inscrisi_sezon() to authenticated;
revoke execute on function get_clienti_inscrisi_sezon() from anon, public;
