-- Lead-uri „Deja client": clienți curenți (activi sau ex) care completează un
-- formular de intake (ex. Meta Lead Ads „for fun") nu trebuie tratați ca leaduri
-- reci. Marcajul e o coloană dedicată — distinctă de id_client (care se setează
-- și la conversie / ex-client-nurture) și persistentă (sub_status e resetat de
-- cron-uri, deci nu poate ține marcajul).
alter table leads
  add column if not exists deja_client boolean not null default false;

-- Backfill idempotent pentru leadurile deja intrate ca 'nou' fără id_client:
-- potrivește pe telefon (stocat normalizat +40…) sau email (case-insensitive),
-- oglindind findMatchingClient. Restrâns la status='nou' ca să nu atingem
-- convertit/pierdut/nurture. Re-rularea nu modifică rânduri (deja_client=false
-- and id_client is null se golește după prima aplicare).
update leads l
set deja_client = true, id_client = c.id
from clienti c
where l.deja_client = false
  and l.id_client is null
  and l.status = 'nou'
  and (
    (l.telefon is not null and l.telefon = c.telefon)
    or (l.email is not null and c.email is not null
        and lower(btrim(l.email)) = lower(btrim(c.email)))
  );
