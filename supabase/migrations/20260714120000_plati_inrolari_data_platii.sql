-- Pagina /plati afișa doar data_incepere (ziua 1 a lunii facturate), fără nicio
-- dată de încasare. Adăugăm `data_platii` = data ultimei încasări pe înrolare
-- (fallback pe created când `data` lipsește); null = nimic încasat încă.
-- Definiția de bază e cea din 20260622110000 (verificată identică pe remote).

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
  v.cod_voucher,
  e.suma as total_de_plata,
  sum(i.suma) as platit,
  coalesce(e.suma, 0) - coalesce(sum(i.suma), 0) as rest,
  -- prescris: scadența ratei (≈ data_incepere) e mai veche de 2 ani
  (e.data_incepere < (current_date - interval '2 years')) as prescris,
  max(coalesce(i.data, i.created::date)) as data_platii
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

alter view plati_inrolari set (security_invoker = true);
