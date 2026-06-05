-- Adaugă coloanele profesorului (nume_teacher, id_teacher) la view-ul
-- raport_incasari, ca să putem filtra/grupa rapoartele financiare și pe profesor.
drop view if exists raport_incasari;

create view raport_incasari as
select
  row_number() over () as id,
  cl.nume as nume_client,
  cl.id as id_cursant,
  s.nume as nume_sala,
  s.id as id_sala,
  l.nume as nume_locatie,
  l.id as id_locatie,
  c.numele as nume_curs,
  c.id as id_curs,
  t.id as id_teacher,
  coalesce(t.nume || ' ' || coalesce(t.prenume, ''), '') as nume_teacher,
  e.data_incepere,
  to_char(i.created, 'YYYY-MM-DD') as data_platii,
  i.data as data,
  i.suma,
  i.metoda
from incasari i
left join enrollments e on i.inregistrare = e.id
left join clienti cl on cl.id = e.client
left join cursuri c on c.id = e.cursul
left join sali s on s.id = c.sala
left join locatii l on l.id = s.locatie
left join teacheri t on t.id = c.teacher
order by i.created desc;

alter view raport_incasari set (security_invoker = true);
