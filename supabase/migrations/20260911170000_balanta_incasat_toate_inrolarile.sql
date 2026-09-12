-- Qapp v2 — Balanța lunară numără TOȚI banii încasați pe luna facturată.
--
-- Bug (Alex, 2026-09-11: „sezonul trecut aveam peste 100.000/lună, acum văd cifre
-- mult mai mici"): restante_*_luna luau total_incasat din plati_inrolari, care are
-- `where e.reziliat = false`. Dar `reziliat = true` e pus și pe fiecare lună încheiată
-- normal (fără data_reziliere) → pe 2025-2026 balanța arăta 40-65k/lună în loc de
-- 118-154k (~60% din bani lipsă). Afecta /statistici (Balanță locație/curs/profesor)
-- și chart-ul per curs din Dashboard.
--
-- Fix: încasat + de încasat pe TOATE înrolările lunii (plati_inrolari_toate).
-- Restanța netă păstrează EXACT predicatul canonic din 20260824180000
-- (rest > 0, reziliat = false, neprescris, neviitor) → /datorii, worklist, SMS neatinse.
-- plati_inrolari (sursa canonică a datoriilor) NU se schimbă.

drop view if exists restante_curs_luna;
drop view if exists restante_locatie_luna;
drop view if exists restante_sala_luna;
drop view if exists restante_teacher_luna;
drop view if exists statistica_restante_totale;

-- Același calcul per înrolare ca plati_inrolari, fără filtrul pe steagul `reziliat`.
create view plati_inrolari_toate as
select
  e.id as id_enrollment,
  c.id as id_curs,
  c.numele as nume_curs,
  c.sala as id_sala,
  c.teacher as id_teacher,
  l.id as id_locatie,
  l.nume as nume_locatie,
  e.data_incepere,
  e.reziliat,
  e.suma as total_de_plata,
  sum(i.suma) as platit,
  coalesce(e.suma, 0) - coalesce(sum(i.suma), 0) as rest,
  (e.data_incepere < (current_date - interval '2 years')) as prescris,
  (e.data_incepere >= (date_trunc('month', current_date) + interval '1 month')::date) as viitor
from enrollments e
left join incasari i on i.inregistrare = e.id
left join cursuri c on c.id = e.cursul
left join sali s on s.id = c.sala
left join locatii l on l.id = s.locatie
group by e.id, c.id, l.id;

create view restante_curs_luna as
select
  row_number() over () as id,
  p.id_curs,
  p.nume_curs,
  to_char(p.data_incepere, 'YYYY-MM') as luna,
  coalesce(sum(p.platit), 0) as total_incasat,
  sum(coalesce(p.total_de_plata, 0)) as total_de_incasat,
  coalesce(sum(p.rest) filter (where p.rest > 0 and p.reziliat = false and not p.prescris and not p.viitor), 0) as total_restant_net
from plati_inrolari_toate p
group by p.id_curs, p.nume_curs, to_char(p.data_incepere, 'YYYY-MM');

create view restante_locatie_luna as
select
  row_number() over () as id,
  p.id_locatie,
  p.nume_locatie,
  to_char(p.data_incepere, 'YYYY-MM') as luna,
  coalesce(sum(p.platit), 0) as total_incasat,
  sum(coalesce(p.total_de_plata, 0)) as total_de_incasat,
  coalesce(sum(p.rest) filter (where p.rest > 0 and p.reziliat = false and not p.prescris and not p.viitor), 0) as total_restant_net
from plati_inrolari_toate p
group by p.id_locatie, p.nume_locatie, to_char(p.data_incepere, 'YYYY-MM');

create view restante_sala_luna as
select
  row_number() over () as id,
  s.id as id_sala,
  s.nume as nume_sala,
  to_char(p.data_incepere, 'YYYY-MM') as luna,
  coalesce(sum(p.platit), 0) as total_incasat,
  sum(coalesce(p.total_de_plata, 0)) as total_de_incasat,
  coalesce(sum(p.rest) filter (where p.rest > 0 and p.reziliat = false and not p.prescris and not p.viitor), 0) as total_restant_net
from plati_inrolari_toate p
left join sali s on s.id = p.id_sala
group by s.id, s.nume, to_char(p.data_incepere, 'YYYY-MM');

create view restante_teacher_luna as
select
  row_number() over () as id,
  t.id as id_teacher,
  format('%s %s', t.prenume, t.nume) as nume_teacher,
  to_char(p.data_incepere, 'YYYY-MM') as luna,
  coalesce(sum(p.platit), 0) as total_incasat,
  sum(coalesce(p.total_de_plata, 0)) as total_de_incasat,
  coalesce(sum(p.rest) filter (where p.rest > 0 and p.reziliat = false and not p.prescris and not p.viitor), 0) as total_restant_net
from plati_inrolari_toate p
left join teacheri t on t.id = p.id_teacher
group by t.id, t.prenume, t.nume, to_char(p.data_incepere, 'YYYY-MM');

create view statistica_restante_totale as
select
  to_char(p.data_incepere, 'YYYY-MM') as id,
  sum(coalesce(p.total_de_plata, 0)) as total,
  coalesce(sum(p.platit), 0) as incasat,
  coalesce(sum(p.rest) filter (where p.rest > 0 and p.reziliat = false and not p.prescris and not p.viitor), 0) as restant_net
from plati_inrolari_toate p
group by to_char(p.data_incepere, 'YYYY-MM')
order by 1 asc;

-- Perechea veche (nefolosită de app) avea același bug — aliniată la aceeași regulă.
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
group by to_char(e.data_incepere, 'YYYY-MM'), e.cursul, c.teacher, c.sala, s.locatie;

alter view plati_inrolari_toate set (security_invoker = true);
alter view restante_curs_luna set (security_invoker = true);
alter view restante_locatie_luna set (security_invoker = true);
alter view restante_sala_luna set (security_invoker = true);
alter view restante_teacher_luna set (security_invoker = true);
alter view statistica_restante_totale set (security_invoker = true);
alter view de_incasat_pe_luna set (security_invoker = true);
alter view incasat_pe_luna set (security_invoker = true);

-- View nou: anon n-are ce căuta aici (security_invoker ar da oricum 0 rânduri prin RLS).
revoke all on plati_inrolari_toate from anon;
