-- Qapp v2 — gărzile RLS evaluează `auth_role()` O DATĂ per interogare, nu per rând.
--
-- Măsurat pe live (12 sept 2026): `auth_role()` e o funcție SQL stabilă care citește
-- `current_setting('request.jwt.claims')` și parsează JSON-ul. Pusă direct în USING/WITH
-- CHECK, Postgres o evaluează pentru FIECARE rând scanat. Gărzile restrictive
-- `deny_parinte_direct` (95 tabele) și `deny_marketing_*` (89 + 18) se aplică la ORICE
-- interogare a oricărui cont, deci fiecare scanare plătea prețul ăsta:
--
--   select count(*) from ...      auth_role() <> 'parinte'   (select auth_role()) <> 'parinte'
--   prezente   (175k rânduri)             2.454 ms                        45 ms
--   incasari   ( 55k)                       493 ms                        16 ms
--   enrollments( 46k)                       310 ms                        26 ms
--
-- Asta e diferența de ~6× dintre aceeași interogare rulată ca `postgres` (fără RLS) și pe
-- calea reală PostgREST + JWT — vezi și memoria despre get_pachet_luni (8 s doar cu JWT).
--
-- Forma `(select auth_role())` e un InitPlan: se evaluează o singură dată per interogare
-- (recomandarea oficială Supabase pentru funcții în politici). Semantica e identică.
--
-- Recreăm DOAR gărzile existente, citite din pg_policies: același nume, tabel, comandă,
-- roluri, RESTRICTIVE, aceeași expresie — doar cu apelul împachetat. Nu adăugăm și nu
-- scoatem nicio gardă (scripts/check-rls-parinte.mjs / check-rls-marketing.mjs rămân verzi).

do $$
declare
  r record;
  v_using text;
  v_check text;
  v_sql   text;
  n int := 0;
begin
  for r in
    select schemaname, tablename, policyname, cmd, roles, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and permissive = 'RESTRICTIVE'
      and policyname in (
        'deny_parinte_direct',
        'deny_marketing_direct', 'deny_marketing_insert', 'deny_marketing_update', 'deny_marketing_delete'
      )
      and (coalesce(qual, '') || coalesce(with_check, '')) like '%auth_role()%'
    order by tablename, policyname
  loop
    v_using := replace(r.qual,       'auth_role()', '(select auth_role())');
    v_check := replace(r.with_check, 'auth_role()', '(select auth_role())');

    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);

    v_sql := format('create policy %I on %I.%I as restrictive for %s to %s',
                    r.policyname, r.schemaname, r.tablename, r.cmd,
                    (select string_agg(quote_ident(x), ', ') from unnest(r.roles) x));
    if v_using is not null then v_sql := v_sql || format(' using (%s)', v_using); end if;
    if v_check is not null then v_sql := v_sql || format(' with check (%s)', v_check); end if;
    execute v_sql;
    n := n + 1;
  end loop;
  raise notice 'garduri recreate cu (select auth_role()): %', n;
end $$;
