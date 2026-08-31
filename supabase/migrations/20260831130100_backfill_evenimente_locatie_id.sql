-- Backfill `evenimente.locatie_id` din textul liber `locatia`.
-- Cele 16 clase demo „Back to Dance School" (7-11 sept) NU se sterg si NU se
-- re-seedeaza — doar se completeaza. Restul campurilor noi (sala, varsta, stil,
-- curs_tinta, capacitate, durata_min) raman NULL, se completeaza din UI.
--
-- `unaccent` nu e instalat pe proiect (verificat 2026-08-31), deci normalizarea
-- diacriticelor se face cu translate(). Echivalentul SQL al `matchLocatieId`
-- din src/lib/lookups.ts.

create or replace function _norm_locatie(txt text)
returns text
language sql immutable
as $$
  select lower(trim(translate(coalesce(txt, ''),
    'ăâîșşțţĂÂÎȘŞȚŢ', 'aaisstt' || 'AAISSTT')));
$$;

-- Pasul 1 — potrivire exacta. Acopera 16 din 17 evenimente.
update evenimente e
   set locatie_id = l.id
  from locatii l
 where e.locatie_id is null
   and e.locatia is not null
   and l.nume = e.locatia;

-- Pasul 2 — potrivire normalizata pe substring, DOAR cand rezultatul e unic.
-- („Stefan cel Mare" -> „Galeriile Stefan cel Mare")
do $$
declare
  r record;
  v_id uuid;
  v_n  int;
begin
  for r in
    select id, locatia from evenimente
     where locatie_id is null and locatia is not null and btrim(locatia) <> ''
  loop
    select count(*), (array_agg(l.id))[1] into v_n, v_id
      from locatii l
     where _norm_locatie(l.nume) like '%' || _norm_locatie(r.locatia) || '%'
        or _norm_locatie(r.locatia) like '%' || _norm_locatie(l.nume) || '%';
    if v_n = 1 then
      update evenimente set locatie_id = v_id where id = r.id;
    else
      raise notice 'locatie nepotrivita (% potriviri): eveniment % -> "%"', v_n, r.id, r.locatia;
    end if;
  end loop;
end $$;

-- Campania celor 16 sloturi, dupa marcajul lasat de scriptul de seed in `notite`.
-- Daca randul de campanie nu exista, se lasa NULL — nu cream campanii dintr-o
-- migratie (verificat 2026-08-31: „Back to Dance School" nu exista inca).
update evenimente
   set campanie = (select id from campanii_promovare where nume ilike 'Back to Dance School%' limit 1)
 where campanie is null
   and notite like 'Campanie: quasardance.ro/back-to-dance-school%'
   and exists (select 1 from campanii_promovare where nume ilike 'Back to Dance School%');

drop function _norm_locatie(text);
