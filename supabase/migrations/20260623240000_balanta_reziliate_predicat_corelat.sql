-- Qapp v2 — Corectează 20260623230000: `left join (sum incasari)` dubla rândurile
-- de plată în incasat_pe_luna (incasat umflat). Păstrăm structura exactă a view-ului
-- bun (20260623150000, care dădea sume corecte) și schimbăm DOAR predicatul:
-- în loc de `e.reziliat = false`, includem și reziliatele cu total plăți > 0,
-- printr-un subquery corelat (fără join suplimentar, deci fără dublare).

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
where not e.reziliat
   or coalesce((select sum(i.suma) from incasari i where i.inregistrare = e.id), 0) > 0
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
where not e.reziliat
   or coalesce((select sum(i2.suma) from incasari i2 where i2.inregistrare = e.id), 0) > 0
group by to_char(e.data_incepere, 'YYYY-MM'), e.cursul, c.teacher, c.sala, s.locatie;

alter view de_incasat_pe_luna set (security_invoker = true);
alter view incasat_pe_luna  set (security_invoker = true);
