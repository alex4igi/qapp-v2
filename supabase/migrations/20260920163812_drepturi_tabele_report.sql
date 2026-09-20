-- Raport pentru `scripts/check-drepturi-tabele.mjs`: niciun tabel din `public` nu
-- are voie să dea TRUNCATE/REFERENCES/TRIGGER/MAINTAIN lui anon sau authenticated,
-- iar default privileges pentru tabelele viitoare trebuie să rămână strânse.
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
    ), '[]'::jsonb)
  );
$$;

revoke execute on function drepturi_tabele_report() from anon, public, authenticated;
grant execute on function drepturi_tabele_report() to service_role;
