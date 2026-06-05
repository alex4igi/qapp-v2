-- Qapp v2 — fix view-uri restanțe: dublare sumă la LEFT JOIN incasari + exclude înrolări rezilizate
--
-- Cauza bug: SELECT sum(e.suma) ... FROM enrollments e LEFT JOIN incasari i ON i.inregistrare = e.id
-- multiplică e.suma de N ori (N = nr plăți per înrolare), umflând „total de încasat".
--
-- Fix: agregat separat enrollments și incasari pe cheia de grupare, apoi LEFT JOIN pe agregate.
-- Adăugare: exclude e.reziliat = true (consistent cu plati_inrolari) — o înrolare rezilată
-- nu mai e datorie / sold de plată.

-- Folosim DROP + CREATE pentru că schimbarea formei SELECT-ului depășește restricțiile
-- lui CREATE OR REPLACE VIEW. Re-setăm security_invoker la final.

drop view if exists restante_curs_luna;
drop view if exists restante_locatie_luna;
drop view if exists restante_sala_luna;
drop view if exists restante_teacher_luna;
drop view if exists statistica_restante_totale;

-- ============================================================
-- restante_curs_luna
-- ============================================================
create view restante_curs_luna as
with enroll_totale as (
  select
    c.id as id_curs,
    c.numele as nume_curs,
    to_char(e.data_incepere, 'YYYY-MM') as luna,
    sum(coalesce(e.suma, 0)) as total_de_incasat
  from enrollments e
  left join cursuri c on c.id = e.cursul
  where e.reziliat = false
  group by c.id, c.numele, to_char(e.data_incepere, 'YYYY-MM')
),
incasari_totale as (
  select
    c.id as id_curs,
    to_char(e.data_incepere, 'YYYY-MM') as luna,
    sum(i.suma) as total_incasat
  from incasari i
  join enrollments e on e.id = i.inregistrare
  left join cursuri c on c.id = e.cursul
  where e.reziliat = false
  group by c.id, to_char(e.data_incepere, 'YYYY-MM')
)
select
  row_number() over () as id,
  et.id_curs,
  et.nume_curs,
  et.luna,
  coalesce(it.total_incasat, 0) as total_incasat,
  et.total_de_incasat
from enroll_totale et
left join incasari_totale it
  on it.id_curs is not distinct from et.id_curs
 and it.luna = et.luna;

-- ============================================================
-- restante_locatie_luna
-- ============================================================
create view restante_locatie_luna as
with enroll_totale as (
  select
    l.id as id_locatie,
    l.nume as nume_locatie,
    to_char(e.data_incepere, 'YYYY-MM') as luna,
    sum(coalesce(e.suma, 0)) as total_de_incasat
  from enrollments e
  left join cursuri c on c.id = e.cursul
  left join sali s on s.id = c.sala
  left join locatii l on l.id = s.locatie
  where e.reziliat = false
  group by l.id, l.nume, to_char(e.data_incepere, 'YYYY-MM')
),
incasari_totale as (
  select
    l.id as id_locatie,
    to_char(e.data_incepere, 'YYYY-MM') as luna,
    sum(i.suma) as total_incasat
  from incasari i
  join enrollments e on e.id = i.inregistrare
  left join cursuri c on c.id = e.cursul
  left join sali s on s.id = c.sala
  left join locatii l on l.id = s.locatie
  where e.reziliat = false
  group by l.id, to_char(e.data_incepere, 'YYYY-MM')
)
select
  row_number() over () as id,
  et.id_locatie,
  et.nume_locatie,
  et.luna,
  coalesce(it.total_incasat, 0) as total_incasat,
  et.total_de_incasat
from enroll_totale et
left join incasari_totale it
  on it.id_locatie is not distinct from et.id_locatie
 and it.luna = et.luna;

-- ============================================================
-- restante_sala_luna
-- ============================================================
create view restante_sala_luna as
with enroll_totale as (
  select
    s.id as id_sala,
    s.nume as nume_sala,
    to_char(e.data_incepere, 'YYYY-MM') as luna,
    sum(coalesce(e.suma, 0)) as total_de_incasat
  from enrollments e
  left join cursuri c on c.id = e.cursul
  left join sali s on s.id = c.sala
  where e.reziliat = false
  group by s.id, s.nume, to_char(e.data_incepere, 'YYYY-MM')
),
incasari_totale as (
  select
    s.id as id_sala,
    to_char(e.data_incepere, 'YYYY-MM') as luna,
    sum(i.suma) as total_incasat
  from incasari i
  join enrollments e on e.id = i.inregistrare
  left join cursuri c on c.id = e.cursul
  left join sali s on s.id = c.sala
  where e.reziliat = false
  group by s.id, to_char(e.data_incepere, 'YYYY-MM')
)
select
  row_number() over () as id,
  et.id_sala,
  et.nume_sala,
  et.luna,
  coalesce(it.total_incasat, 0) as total_incasat,
  et.total_de_incasat
from enroll_totale et
left join incasari_totale it
  on it.id_sala is not distinct from et.id_sala
 and it.luna = et.luna;

-- ============================================================
-- restante_teacher_luna
-- ============================================================
create view restante_teacher_luna as
with enroll_totale as (
  select
    t.id as id_teacher,
    format('%s %s', t.prenume, t.nume) as nume_teacher,
    to_char(e.data_incepere, 'YYYY-MM') as luna,
    sum(coalesce(e.suma, 0)) as total_de_incasat
  from enrollments e
  left join cursuri c on c.id = e.cursul
  left join teacheri t on t.id = c.teacher
  where e.reziliat = false
  group by t.id, t.prenume, t.nume, to_char(e.data_incepere, 'YYYY-MM')
),
incasari_totale as (
  select
    t.id as id_teacher,
    to_char(e.data_incepere, 'YYYY-MM') as luna,
    sum(i.suma) as total_incasat
  from incasari i
  join enrollments e on e.id = i.inregistrare
  left join cursuri c on c.id = e.cursul
  left join teacheri t on t.id = c.teacher
  where e.reziliat = false
  group by t.id, to_char(e.data_incepere, 'YYYY-MM')
)
select
  row_number() over () as id,
  et.id_teacher,
  et.nume_teacher,
  et.luna,
  coalesce(it.total_incasat, 0) as total_incasat,
  et.total_de_incasat
from enroll_totale et
left join incasari_totale it
  on it.id_teacher is not distinct from et.id_teacher
 and it.luna = et.luna;

-- ============================================================
-- statistica_restante_totale (KPI Dashboard)
-- ============================================================
create view statistica_restante_totale as
with enroll_totale as (
  select
    to_char(e.data_incepere, 'YYYY-MM') as luna,
    sum(coalesce(e.suma, 0)) as total
  from enrollments e
  where e.reziliat = false
  group by to_char(e.data_incepere, 'YYYY-MM')
),
incasari_totale as (
  select
    to_char(e.data_incepere, 'YYYY-MM') as luna,
    sum(i.suma) as incasat
  from incasari i
  join enrollments e on e.id = i.inregistrare
  where e.reziliat = false
  group by to_char(e.data_incepere, 'YYYY-MM')
)
select
  et.luna as id,
  et.total,
  coalesce(it.incasat, 0) as incasat
from enroll_totale et
left join incasari_totale it on it.luna = et.luna
order by et.luna asc;

-- ============================================================
-- security_invoker (re-setare după DROP)
-- ============================================================
alter view restante_curs_luna set (security_invoker = true);
alter view restante_locatie_luna set (security_invoker = true);
alter view restante_sala_luna set (security_invoker = true);
alter view restante_teacher_luna set (security_invoker = true);
alter view statistica_restante_totale set (security_invoker = true);
