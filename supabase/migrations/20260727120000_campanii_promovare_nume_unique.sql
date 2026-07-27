-- Curăță dublurile de campanii și blochează cauza.
--
-- Incident 23–27 iulie 2026: 674 rânduri „Meta Ads”, unul la fiecare rulare a
-- pollerelor de leads (pg_cron pull-meta-leads la 15 min + Apps Script →
-- intake-sheets-lead la 15 min). Cauza: `resolveCampanie()` căuta campania cu
-- `.maybeSingle()` și ignora `error`. Din momentul în care au existat 2 rânduri cu
-- același nume (o eroare tranzitorie de lookup pe 23.07 22:34 UTC), PostgREST a
-- răspuns eroare la fiecare căutare, codul a citit `data = null` („nu există”) și a
-- mai inserat unul — buclă auto-întreținută. Nu s-a pierdut niciun lead: toate cele
-- 494 lead-uri Meta au rămas pe campania originală, dublurile erau goale.
--
-- Aici: consolidăm pe cel mai vechi rând per nume și punem unique pe `nume`, ca
-- nicio cursă și nicio eroare de lookup să nu mai poată recrea dubluri.

create temporary table campanii_dedup as
select
  c.id,
  first_value(c.id) over (partition by c.nume order by c.created, c.id) as keep_id
from campanii_promovare c;

update leads l
set sursa = d.keep_id
from campanii_dedup d
where l.sursa = d.id
  and d.keep_id <> d.id;

update prospecti p
set campanie = d.keep_id
from campanii_dedup d
where p.campanie = d.id
  and d.keep_id <> d.id;

delete from campanii_promovare c
using campanii_dedup d
where c.id = d.id
  and d.keep_id <> d.id;

drop table campanii_dedup;

create unique index if not exists campanii_promovare_nume_unique
  on campanii_promovare (nume);
