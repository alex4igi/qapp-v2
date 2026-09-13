-- Sălile de pe Ștefan cel Mare primesc prefixul locației și vocabularul „studio"
-- (decizia Alex, 14 sept. 2026): „Sala 1" → „SCM Studio 1", „Sala 2" → „SCM Studio 2".
-- Motivul prefixului: numele sălii apare singur în selectoare, pilulele de pe
-- dashboard și rapoartele „per sală", unde locația nu e vizibilă — „Sala 2" nu
-- spunea unde e, pe când „Nicolina" și „Quasar 4 Kids" se identificau singure.
--
-- Redenumirea e doar de date: nicio funcție, view sau constrângere nu leagă sala
-- prin nume (peste tot e FK pe `sali.id`), iar `src/` nu conține literalul.
-- Descrierile deja scrise pe încasări/datorii („Închiriere Sala 2 · 2026-08-21…")
-- rămân neatinse intenționat — sunt jurnalul unei tranzacții din trecut, nu
-- configurație; textele noi se compun din `sali.nume`, deci iau numele nou singure.

-- `updated` se pune singur (trg_sali_updated). Locația vine din subselect, nu din
-- join: dacă vreodată ar exista două locații „stefan", subselectul crapă în loc să
-- redenumească tăcut sala greșită.
update sali s
   set nume = v.nou
  from (values
          ('Sala 1', 'SCM Studio 1'),
          ('Sala 2', 'SCM Studio 2')
        ) as v(vechi, nou)
 where s.nume = v.vechi
   and s.locatie = (select id from locatii where nume ilike '%stefan%');

-- Comentariul de pe capacitate enumeră sălile pe nume; îl aducem la zi ca să nu
-- rămână singura urmă a denumirii vechi într-un obiect viu din schemă.
comment on column cursuri.capacitate_maxima is 'Marimea grupei, presetata pe 5 trepte: 10/15/20/25/30. Standardul vine din sali.capacitate (SCM Studio 1=25, SCM Studio 2=10, Nicolina=20, Quasar 4 Kids=15). E numitorul KPI-ului de ocupare din grila de salarizare, deci nu se pune pe valori libere. Verificare: node scripts/check-capacitate-grupe.mjs';
