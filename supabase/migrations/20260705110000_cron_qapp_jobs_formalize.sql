-- Formalizează cele 4 cron-uri care trăiau DOAR în supabase/cron-setup.sql
-- (fișier rulat manual, stare invizibilă pentru migrații / db reset). Verificat
-- 2026-07-05: toate 4 sunt deja live cu exact aceste schedule-uri, deci migrația
-- nu schimbă comportamentul — doar aduce starea sub controlul migrațiilor.
-- cron-setup.sql se șterge; istoricul complet al deciziilor (DST, gardă 10:00
-- locală) e păstrat în comentariile de mai jos.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- idempotent: unschedule dacă există, apoi schedule
select cron.unschedule('qapp-cron-morning')    where exists (select 1 from cron.job where jobname = 'qapp-cron-morning');
select cron.unschedule('qapp-cron-morning-a')  where exists (select 1 from cron.job where jobname = 'qapp-cron-morning-a');
select cron.unschedule('qapp-cron-morning-b')  where exists (select 1 from cron.job where jobname = 'qapp-cron-morning-b');
select cron.unschedule('qapp-cron-evening')    where exists (select 1 from cron.job where jobname = 'qapp-cron-evening');
select cron.unschedule('qapp-cron-season-end') where exists (select 1 from cron.job where jobname = 'qapp-cron-season-end');

-- Dimineață — remindere + review întârziat, țintind 10:00 ORA LOCALĂ (Europe/Bucharest).
-- pg_cron rulează în UTC, deci programăm AMBELE ore UTC care pot fi 10:00 local
-- (07:00 vara EEST, 08:00 iarna EET); funcția cron-morning are o gardă internă care
-- lasă să ruleze o singură dată, când ora locală e exact 10:00 (env REMINDER_HOUR_LOCAL).
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

-- Seară 21:30 UTC (≈23:30 România, după ultimul curs) — mutări automate leads
-- (programat→nu_a_venit) + flaguri flag_streak. DST: 23:30 EET iarna / 00:30 EEST vara.
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

-- Sfârșit de sezon — zilnic 22:00 UTC; mută waiting_list → nurture după data_final.
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
