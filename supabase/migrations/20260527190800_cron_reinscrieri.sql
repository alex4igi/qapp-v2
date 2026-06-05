-- Qapp v2 — Cron pentru anulare promo reînscrieri.
-- Funcția `cancel_expired_reinscrieri()` are check intern (`extract(day) >= 16`),
-- deci e safe să o rulăm zilnic — sare dacă nu e momentul.
-- TODO din [[project-reinscrieri]] memory: cron-ul rămâne de deployat. ACUM GATA.

select cron.unschedule(jobid)
  from cron.job where jobname = 'reinscrieri-anulare-expirate';

select cron.schedule(
  'reinscrieri-anulare-expirate',
  '30 0 * * *',   -- zilnic la 00:30 UTC (după pontaj-auto-close la 00:00)
  $$select cancel_expired_reinscrieri();$$
);
