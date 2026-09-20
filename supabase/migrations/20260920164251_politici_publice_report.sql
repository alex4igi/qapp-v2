-- Raport pentru `scripts/check-citire-anon.mjs`: politici permisive de SELECT cu
-- `using (true)` care se aplică rolului `public` (deci și lui `anon`). Tiparul prin
-- care `vacante` a stat citibil cu cheia publică. Verificarea empirică nu-l prinde
-- pe un tabel gol azi — asta îl prinde.
create or replace function politici_publice_report()
returns table (tablename text, policyname text, cmd text)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select p.tablename::text, p.policyname::text, p.cmd::text
  from pg_policies p
  where p.schemaname = 'public'
    and p.permissive = 'PERMISSIVE'
    and p.cmd in ('SELECT', 'ALL')
    and (p.roles::text like '%public%' or p.roles::text like '%anon%')
    and btrim(coalesce(p.qual, '')) in ('true', '(true)')
  order by p.tablename;
$$;

revoke execute on function politici_publice_report() from anon, public, authenticated;
grant execute on function politici_publice_report() to service_role;
