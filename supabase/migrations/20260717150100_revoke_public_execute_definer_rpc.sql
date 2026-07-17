-- REMEDIERE SECURITATE (partea 2) — revocă grantul PUBLIC de pe RPC-urile definer.
--
-- Prima migrație (20260717150000) a revocat grantul DIRECT `anon`, dar 96 de funcții
-- security definer aveau EXECUTE și prin PUBLIC (ACL `=X/...`, moștenit din default-ul
-- PostgreSQL la CREATE FUNCTION, fără `revoke from public` în migrația originală).
-- `revoke from anon` nu atinge grantul PUBLIC, deci anon păstra accesul indirect.
--
-- Toate cele 96 au grant DIRECT pentru `authenticated` și `service_role`, deci
-- revocarea PUBLIC nu afectează staff-ul, portalul (parinte=authenticated) sau edge
-- functions (service_role). Se ating DOAR funcțiile security definer non-trigger —
-- helper-ele RLS security invoker (auth_role, is_admin, …) NU sunt atinse, deci
-- evaluarea politicilor pentru anon pe tabelele publice rămâne intactă.
--
-- Excepția `my_teacher_id`: e referențiată în politica `salarii_teacher_self_select`
-- (rol public) → anon are nevoie de EXECUTE ca politica să întoarcă gol, nu eroare.
-- Îi înlocuim grantul PUBLIC difuz cu un grant anon EXPLICIT (intenție documentată).

do $$
declare
  r record;
  v_count int := 0;
begin
  for r in
    select p.oid::regprocedure::text as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.prorettype <> 'trigger'::regtype
      and has_function_privilege('anon', p.oid, 'EXECUTE')  -- încă accesibile (via public)
  loop
    execute 'revoke execute on function ' || r.sig || ' from public';
    v_count := v_count + 1;
  end loop;
  raise notice 'Revocat PUBLIC EXECUTE pe % funcții security definer.', v_count;
end$$;

-- my_teacher_id: singura excepție intenționată — anon are nevoie de ea pentru RLS.
grant execute on function my_teacher_id() to anon;
