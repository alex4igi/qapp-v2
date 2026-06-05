-- Qapp v2 — view-uri de raportare (traducere 1:1 din SQLite/PocketBase la Postgres)
-- Logica de business este păstrată identic cu v1, inclusiv particularitățile de join.

-- Clienți unici cu înrolare în luna curentă
create view clienti_unici as
select
  'current_month'::text as id,
  count(distinct client) as unique_clients,
  string_agg(distinct client::text, ',') as clients
from enrollments
where data_incepere >= date_trunc('month', now())::date
  and data_incepere <= now()::date;

-- De încasat pe lună (suma datorată din înrolări)
create view de_incasat_pe_luna as
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

-- Încasat pe lună (suma efectiv încasată)
create view incasat_pe_luna as
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

-- Încasări pe curs / lună
create view incasari_curs_luna as
select
  row_number() over () as id,
  c.id as id_curs,
  c.numele as nume_curs,
  to_char(i.data, 'YYYY-MM') as luna,
  sum(i.suma) as total
from incasari i
left join enrollments e on i.inregistrare = e.id
left join cursuri c on c.id = e.cursul
group by c.id, c.numele, to_char(i.data, 'YYYY-MM');

-- Încasări pe locație / lună
create view incasari_locatie_luna as
select
  row_number() over () as id,
  l.id as id_locatie,
  l.nume as nume_locatie,
  to_char(i.data, 'YYYY-MM') as luna,
  sum(i.suma) as total
from incasari i
left join enrollments e on i.inregistrare = e.id
left join cursuri c on c.id = e.cursul
left join sali s on s.id = c.sala
left join locatii l on l.id = s.locatie
group by l.id, l.nume, to_char(i.data, 'YYYY-MM');

-- Încasări pe sală / lună
create view incasari_sala_luna as
select
  row_number() over () as id,
  s.id as id_sala,
  s.nume as nume_sala,
  to_char(i.data, 'YYYY-MM') as luna,
  sum(i.suma) as total
from incasari i
left join enrollments e on i.inregistrare = e.id
left join cursuri c on c.id = e.cursul
left join sali s on s.id = c.sala
group by s.id, s.nume, to_char(i.data, 'YYYY-MM');

-- Încasări pe teacher / lună
create view incasari_teacher_luna as
select
  row_number() over () as id,
  t.id as id_teacher,
  format('%s %s', t.prenume, t.nume) as nume_teacher,
  to_char(i.data, 'YYYY-MM') as luna,
  sum(i.suma) as total
from incasari i
left join enrollments e on i.inregistrare = e.id
left join cursuri c on c.id = e.cursul
left join teacheri t on t.id = c.teacher
group by t.id, t.prenume, t.nume, to_char(i.data, 'YYYY-MM');

-- Clienți cu lista cursurilor la care sunt înrolați
create view inrolari_clienti as
select
  c.id,
  c.nume,
  c.prenume,
  c.email,
  c.telefon,
  c.telefonul_2,
  string_agg(distinct cu.numele, ',') as cursuri
from clienti c
left join enrollments e on e.client = c.id
left join cursuri cu on cu.id = e.cursul
group by c.id;

-- Lista clienți × curs cu ultima înrolare și ultima prezență
create view lista_clienti as
select
  l.id,
  l.id_client,
  l.nume,
  l.prenume,
  l.data_nasterii,
  l.id_curs,
  l.numele_cursului,
  l.ultima_inrolare,
  l.ultima_prezenta,
  e.id as id_inrolare,
  e.tip_plata,
  e.activ,
  e.suma,
  e.foloseste_pret_promo,
  v.cod_voucher
from (
  select
    row_number() over () as id,
    c.id as id_client,
    c.nume,
    c.prenume,
    c.data_nasterii,
    cu.id as id_curs,
    cu.numele as numele_cursului,
    max(e.data_incepere) as ultima_inrolare,
    max(p.data) as ultima_prezenta
  from enrollments e
  left join cursuri cu on e.cursul = cu.id
  left join clienti c on e.client = c.id
  left join prezente p on p.enrollment = e.id and p.status = 'Prezent'
  group by cu.id, c.id
) l
left join enrollments e
  on e.client = l.id_client
  and e.cursul = l.id_curs
  and e.data_incepere = l.ultima_inrolare
left join vouchere v on v.id = e.voucher;

-- Lista cursurilor cu teacher, sală, locație și nr. înscriși
create view lista_cursuri as
select
  c.id,
  c.numele as numele_cursului,
  c.sezon,
  c.zile,
  c.nivelul,
  count(c.id) as inscrisi,
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

-- Lista familiilor cu membrii
create view lista_familii as
select
  f.id,
  f.nume_familie,
  f.nume_reprezentant,
  f.prenume_reprezentant,
  f.email,
  f.telefon,
  f.telefon_2,
  f.observatii,
  string_agg(c.nume || ' ' || coalesce(c.prenume, ''), ',') as membri
from familii f
left join clienti c on c.familia = f.id
group by f.id;

-- Lista încasărilor cu client, curs și locație
create view lista_incasari as
select
  i.id,
  c.nume || ' ' || coalesce(c.prenume, '') as nume,
  u.numele,
  s.locatie,
  l.nume as nume_locatie,
  i.suma,
  i.metoda,
  i.observatii,
  i.data
from incasari i
left join clienti c on c.id = i.client
left join enrollments e on e.id = i.inregistrare
left join cursuri u on u.id = e.cursul
left join sali s on s.id = u.sala
left join locatii l on l.id = s.locatie;

-- Plăți per înrolare (total de plată vs. încasat)
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
  sum(i.suma) as platit
from enrollments e
left join incasari i on i.inregistrare = e.id
left join clienti cl on cl.id = e.client
left join cursuri c on c.id = e.cursul
group by e.id, cl.id, c.id
order by e.data_incepere desc;

-- Profil client (date + cursuri concatenate)
create view profil_client as
select
  t.id,
  t.prenume,
  t.nume,
  t.sexul,
  t.data_nasterii,
  t.marime_tricou,
  f.nume_familie,
  f.id as id_familie,
  t.email,
  t.telefon,
  t.telefonul_2,
  t.link_contract,
  string_agg(c.id::text, ',') as cursuri
from clienti t
left join enrollments e on e.client = t.id
left join cursuri c on c.id = e.cursul
left join familii f on f.id = t.familia
group by t.id, f.id;

-- Profil teacher (date + cursuri concatenate)
create view profil_teacher as
select
  t.id,
  t.prenume,
  t.nume,
  t.telefon,
  t.email,
  t.data_nasterii,
  t.link_contract,
  t.marime_tricou,
  t.nivelul,
  t.observatii,
  t.poza,
  string_agg(c.id::text, ',') as cursuri
from teacheri t
left join cursuri c on c.teacher = t.id
group by t.id;

-- Raport financiar detaliat (înrolare × încasare)
create view raport_financiar as
select
  row_number() over () as id,
  cl.prenume as prenume_client,
  cl.nume as nume_client,
  cl.id as id_cursant,
  f.nume_familie,
  f.id as id_familie,
  s.nume as nume_sala,
  s.id as id_sala,
  l.nume as nume_locatie,
  l.id as id_locatie,
  c.numele as nume_curs,
  c.id as id_curs,
  to_char(e.data_incepere, 'YYYY-MM-DD') as data_incepere,
  e.tip_plata,
  e.suma as total_de_plata,
  to_char(i.data, 'YYYY-MM-DD') as data_platii,
  i.suma,
  i.metoda
from enrollments e
left join incasari i on i.inregistrare = e.id
left join clienti cl on cl.id = e.client
left join familii f on f.id = cl.familia
left join cursuri c on c.id = e.cursul
left join sali s on s.id = c.sala
left join locatii l on l.id = s.locatie
order by e.data_incepere desc;

-- Raport încasări (din perspectiva încasărilor)
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
  e.data_incepere,
  to_char(i.created, 'YYYY-MM-DD') as data_platii,
  i.suma,
  i.metoda
from incasari i
left join enrollments e on i.inregistrare = e.id
left join clienti cl on cl.id = e.client
left join cursuri c on c.id = e.cursul
left join sali s on s.id = c.sala
left join locatii l on l.id = s.locatie
order by i.created desc;

-- Restanțe pe curs / lună
create view restante_curs_luna as
select
  row_number() over () as id,
  c.id as id_curs,
  c.numele as nume_curs,
  to_char(e.data_incepere, 'YYYY-MM') as luna,
  sum(i.suma) as total_incasat,
  sum(e.suma) as total_de_incasat
from enrollments e
left join cursuri c on c.id = e.cursul
left join incasari i on i.inregistrare = e.id
group by c.id, c.numele, to_char(e.data_incepere, 'YYYY-MM');

-- Restanțe pe locație / lună
create view restante_locatie_luna as
select
  row_number() over () as id,
  l.id as id_locatie,
  l.nume as nume_locatie,
  to_char(e.data_incepere, 'YYYY-MM') as luna,
  sum(i.suma) as total_incasat,
  sum(e.suma) as total_de_incasat
from enrollments e
left join cursuri c on c.id = e.cursul
left join incasari i on i.inregistrare = e.id
left join sali s on s.id = c.sala
left join locatii l on l.id = s.locatie
group by l.id, l.nume, to_char(e.data_incepere, 'YYYY-MM');

-- Restanțe pe sală / lună
create view restante_sala_luna as
select
  row_number() over () as id,
  s.id as id_sala,
  s.nume as nume_sala,
  to_char(e.data_incepere, 'YYYY-MM') as luna,
  sum(i.suma) as total_incasat,
  sum(e.suma) as total_de_incasat
from enrollments e
left join cursuri c on c.id = e.cursul
left join incasari i on i.inregistrare = e.id
left join sali s on s.id = c.sala
group by s.id, s.nume, to_char(e.data_incepere, 'YYYY-MM');

-- Restanțe pe teacher / lună
create view restante_teacher_luna as
select
  row_number() over () as id,
  t.id as id_teacher,
  format('%s %s', t.prenume, t.nume) as nume_teacher,
  to_char(e.data_incepere, 'YYYY-MM') as luna,
  sum(i.suma) as total_incasat,
  sum(e.suma) as total_de_incasat
from enrollments e
left join cursuri c on c.id = e.cursul
left join incasari i on i.inregistrare = e.id
left join teacheri t on t.id = c.teacher
group by t.id, t.prenume, t.nume, to_char(e.data_incepere, 'YYYY-MM');

-- Statistică încasări totale pe lună
create view statistica_incasari_totale as
select
  to_char(i.data, 'YYYY-MM') as id,
  sum(i.suma) as total
from incasari i
group by to_char(i.data, 'YYYY-MM')
order by id asc;

-- Statistică prezențe pe curs (cu flag achitat)
create view statistica_prezente_curs as
select
  p.id as id,
  to_char(p.data, 'YYYY-MM') as luna,
  case when i.suma = e.suma then 1 else 0 end as achitat,
  e.cursul as curs,
  s.locatie,
  c.teacher
from prezente p
left join enrollments e on e.id = p.enrollment
left join incasari i on i.inregistrare = e.id
left join cursuri c on c.id = e.cursul
left join sali s on s.id = c.sala
where p.status = 'Prezent'
order by luna asc, id asc;

-- Statistică restanțe totale pe lună
create view statistica_restante_totale as
select
  to_char(e.data_incepere, 'YYYY-MM') as id,
  sum(e.suma) as total,
  sum(i.suma) as incasat
from enrollments e
left join incasari i on i.inregistrare = e.id
group by to_char(e.data_incepere, 'YYYY-MM');
