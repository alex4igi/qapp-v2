-- A doua cifră de headcount pe /ansamblu: „Înscriși în sezon".
--
-- get_clienti_activi() răspunde la întrebarea „câți vin": contract care acoperă
-- ZIUA de azi SAU prezență în ultimele 21 de zile. Între sezoane cifra aia
-- trăiește exclusiv din coada de prezențe — pe 10 sept. 2026, 161 din cei 163
-- de la Ștefan intrau doar prin prezențe din 21-27 august (sezonul „Vara 2026",
-- încheiat pe 30 aug.), iar rosterul real al sezonului nou (248 de oameni) nu
-- era numărat nicăieri, pentru că acele contracte încep pe 12 sept.
--
-- Funcția asta răspunde la cealaltă întrebare, „câți am pe listă": înrolare în
-- sezonul ACTIV, nereziliată. E aceeași regulă pe care o folosește deja cronul
-- auto_mark_inactiv_si_exclient când decide dacă un client devine Inactiv
-- („fără prezență 21 zile ȘI fără înrolare în sezonul activ"), deci fișa
-- clientului și cardul de pe Overview nu se mai contrazic: cei 248 care scriu
-- „Activ" în fișă sunt exact cei numărați aici.
--
-- Rezilierea se citește din `data_reziliere`, NU din flagul `enrollments.reziliat`:
-- modelul „per lună" creează un rând pe lună și îi pune `reziliat = true` la
-- închiderea lunii, fără dată și fără motiv, deci filtrarea pe flag ar tăia
-- rosterul de câteva ori (4.183 rânduri „reziliate" pe 2025-2026, din care doar
-- 356 reale).
--
-- Fără condiție de plată — la fel ca definiția canonică de activ. Neplata e
-- treaba metricii de restanțe, nu ascunde omul din roster.

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
  with insc as (
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
    from insc i
    join locatii loc on loc.id = i.locatie
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
