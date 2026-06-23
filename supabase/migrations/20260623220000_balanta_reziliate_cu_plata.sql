-- Qapp v2 — Balanță locație/curs: include reziualul înrolărilor reziliate DOAR
-- dacă s-a încasat ceva pe ele (există plată). Rafinează 20260623150000.
--
-- PROBLEMĂ: 20260623150000 excludea TOATE reziliatele (`e.reziliat = false`).
-- Asta scotea ~150k RON datorie fantomă (înrolări reziliate la care nu s-a plătit
-- nimic — `suma` plină nezerată la reziliere), dar arunca și ~18,8k RON datorie
-- REALĂ: clienți care au plătit parțial, au frecventat, au rămas datori, apoi au
-- reziliat. Acea datorie s-a creat în luna înrolării și trebuie să apară pe lună.
--
-- REGULĂ: o înrolare intră în balanță dacă (a) nu e reziliată, sau (b) e reziliată
-- DAR are cel puțin o încasare. Reziliatele fără nicio plată (fantomele) rămân afară.
-- Aceeași condiție pe ambele view-uri, ca datoria = de_incasat − incasat să fie netă.

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
where not e.reziliat
   or exists (select 1 from incasari i where i.inregistrare = e.id)
group by to_char(e.data_incepere, 'YYYY-MM'), e.cursul, c.teacher, c.sala, s.locatie;

-- incasat_pe_luna pornește din `incasari`, deci doar înrolări cu plată apar oricum;
-- reziliatele fără plată nu pot intra. Eliminăm filtrul reziliat ca reziliatele
-- cu plată să fie incluse (consistent cu de_incasat_pe_luna).
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

alter view de_incasat_pe_luna set (security_invoker = true);
alter view incasat_pe_luna  set (security_invoker = true);
