-- Cele trei cozi de SMS rulau ca trei joburi pg_cron separate, toate pe '* * * * *'.
-- Porneau in aceeasi secunda, pg_cron ramanea fara background workers si cadeau ~5% din
-- tick-uri cu 'job startup timeout' (1.548 esecuri in 7 zile). Nu se pierdeau SMS-uri —
-- minutul urmator prindea coada — dar intarzierile erau reale.
--
-- Comasate intr-un singur job: un worker pe minut in loc de trei.
--
-- Apelurile stau intr-o FUNCTIE, nu inline in comanda cron-ului, si asta conteaza mai mult
-- decat pare: cron.job_run_details stocheaza comanda completa la FIECARE rulare. Varianta
-- inline (trei net.http_post, deci cheia anon de trei ori) ar fi dat ~4,8 KB pe rand ×
-- 1.440 rulari/zi = exact cat consuma cele trei joburi separate. Cu wrapper, randul are
-- ~100 de octeti: logul scade de ~50x. Vezi 20260824100000_igiena_loguri_cron_pgnet.sql.
--
-- Deliberat FARA pg_sleep intre apeluri: net.http_post nu trimite nimic, doar face insert
-- in net.http_request_queue, iar workerul pg_net vede randurile abia la COMMIT. Toate trei
-- pleaca simultan indiferent de sleep, iar sleep-ul ar tine ocupat fix workerul care lipsea.
-- Daca vreodata chiar trebuie decalate, singura cale reala e pe scheduleuri diferite
-- (0-59/3, 1-59/3, 2-59/3), cu pretul latentei de pana la 3 minute pe coada.
--
-- Cheia anon e publica (RLS protejeaza datele; functiile au verify_jwt=false), la fel ca in
-- migratiile 20260629170100 / 20260629230100.

create or replace function proceseaza_cozi_sms()
returns void
language plpgsql
as $fn$
declare
  v_hdr jsonb := jsonb_build_object(
    'Content-Type', 'application/json',
    'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZnR4a3d2b2JvcWFoenNsZGNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MjA0MzYsImV4cCI6MjA5NDI5NjQzNn0.qmNmi-M0zOLWJ82Y9jFUDAJxLCfvJW0HV51ss6Pe59w',
    'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZnR4a3d2b2JvcWFoenNsZGNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MjA0MzYsImV4cCI6MjA5NDI5NjQzNn0.qmNmi-M0zOLWJ82Y9jFUDAJxLCfvJW0HV51ss6Pe59w'
  );
  v_fn  text;
begin
  foreach v_fn in array array['process-programare-sms', 'process-review-sms', 'process-sms-amanate']
  loop
    perform net.http_post(
      url     := 'https://cbftxkwvoboqahzsldcp.supabase.co/functions/v1/' || v_fn,
      headers := v_hdr,
      body    := '{}'::jsonb
    );
  end loop;
end;
$fn$;

revoke execute on function proceseaza_cozi_sms() from anon, public;

select cron.unschedule(jobid) from cron.job
  where jobname in ('process-programare-sms', 'process-review-sms', 'process-sms-amanate');

select cron.unschedule('process-sms-cozi')
  where exists (select 1 from cron.job where jobname = 'process-sms-cozi');

select cron.schedule('process-sms-cozi', '* * * * *', $$select proceseaza_cozi_sms()$$);
