-- Corectură backfill „deja client": clienti.telefon e stocat inconsistent
-- (majoritatea '0…', unele '+40…'), iar leadurile vin normalizate '+40…'. Match-ul
-- pe string brut din migrația precedentă prindea aproape nimic. Comparăm ultimele
-- 9 cifre (numărul național), care e invariant la prefix (0 / +40 / 0040).
-- Idempotent: re-rularea nu atinge leadurile deja marcate.
update leads l
set deja_client = true, id_client = c.id
from clienti c
where l.deja_client = false
  and l.id_client is null
  and l.status = 'nou'
  and (
    (l.telefon is not null and c.telefon is not null
      and length(regexp_replace(l.telefon, '\D', '', 'g')) >= 9
      and right(regexp_replace(l.telefon, '\D', '', 'g'), 9)
        = right(regexp_replace(c.telefon, '\D', '', 'g'), 9))
    or (l.email is not null and c.email is not null
      and lower(btrim(l.email)) = lower(btrim(c.email)))
  );
