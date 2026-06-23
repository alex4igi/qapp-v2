-- Qapp v2 — Balanță locație/curs: exclude înrolările reziliate din datorie/încasat.
--
-- PROBLEMĂ: de_incasat_pe_luna și incasat_pe_luna (definite în 20260514100100)
-- nu filtrau reziliate. Cu ~25k înrolări reziliate (din ~60k), linia „Datorie"
-- din /statistici era umflată masiv de datorii ale unor înrolări anulate.
-- plati_inrolari și view-urile de restanțe deja folosesc `e.reziliat = false`;
-- aliniem și balanța la aceeași convenție (înrolări valide, pe luna înrolării).

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
where e.reziliat = false
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
where e.reziliat = false
group by to_char(e.data_incepere, 'YYYY-MM'), e.cursul, c.teacher, c.sala, s.locatie;

alter view de_incasat_pe_luna set (security_invoker = true);
alter view incasat_pe_luna  set (security_invoker = true);
