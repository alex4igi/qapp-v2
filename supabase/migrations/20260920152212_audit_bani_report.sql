-- Raport pentru gardianul `scripts/check-audit-bani.mjs`: confirmă că drepturile
-- directe pe bani rămân revocate, că trigger-ul de ștergere a datoriilor e pe
-- poziție și că RPC-urile auditate există. Doar service_role îl poate chema.
create or replace function audit_bani_report()
returns jsonb
language sql
security definer
set search_path = public, pg_catalog
as $$
  select jsonb_build_object(
    'drepturi_directe', coalesce((
      select jsonb_agg(jsonb_build_object('tabel', table_name, 'rol', grantee, 'drept', privilege_type))
      from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name in ('incasari', 'datorii')
        and grantee in ('anon', 'authenticated')
        and (
          (table_name = 'incasari' and privilege_type in ('UPDATE', 'DELETE'))
          or (table_name = 'datorii' and privilege_type = 'UPDATE')
        )
    ), '[]'::jsonb),
    'trigger_datorii', exists (
      select 1 from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      where c.relname = 'datorii' and t.tgname = 'trg_audit_datorie_stearsa' and not t.tgisinternal
    ),
    'rpc_lipsa', coalesce((
      select jsonb_agg(nume)
      from unnest(array['edit_incasare', 'delete_incasare', 'corecteaza_metoda_incasare']) as nume
      where not exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = nume
      )
    ), '[]'::jsonb)
  );
$$;

revoke execute on function audit_bani_report() from anon, public, authenticated;
grant execute on function audit_bani_report() to service_role;
