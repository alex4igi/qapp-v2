-- Qapp v2 — exclude înrolările rezilizate din view-ul plati_inrolari.
-- O înrolare rezilizată nu mai este o datorie / sold de plată, deci nu trebuie
-- să apară în lista de plăți. Rămâne în tabela enrollments pentru a bloca
-- re-înrolarea automată în același sezon.
drop view if exists plati_inrolari;

create view plati_inrolari as
select
  row_number() over () as id,
  cl.id as id_cursant,
  cl.nume as nume_client,
  cl.prenume as prenume_client,
  cl.familia as id_familie,
  c.numele as nume_curs,
  c.id as id_curs,
  e.id as id_enrollment,
  e.data_incepere,
  e.tip_plata,
  e.suma as total_de_plata,
  sum(i.suma) as platit,
  coalesce(e.suma, 0) - coalesce(sum(i.suma), 0) as rest
from enrollments e
left join incasari i on i.inregistrare = e.id
left join clienti cl on cl.id = e.client
left join cursuri c on c.id = e.cursul
where e.reziliat = false
group by e.id, cl.id, c.id
order by e.data_incepere desc;

alter view plati_inrolari set (security_invoker = true);
