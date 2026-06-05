-- Extinde view-ul plati_inrolari cu coloanele politicii (suma_baza, politica_discount, voucher).
-- Permite UI să afișeze breakdown: "260 brut − 26 politică = 234 RON / lună".

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
  l.id as id_locatie,
  l.nume as nume_locatie,
  e.id as id_enrollment,
  e.data_incepere,
  e.tip_plata,
  e.suma_baza,
  e.politica_discount,
  e.voucher as id_voucher,
  e.suma as total_de_plata,
  sum(i.suma) as platit,
  coalesce(e.suma, 0) - coalesce(sum(i.suma), 0) as rest
from enrollments e
left join incasari i on i.inregistrare = e.id
left join clienti cl on cl.id = e.client
left join cursuri c on c.id = e.cursul
left join sali s on s.id = c.sala
left join locatii l on l.id = s.locatie
where e.reziliat = false
group by e.id, cl.id, c.id, l.id
order by e.data_incepere desc;

alter view plati_inrolari set (security_invoker = true);
