-- pg_cron la fiecare minut → invoca edge fn process-sms-amanate, care dreneaza
-- coada sms_amanate (SMS-uri amanate de zona interzisa). Trimite dupa ce iese din
-- fereastra; in fereastra doar re-amana. Cheia anon e publica (RLS protejeaza
-- datele; functia are verify_jwt=false). Pattern oglindit dupa cron_process_*_sms.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid)
  from cron.job where jobname = 'process-sms-amanate';

select cron.schedule(
  'process-sms-amanate',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://cbftxkwvoboqahzsldcp.supabase.co/functions/v1/process-sms-amanate',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZnR4a3d2b2JvcWFoenNsZGNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MjA0MzYsImV4cCI6MjA5NDI5NjQzNn0.qmNmi-M0zOLWJ82Y9jFUDAJxLCfvJW0HV51ss6Pe59w',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZnR4a3d2b2JvcWFoenNsZGNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MjA0MzYsImV4cCI6MjA5NDI5NjQzNn0.qmNmi-M0zOLWJ82Y9jFUDAJxLCfvJW0HV51ss6Pe59w'
    ),
    body := '{}'::jsonb
  );
  $$
);
