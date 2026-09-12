-- Capacitatea grupei devine numitorul KPI-ului de ocupare din grila de salarizare
-- (docs/grila-salarizare-instructori.md §2: ocupare_standard = 6 × mărime,
-- ocupare_maxim = 8 × mărime + 20), deci nu mai poate fi un număr liber. Valorile
-- moștenite erau incoerente chiar în aceeași sală — Ștefan Sala 2 avea grupe
-- declarate cu 10, 12, 13, 14, 15 ȘI 30 de locuri — adică aceeași ocupare reală ar
-- fi plătit diferit de la o grupă la alta.
--
-- Decizia Alex (12 sept. 2026): capacitatea se presetează pe 5 trepte
-- (10 / 15 / 20 / 25 / 30), iar standardul e al SĂLII:
--   Galeriile Ștefan cel Mare · Sala 1 („studio 1") = 25  (fizic încap uneori 30)
--   Galeriile Ștefan cel Mare · Sala 2 („studio 2") = 10
--   Nicolina                                        = 20
--   Quasar 4 Kids                                   = 15
--
-- Grupele care au deja mai mulți înscriși decât noua capacitate ÎȘI PĂSTREAZĂ
-- înrolările: capacitatea nu e un gard la înrolare (EnrollmentForm doar avertizează
-- „Curs plin", override permis), deci backfill-ul nu poate pierde cursanți.

-- 1) Standardul sălii. `sali.capacitate` era 0 pe toate cele 4 rânduri, deci nu
--    putea servi nici ca sursă de adevăr, nici ca valoare implicită în formular.
update sali s
   set capacitate = v.cap
  from (values
          ('Sala 1',        25),
          ('Sala 2',        10),
          ('Nicolina',      20),
          ('Quasar 4 Kids', 15)
        ) as v(nume, cap)
 where s.nume = v.nume
   and coalesce(s.capacitate, 0) <> v.cap;

-- 2a) Cursurile cu sală setată primesc standardul sălii. Acoperă toate sezoanele:
--     capacitatea e o proprietate a sălii, nu a sezonului, iar simulările de
--     ocupare pe istoric citesc același câmp.
update cursuri c
   set capacitate_maxima = s.capacitate
  from sali s
 where c.sala = s.id
   and s.capacitate > 0
   and coalesce(c.capacitate_maxima, 0) <> s.capacitate;

-- 2b) Cursurile fără sală, dar cu locație, acolo unde locația are exact o sală
--     (Nicolina, Quasar 4 Kids). La Ștefan există două săli cu standarde diferite,
--     deci fără `sala` nu se poate decide — rămân pe ce au.
update cursuri c
   set capacitate_maxima = u.cap
  from (select s.locatie, max(s.capacitate) as cap
          from sali s
         where s.capacitate > 0
           and s.locatie is not null
         group by s.locatie
        having count(*) = 1) u
 where c.sala is null
   and c.locatie = u.locatie
   and coalesce(c.capacitate_maxima, 0) <> u.cap;

comment on column cursuri.capacitate_maxima is 'Marimea grupei, presetata pe 5 trepte: 10/15/20/25/30. Standardul vine din sali.capacitate (Sala 1=25, Sala 2=10, Nicolina=20, Quasar 4 Kids=15). E numitorul KPI-ului de ocupare din grila de salarizare, deci nu se pune pe valori libere. Verificare: node scripts/check-capacitate-grupe.mjs';

comment on column sali.capacitate is 'Capacitatea standard a salii = valoarea presetata pentru grupele tinute acolo (implicita in formularul de curs).';
