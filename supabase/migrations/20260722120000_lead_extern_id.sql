-- `leads.observatii` era folosită de importurile Meta ca depozit de metadate:
-- marcajul de dedup (`metasheet:<id>` / `leadgen:<id>`), campania, numele
-- reclamei și vârsta declarată. Rezultatul: coloana „Notiță" din vederea Listă
-- arăta text de import pentru ~500 de lead-uri, exact acolo unde recepția ar
-- trebui să vadă ce s-a discutat la telefon.
--
-- Marcajul se mută într-o coloană proprie, invizibilă în UI. NU poate fi doar
-- șters: cele trei funcții de intake dedup pe el (`observatii like '%marker%'`),
-- deci fără el fiecare rulare ar reimporta toate lead-urile ca duplicate.
--
-- Această migrație NU curăță încă `observatii` — abia după ce funcțiile de
-- intake sunt deployate pe noua coloană. Altfel rămâne o fereastră în care
-- dedup-ul citește o coloană deja golită.

alter table leads add column if not exists extern_id text;

comment on column leads.extern_id is
  'ID-ul lead-ului la sursa externă (Meta: „l:123…" din sheet sau leadgen id). Cheie de deduplicare la import; nu se afișează în UI.';

-- Parțial: lead-urile manuale n-au extern_id, iar null-urile nu se ciocnesc.
create unique index if not exists leads_extern_id_uniq
  on leads (extern_id) where extern_id is not null;

-- Corecție de date, nu editare: `updated` alimentează ceasul de 10 zile din
-- cron-evening (nu_a_venit → nurture), deci nu trebuie resetat pe 500 de rânduri.
alter table leads disable trigger trg_leads_updated;

-- 1) Marcajul → extern_id.
update leads
set extern_id = substring(observatii from '(?:metasheet|leadgen):(\S+)')
where extern_id is null
  and observatii ~ '(?:metasheet|leadgen):';

-- 2) „Vârstă declarată" → câmpurile ei. E singura informație de business din
--    liniile de import; fără pasul ăsta s-ar pierde la curățare.
--    Intervalele care traversează două grupe merg la cea majoritară:
--    „11-15" → Varsity (4 ani din 5), „19-25" → Students (6 din 7).
with v as (
  select id, trim(substring(observatii from 'declarat[ăa]: *([^\n]+)')) as raw
  from leads
  where observatii ~ 'declarat[ăa]: *'
), m as (
  select id,
    case
      when raw ~ '^4-6'            then 'Tiny'
      when raw ~ '^7-10'           then 'Junior'
      when raw ~ '^11-1[45]'       then 'Varsity'
      when raw ~ '^1[56]-18'       then 'Teens'
      when raw ~ '^19-25'          then 'Students'
      when raw ~ '^25\+'           then 'Adults'
      when raw ~ '^[4-6] ani'      then 'Tiny'
      when raw ~ '^([7-9]|10) ani' then 'Junior'
      when raw ~ '^1[1-4] ani'     then 'Varsity'
      when raw ~ '^1[5-9] ani'     then 'Teens'
      when raw ~ '^2[0-5] ani'     then 'Students'
    end as grupa,
    case when raw ~ '^[0-9]{1,2} ani'
         then (substring(raw from '^([0-9]{1,2}) ani'))::int end as ani
  from v
)
update leads l
set grupa_varsta = coalesce(l.grupa_varsta, m.grupa::grupa_lead),
    varsta       = coalesce(l.varsta, m.ani)
from m
where m.id = l.id
  and (m.grupa is not null or m.ani is not null);

alter table leads enable trigger trg_leads_updated;
