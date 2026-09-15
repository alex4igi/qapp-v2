-- SMS-urile la care omul poate vrea să ne răspundă (followup „nu ai ajuns",
-- confirmarea înrolării, post_demo) se mută de la 10:00 la 16:00, luni–vineri,
-- când e cineva la sală să preia telefonul. Le trimite edge function-ul nou
-- cron-afternoon; reminderul ședinței rămâne în cron-morning, la 10:00.
--
-- pg_cron rulează în UTC, deci programăm AMBELE ore care pot fi 16:00 local
-- (13:00 vara EEST, 14:00 iarna EET); funcția are gardă pe ora locală și pe
-- weekend, deci doar una dintre rulări lucrează. Ziua 1-5 e sigură în UTC: la
-- 13:00/14:00 UTC data e aceeași ca la București.
select cron.unschedule(jobname) from cron.job
  where jobname in ('qapp-cron-afternoon-a', 'qapp-cron-afternoon-b');

select cron.schedule(
  'qapp-cron-afternoon-a',
  '0 13 * * 1-5',
  $cmd$select net.http_post(url := 'https://cbftxkwvoboqahzsldcp.supabase.co/functions/v1/cron-afternoon', headers := cron_call_headers(), body := '{}'::jsonb);$cmd$
);

select cron.schedule(
  'qapp-cron-afternoon-b',
  '0 14 * * 1-5',
  $cmd$select net.http_post(url := 'https://cbftxkwvoboqahzsldcp.supabase.co/functions/v1/cron-afternoon', headers := cron_call_headers(), body := '{}'::jsonb);$cmd$
);
