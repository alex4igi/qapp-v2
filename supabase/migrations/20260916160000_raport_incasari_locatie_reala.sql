-- Locația unei încasări se lua pe lanțul înrolare → curs → sală → locație, deci
-- tot ce nu are înrolare (audiții, taxe, închirieri) rămânea cu id_locatie NULL
-- și DISPĂREA din „Raport pe zile / Per locație" — vederea implicită când ai o
-- locație de lucru setată. Ex. 5 sept 2026: raportul arăta 50 lei cash la
-- Ștefan cel Mare și 240 la Nicolina, în loc de 770 și 900 (1.380 lei de
-- audiții evaporați), în timp ce /situatie-zilnica arăta corect.
--
-- `incasari.locatie` (unde s-au luat efectiv banii) e sursa pe care o folosește
-- și situația zilnică; o punem prima, cu fallback pe locația cursului pentru
-- rândurile vechi, dinainte ca încasările să aibă locație.
-- Restul view-ului rămâne neatins (aceleași coloane, aceeași ordine).

drop view if exists raport_incasari;

create view raport_incasari as
select
  row_number() over () as id,
  cl.nume as nume_client,
  cl.id as id_cursant,
  s.nume as nume_sala,
  s.id as id_sala,
  l.nume as nume_locatie,
  coalesce(i.locatie, c.locatie, s.locatie) as id_locatie,
  c.numele as nume_curs,
  c.id as id_curs,
  t.id as id_teacher,
  coalesce(t.nume || ' ' || coalesce(t.prenume, ''), '') as nume_teacher,
  e.data_incepere,
  to_char(i.created, 'YYYY-MM-DD') as data_platii,
  i.data as data,
  i.suma,
  i.metoda,
  i.categorie
from incasari i
left join enrollments e on i.inregistrare = e.id
left join clienti cl on cl.id = e.client
left join cursuri c on c.id = e.cursul
left join sali s on s.id = c.sala
left join teacheri t on t.id = c.teacher
left join locatii l on l.id = coalesce(i.locatie, c.locatie, s.locatie)
order by i.created desc;

alter view raport_incasari set (security_invoker = true);

-- Raport financiar intern: nu are ce căuta pe cheia publică.
revoke all on raport_incasari from anon;
grant select on raport_incasari to authenticated;
