-- Qapp v2 — Corectează 20260623220000: predicatul de includere a reziliatelor.
--
-- 20260623220000 folosea `exists (select 1 from incasari ...)` — adică „are vreun
-- rând de încasare". Dar 2082 înrolări reziliate au rânduri de încasare care
-- ÎNSUMEAZĂ ≤ 0 (storno / plăți zerate / corecții), deci `exists` le includea și
-- reintroducea ~125k RON datorie fantomă (exact ce voiam să excludem).
--
-- REGULĂ corectă: includem reziliatul doar dacă TOTALUL plăților > 0 (s-a încasat
-- efectiv ceva). Aceeași condiție pe ambele view-uri, ca datoria să fie netă.

create or replace view de_incasat_pe_luna as
select
  row_number() over () as id,
  to_char(e.data_incepere, 'YYYY-MM') as luna,
  e.cursul as curs,
  sum(e.suma) as de_incasat,
  c.teacher,
  c.sala,
  s.locatie
from enrollments e
join cursuri c on c.id = e.cursul
join sali s on s.id = c.sala
left join (
  select inregistrare, sum(suma) as platit
  from incasari group by inregistrare
) p on p.inregistrare = e.id
where not e.reziliat or coalesce(p.platit, 0) > 0
group by to_char(e.data_incepere, 'YYYY-MM'), e.cursul, c.teacher, c.sala, s.locatie;

create or replace view incasat_pe_luna as
select
  row_number() over () as id,
  to_char(e.data_incepere, 'YYYY-MM') as luna,
  e.cursul as curs,
  sum(i.suma) as incasat,
  c.teacher,
  c.sala,
  s.locatie
from incasari i
join enrollments e on e.id = i.inregistrare
join cursuri c on c.id = e.cursul
join sali s on s.id = c.sala
left join (
  select inregistrare, sum(suma) as platit
  from incasari group by inregistrare
) p on p.inregistrare = e.id
where not e.reziliat or coalesce(p.platit, 0) > 0
group by to_char(e.data_incepere, 'YYYY-MM'), e.cursul, c.teacher, c.sala, s.locatie;

alter view de_incasat_pe_luna set (security_invoker = true);
alter view incasat_pe_luna  set (security_invoker = true);
