-- De la 30 oct. 2026 Supabase nu mai dă automat drepturi de Data API pe tabelele noi
-- din `public`: o migrație care uită GRANT-ul lasă tabelul inaccesibil din aplicație
-- (`permission denied`). Raportul semnalează și regresul invers celui de până acum —
-- tabele/view-uri pe care `authenticated` sau `service_role` nu au SELECT. Tabelele
-- asumat doar-server (fără acces pentru authenticated) stau pe lista albă din script.
create or replace function drepturi_tabele_report()
returns jsonb
language sql
security definer
set search_path = public, pg_catalog
as $$
  select jsonb_build_object(
    'granturi_periculoase', coalesce((
      select jsonb_agg(jsonb_build_object('tabel', table_name, 'rol', grantee, 'drept', privilege_type)
                       order by table_name, grantee, privilege_type)
      from information_schema.role_table_grants
      where table_schema = 'public'
        and grantee in ('anon', 'authenticated')
        and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN')
    ), '[]'::jsonb),
    'default_privileges', coalesce((
      select jsonb_agg(jsonb_build_object('creator', pg_get_userbyid(d.defaclrole), 'acl', d.defaclacl::text))
      from pg_default_acl d
      join pg_namespace n on n.oid = d.defaclnamespace
      where n.nspname = 'public' and d.defaclobjtype = 'r'
    ), '[]'::jsonb),
    'fara_grant', coalesce((
      select jsonb_agg(jsonb_build_object(
               'tabel', c.relname,
               'authenticated', has_table_privilege('authenticated', c.oid, 'SELECT'),
               'service_role', has_table_privilege('service_role', c.oid, 'SELECT'))
             order by c.relname)
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind in ('r', 'p', 'v', 'm')
        and not c.relispartition
        and not (has_table_privilege('authenticated', c.oid, 'SELECT')
                 and has_table_privilege('service_role', c.oid, 'SELECT'))
    ), '[]'::jsonb)
  );
$$;

revoke execute on function drepturi_tabele_report() from anon, public, authenticated;
grant execute on function drepturi_tabele_report() to service_role;
