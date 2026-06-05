-- Qapp v2 — RPC pentru vizualizarea istoricului pg_cron (owner only).
-- Combinație din cron.job (definiția jobului) + cron.job_run_details (ultimele rulări).

create or replace function get_cron_jobs_recent(p_days integer default 30)
returns table (
  jobid        bigint,
  jobname      text,
  schedule     text,
  command      text,
  active       boolean,
  runid        bigint,
  status       text,
  return_message text,
  start_time   timestamptz,
  end_time     timestamptz,
  duration_ms  numeric
)
language sql
stable
security definer
set search_path = public, cron
as $$
  with my_role as (
    select coalesce(
      (auth.jwt() -> 'app_metadata' ->> 'role'),
      (auth.jwt() ->> 'role')
    ) as r
  )
  select
    j.jobid,
    j.jobname,
    j.schedule,
    j.command,
    j.active,
    r.runid,
    r.status,
    r.return_message,
    r.start_time,
    r.end_time,
    case
      when r.end_time is not null and r.start_time is not null
        then extract(milliseconds from (r.end_time - r.start_time))
      else null
    end as duration_ms
  from cron.job j
  left join cron.job_run_details r
    on r.jobid = j.jobid
    and r.start_time >= now() - make_interval(days => p_days)
  where (select r from my_role) = 'owner'
  order by r.start_time desc nulls last, j.jobname;
$$;

grant execute on function get_cron_jobs_recent(integer) to authenticated;
