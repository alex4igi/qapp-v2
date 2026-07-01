-- pg_cron zilnic 09:00 UTC (12:00 RO) → process-contract-reminders:
-- remindere la 3/7 zile pentru contracte nesemnate + expirare linkuri.
-- SMS-urile intră în coada situatie_sms_uri (quiet hours respectate acolo).
create extension if not exists pg_net;

select cron.unschedule(jobid)
  from cron.job where jobname = 'process-contract-reminders';

select cron.schedule(
  'process-contract-reminders',
  '0 9 * * *',
  $$
  select net.http_post(
    url := 'https://cbftxkwvoboqahzsldcp.supabase.co/functions/v1/process-contract-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZnR4a3d2b2JvcWFoenNsZGNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MjA0MzYsImV4cCI6MjA5NDI5NjQzNn0.qmNmi-M0zOLWJ82Y9jFUDAJxLCfvJW0HV51ss6Pe59w',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZnR4a3d2b2JvcWFoenNsZGNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MjA0MzYsImV4cCI6MjA5NDI5NjQzNn0.qmNmi-M0zOLWJ82Y9jFUDAJxLCfvJW0HV51ss6Pe59w'
    ),
    body := '{}'::jsonb
  );
  $$
);
