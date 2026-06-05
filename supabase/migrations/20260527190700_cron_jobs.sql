-- Qapp v2 — Cron jobs via pg_cron (extensie Postgres nativă).
-- Motivație: stack-ul e Vite SPA + Supabase, fără API routes Next.js.
-- Functiile RPC există deja în SQL, deci pg_cron le apelează direct fără HTTP.

create extension if not exists pg_cron;

-- ============================================================
-- 1) Audit digest săptămânal — marți dimineața (06:00 UTC = 09:00 RO summer / 08:00 RO winter)
--    RPC-ul `audit_digest_dispatch_weekly` e idempotent (sare dacă deja a rulat în ultimele 6 zile).
-- ============================================================
select cron.unschedule(jobid)
  from cron.job where jobname = 'audit-digest-weekly';

select cron.schedule(
  'audit-digest-weekly',
  '0 6 * * 2',   -- 2 = marți
  $$select audit_digest_dispatch_weekly();$$
);

-- ============================================================
-- 2) Pontaj auto-close — zilnic la 00:00 UTC
--    Închide toate sesiunile rămase deschise cu source='auto_midnight'.
-- ============================================================
select cron.unschedule(jobid)
  from cron.job where jobname = 'pontaj-auto-close-daily';

select cron.schedule(
  'pontaj-auto-close-daily',
  '0 0 * * *',
  $$select pontaj_auto_close_open_sessions();$$
);
