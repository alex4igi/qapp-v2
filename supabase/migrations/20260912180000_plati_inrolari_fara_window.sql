-- Qapp v2 — view-urile de datorii fără `row_number() OVER ()`: filtrul coboară pe index.
--
-- Simptom (Alex, 2026-09-12): Dashboard-ul „se încarcă foarte greu". Măsurat pe live:
-- KPI-ul „Restanțieri azi" trimite 14 cereri paralele pe `plati_inrolari` (una per grupă
-- a zilei), fiecare 7–16 s; 5 din 14 pică cu statement_timeout (8 s), React Query le
-- reia, pagina se liniștește la ~29 s. Graficul (`restante_curs_luna`) la fel: 6–10 s.
-- pg_stat_statements: interogarea per grupă = ~34.600 apeluri × 2,3–4,3 s ≈ 28 h de CPU,
-- cel mai mare consumator al bazei.
--
-- Cauza: prima coloană a view-ului era `row_number() OVER () AS id`. O funcție-fereastră
-- fără PARTITION BY interzice coborârea oricărui predicat sub ea (Postgres nu poate
-- aplica `id_curs = X` înainte de a numerota TOATE rândurile), deci fiecare cerere face
-- join + group by peste toate cele ~46k înrolări × 55k încasări și abia apoi filtrează.
--
-- EXPLAIN ANALYZE, aceeași interogare (o grupă, sezonul curent), pe datele reale:
--   cu row_number():   1.614 ms — seq scan enrollments + incasari + clienti, sort pe disc
--   cu id = e.id:          9 ms — index scan idx_enrollments_cursul, 7 rânduri
--   graficul (14 grupe, luna curentă): 6–10 s → 24 ms
--
-- Ce se schimbă: DOAR coloana `id`. `plati_inrolari.id` = `e.id` (uuid, = id_enrollment;
-- rândurile sunt oricum unice per înrolare). `restante_*_luna.id` = text compus din cheia
-- de grupare + luna. Toate celelalte coloane, predicatul canonic (20260824180000) și
-- ordinea implicită rămân identice — verificat: nimeni (app sau cele 13 funcții DB care
-- citesc view-ul) nu folosește `id`. Definițiile sunt copiate din DB-ul live
-- (pg_get_viewdef), nu din migrațiile vechi.
--
-- `create or replace view` nu poate schimba tipul unei coloane, deci drop + create în
-- ordinea dependențelor (restante_* și statistica depind de plati_inrolari_toate).

drop view if exists restante_curs_luna;
drop view if exists restante_locatie_luna;
drop view if exists restante_sala_luna;
drop view if exists restante_teacher_luna;
drop view if exists statistica_restante_totale;
drop view if exists plati_inrolari_toate;
drop view if exists plati_inrolari;

create view plati_inrolari as
select
  e.id as id,
  cl.id as id_cursant,
  cl.nume as nume_client,
  cl.prenume as prenume_client,
  cl.familia as id_familie,
  c.numele as nume_curs,
  c.id as id_curs,
  l.id as id_locatie,
  l.nume as nume_locatie,
  e.id as id_enrollment,
  e.data_incepere,
  e.tip_plata,
  e.suma_baza,
  e.politica_discount,
  e.voucher as id_voucher,
  v.cod_voucher,
  e.suma as total_de_plata,
  sum(i.suma) as platit,
  coalesce(e.suma, 0::numeric) - coalesce(sum(i.suma), 0::numeric) as rest,
  (e.data_incepere < (current_date - interval '2 years')) as prescris,
  max(coalesce(i.data, i.created::date)) as data_platii,
  (e.data_incepere >= (date_trunc('month', current_date::timestamptz) + interval '1 mon')::date) as viitor
from enrollments e
left join incasari i on i.inregistrare = e.id
left join clienti cl on cl.id = e.client
left join cursuri c on c.id = e.cursul
left join sali s on s.id = c.sala
left join locatii l on l.id = s.locatie
left join vouchere v on v.id = e.voucher
where e.reziliat = false
group by e.id, cl.id, c.id, l.id, v.cod_voucher
order by e.data_incepere desc;

-- Neschimbat (n-avea fereastră) — recreat doar pentru că depinde de ordinea drop-urilor.
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
  coalesce(e.suma, 0::numeric) - coalesce(sum(i.suma), 0::numeric) as rest,
  (e.data_incepere < (current_date - interval '2 years')) as prescris,
  (e.data_incepere >= (date_trunc('month', current_date::timestamptz) + interval '1 mon')::date) as viitor
from enrollments e
left join incasari i on i.inregistrare = e.id
left join cursuri c on c.id = e.cursul
left join sali s on s.id = c.sala
left join locatii l on l.id = s.locatie
group by e.id, c.id, l.id;

create view restante_curs_luna as
select
  coalesce(p.id_curs::text, '') || '|' || to_char(p.data_incepere, 'YYYY-MM') as id,
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
  coalesce(p.id_locatie::text, '') || '|' || to_char(p.data_incepere, 'YYYY-MM') as id,
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
  coalesce(s.id::text, '') || '|' || to_char(p.data_incepere, 'YYYY-MM') as id,
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
  coalesce(t.id::text, '') || '|' || to_char(p.data_incepere, 'YYYY-MM') as id,
  t.id as id_teacher,
  format('%s %s', t.prenume, t.nume) as nume_teacher,
  to_char(p.data_incepere, 'YYYY-MM') as luna,
  coalesce(sum(p.platit), 0) as total_incasat,
  sum(coalesce(p.total_de_plata, 0)) as total_de_incasat,
  coalesce(sum(p.rest) filter (where p.rest > 0 and p.reziliat = false and not p.prescris and not p.viitor), 0) as total_restant_net
from plati_inrolari_toate p
left join teacheri t on t.id = p.id_teacher
group by t.id, t.prenume, t.nume, to_char(p.data_incepere, 'YYYY-MM');

-- Neschimbat (id-ul lui e luna, nu fereastră).
create view statistica_restante_totale as
select
  to_char(p.data_incepere, 'YYYY-MM') as id,
  sum(coalesce(p.total_de_plata, 0)) as total,
  coalesce(sum(p.platit), 0) as incasat,
  coalesce(sum(p.rest) filter (where p.rest > 0 and p.reziliat = false and not p.prescris and not p.viitor), 0) as restant_net
from plati_inrolari_toate p
group by to_char(p.data_incepere, 'YYYY-MM')
order by 1 asc;

-- Drop-ul pierde opțiunile și grant-urile explicite — le punem la loc (ca în 20260911170000).
alter view plati_inrolari set (security_invoker = true);
alter view plati_inrolari_toate set (security_invoker = true);
alter view restante_curs_luna set (security_invoker = true);
alter view restante_locatie_luna set (security_invoker = true);
alter view restante_sala_luna set (security_invoker = true);
alter view restante_teacher_luna set (security_invoker = true);
alter view statistica_restante_totale set (security_invoker = true);

revoke all on plati_inrolari_toate from anon;
