-- pg_cron la fiecare 15 min → invocă edge fn pull-meta-leads, care trage lead-urile
-- noi din Meta Graph API (System User token) și le bagă în kanban cu dedup.
-- Cheia anon e publică; funcția are verify_jwt=false, tokenul Meta stă în secret.
create extension if not exists pg_net;

select cron.unschedule(jobid)
  from cron.job where jobname = 'pull-meta-leads';

select cron.schedule(
  'pull-meta-leads',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://cbftxkwvoboqahzsldcp.supabase.co/functions/v1/pull-meta-leads',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZnR4a3d2b2JvcWFoenNsZGNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MjA0MzYsImV4cCI6MjA5NDI5NjQzNn0.qmNmi-M0zOLWJ82Y9jFUDAJxLCfvJW0HV51ss6Pe59w',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZnR4a3d2b2JvcWFoenNsZGNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MjA0MzYsImV4cCI6MjA5NDI5NjQzNn0.qmNmi-M0zOLWJ82Y9jFUDAJxLCfvJW0HV51ss6Pe59w'
    ),
    body := '{}'::jsonb
  );
  $$
);
