-- Qapp v2 — două corecții:
-- 1. cursuri.zile devine array (un curs poate avea mai multe zile pe săptămână)
-- 2. lista_cursuri.inscrisi: count(e.id) în loc de count(c.id) — bug moștenit din v1
--    care raporta 1 înscris la cursurile fără niciun înrolat.

-- Recreăm view-ul (depinde de cursuri.zile)
drop view if exists lista_cursuri;

-- zile: scalar -> array de zi_saptamana
alter table cursuri
  alter column zile type zi_saptamana[]
  using (case when zile is null then null else array[zile] end);

create view lista_cursuri as
select
  c.id,
  c.numele as numele_cursului,
  c.sezon,
  c.zile,
  c.nivelul,
  count(e.id) as inscrisi,
  c.capacitate_maxima,
  i.id as id_teacher,
  i.nume,
  i.prenume,
  i.telefon,
  i.nivelul as nivel_teacher,
  s.nume as sala,
  l.nume as locatie,
  s.locatie as id_locatie,
  0 as balance
from cursuri c
left join teacheri i on c.teacher = i.id
left join sali s on s.id = c.sala
left join locatii l on l.id = s.locatie
left join enrollments e on e.cursul = c.id
group by c.id, i.id, s.id, l.id;

alter view lista_cursuri set (security_invoker = true);
