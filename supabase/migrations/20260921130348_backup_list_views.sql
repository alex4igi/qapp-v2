-- Folosită de scripts/backup-export.mjs ca să sară view-urile (se recalculează din tabele,
-- iar unele sunt prea lente pentru export paginat).
create or replace function public.backup_list_views()
returns text[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(c.relname::text order by c.relname), '{}')
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('v', 'm');
$$;

revoke execute on function public.backup_list_views() from anon, authenticated, public;
grant execute on function public.backup_list_views() to service_role;
