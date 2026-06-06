-- ============================================================
-- Qapp v2 — programare cron-uri pentru lead-uri
-- ============================================================
-- ATENȚIE: acest fișier NU este o migrare auto-aplicată. Rulează-l manual
-- în Supabase SQL Editor DOAR când ești gata ca automatizările să pornească:
--   • cron-morning trimite SMS reminder (stub mode până adaugi credențialele smslink)
--   • cron-evening mută leaduri automat (programat→nu_a_venit) + flaguri flag_streak
--   • cron-season-end mută waiting_list → nurture la sfârșit de sezon
--
-- Edge Functions-urile trebuie deja deployate:  supabase functions deploy
--
-- Ca să OPREȘTI cron-urile mai târziu:
--   select cron.unschedule('qapp-cron-morning-a');
--   select cron.unschedule('qapp-cron-morning-b');
--   select cron.unschedule('qapp-cron-evening');
--   select cron.unschedule('qapp-cron-season-end');
--
-- NOTĂ DST: orele sunt în UTC. cron-evening la 21:30 UTC = 23:30 EET (iarna)
-- / 00:30 EEST (vara) — după ultimul curs (max ~22:00). Acceptabil tot anul.
--
-- cron-morning țintește 10:00 ORĂ LOCALĂ (Europe/Bucharest), fix tot anul. Cum
-- pg_cron rulează în UTC, îl programăm la AMBELE ore UTC care pot fi 10:00 local
-- (07:00 vara EEST, 08:00 iarna EET); funcția are o gardă internă care lasă să
-- ruleze o singură dată, când ora locală e exact 10:00. Cealaltă invocare iese
-- fără efect. Schimbi ora din env REMINDER_HOUR_LOCAL + orele UTC de mai jos.
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- (re)programare idempotentă
select cron.unschedule('qapp-cron-morning')    where exists (select 1 from cron.job where jobname = 'qapp-cron-morning');
select cron.unschedule('qapp-cron-morning-a')  where exists (select 1 from cron.job where jobname = 'qapp-cron-morning-a');
select cron.unschedule('qapp-cron-morning-b')  where exists (select 1 from cron.job where jobname = 'qapp-cron-morning-b');
select cron.unschedule('qapp-cron-evening')    where exists (select 1 from cron.job where jobname = 'qapp-cron-evening');
select cron.unschedule('qapp-cron-season-end') where exists (select 1 from cron.job where jobname = 'qapp-cron-season-end');

-- Dimineață — remindere + review întârziat, țintind 10:00 ORA LOCALĂ.
-- Două joburi (07:00 + 08:00 UTC); garda din funcție lasă să ruleze doar cel
-- care pică pe 10:00 local (vara 07:00 UTC, iarna 08:00 UTC).
select cron.schedule(
  'qapp-cron-morning-a',
  '0 7 * * *',
  $$
  select net.http_post(
    url := 'https://cbftxkwvoboqahzsldcp.supabase.co/functions/v1/cron-morning',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'qapp-cron-morning-b',
  '0 8 * * *',
  $$
  select net.http_post(
    url := 'https://cbftxkwvoboqahzsldcp.supabase.co/functions/v1/cron-morning',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Seară 21:30 UTC (≈23:30 ora României) — mutări automate + flaguri flag_streak
select cron.schedule(
  'qapp-cron-evening',
  '30 21 * * *',
  $$
  select net.http_post(
    url := 'https://cbftxkwvoboqahzsldcp.supabase.co/functions/v1/cron-evening',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Sfârșit de sezon — zilnic 22:00 UTC; mută waiting_list → nurture după data_final
select cron.schedule(
  'qapp-cron-season-end',
  '0 22 * * *',
  $$
  select net.http_post(
    url := 'https://cbftxkwvoboqahzsldcp.supabase.co/functions/v1/cron-season-end',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Verificare: select * from cron.job;
