-- Coada `sms_amanate` nu păstra nicio legătură cu rândul din `situatie_sms_uri` care a
-- generat-o. Drain-ul (process-sms-amanate) trimitea mesajul și marca doar rândul din
-- coadă, deci rândul din listă rămânea 'Amanat' la infinit — status terminal fals
-- (23 rânduri din 10.08.2026 apăreau „Amânat" deși plecaseră a doua zi la 10:01).
-- `sursa_id` închide bucla: drain-ul poate scrie înapoi 'Trimis'/'Esuat'.
alter table sms_amanate
  add column if not exists sursa_id uuid
    references situatie_sms_uri (id) on delete set null;

create index if not exists idx_sms_amanate_sursa on sms_amanate (sursa_id);

-- Backfill 1/2 — leagă retroactiv rândurile deja amânate de sursa lor.
-- Potrivirea telefon+mesaj e 1:1 pentru toate cele 23 (verificat pe remote înainte).
update sms_amanate a
set sursa_id = s.id
from situatie_sms_uri s
where a.sursa_id is null
  and a.tip = 'manual'
  and s.status = 'Amanat'
  and a.telefon = s.telefon
  and a.mesaj = s.mesaj;

-- Backfill 2/2 — statusul real al rândurilor din listă, din coada deja drenată.
update situatie_sms_uri s
set status = 'Trimis',
    data_trimitere = coalesce(
      (a.trimis_la at time zone 'Europe/Bucharest')::date,
      (a.send_after at time zone 'Europe/Bucharest')::date
    )
from sms_amanate a
where a.sursa_id = s.id
  and a.status = 'trimis'
  and s.status = 'Amanat';

update situatie_sms_uri s
set status = 'Esuat'
from sms_amanate a
where a.sursa_id = s.id
  and a.status = 'esuat'
  and s.status = 'Amanat';
