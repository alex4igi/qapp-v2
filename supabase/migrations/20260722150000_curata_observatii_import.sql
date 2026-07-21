-- Pasul 2 după 20260722120000: scoate liniile de metadate de import din
-- `observatii`, ca notița recepției să fie liberă.
--
-- Se rulează DOAR după deployul funcțiilor de intake pe `extern_id` — altfel
-- dedup-ul lor (care citea `observatii like '%marker%'`) ar găsi zero potriviri
-- și ar reimporta toate lead-urile Meta ca duplicate.
--
-- Se șterg exact patru forme de linie, nimic altceva:
--   „Meta Lead Ads (…) metasheet:…" / „… leadgen:…"  → mutat în extern_id
--   „Campanie: …"                                     → deja în utm_campaign
--   „Ad: …"                                           → se ia din Meta
--   „Vârstă declarată: …"                             → mutat în grupa_varsta/varsta
-- Orice altă linie (note scrise de om, răspunsuri din formular) se păstrează.

alter table leads disable trigger trg_leads_updated;

with curatat as (
  select
    id,
    nullif(
      trim(both E'\n' from (
        select string_agg(linie, E'\n')
        from unnest(string_to_array(observatii, E'\n')) as linie
        where trim(linie) !~ '^(Meta Lead Ads \(.*\) (metasheet|leadgen):|Campanie: |Ad: |V[âa]rst[ăa] declarat[ăa]: )'
          and trim(linie) <> ''
      )),
      ''
    ) as nou
  from leads
  where observatii is not null
    and (observatii ~ '(metasheet|leadgen):'
         or observatii ~ '^(Campanie|Ad|V[âa]rst[ăa] declarat[ăa]): ')
)
update leads l
set observatii = c.nou
from curatat c
where c.id = l.id
  and l.observatii is distinct from c.nou;

alter table leads enable trigger trg_leads_updated;
