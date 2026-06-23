-- Qapp v2 — Revert Balanță la regula canonică: datoria EXCLUDE reziliatele.
--
-- Context: regula de contract (confirmată de user) — nu se poate rezilia o înrolare cu datorie.
-- Deci o înrolare reziliată NU are datorie validă; reziduurile pe reziliate sunt anomalii de
-- date, nu restanță. Migrațiile 20260623220000/230000/240000 (din aceeași zi) au inclus
-- reziliate-cu-plată în balanță — inconsistent cu plati_inrolari, statistica_restante_totale
-- și toate suprafețele de recuperare, care exclud reziliatele.
--
-- Aliniem balanța la baza canonică: `where e.reziliat = false` (ca în 20260623150000).

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
