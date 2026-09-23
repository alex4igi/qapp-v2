-- Reconcilierea comenzilor Netopia rămase în așteptare, din oră în oră (audit 2026-09-20, 4.2).
--
-- Confirmarea plății vine DOAR prin IPN. Dacă IPN-ul se pierde, omul a plătit și în
-- aplicație nu apare nicio încasare, iar comanda rămâne 'pending' la nesfârșit.
-- Funcția `netopia-reconcile` întreabă Netopia de starea reală și procesează exact ca
-- webhookul (aceleași RPC-uri idempotente).
--
-- ⚠️ Se aplică DUPĂ deploy-ul funcției; altfel cronul lovește un 404 în fiecare oră.
-- Minutul 35 e liber: la :00 stau cronurile de zi, la */10 expirarea holdurilor OPEN.
select cron.unschedule(jobname) from cron.job where jobname = 'netopia-reconcile';

select cron.schedule(
  'netopia-reconcile',
  '35 * * * *',
  $cmd$select net.http_post(url := 'https://cbftxkwvoboqahzsldcp.supabase.co/functions/v1/netopia-reconcile', headers := cron_call_headers(), body := '{}'::jsonb);$cmd$
);
