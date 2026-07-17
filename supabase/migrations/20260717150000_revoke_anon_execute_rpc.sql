-- REMEDIERE SECURITATE — revocă rolul `anon` de pe toate RPC-urile security definer.
--
-- Context (audit 2026-07-17): default privileges Supabase (roluri postgres +
-- supabase_admin) acordă automat EXECUTE rolului `anon` pe fiecare funcție nouă.
-- Migrațiile proiectului fac doar `revoke from public; grant to authenticated`,
-- care NU revocă grantul direct al lui `anon`. Combinat cu `auth_role()` care cade
-- pe 'front_desk' pentru orice request fără rol (deci și anon), rezulta că funcții
-- security definer erau apelabile cu cheia publică — inclusiv mutații financiare:
--   🔴 confirm_netopia_payment  (confirmă plată fără plată reală → înrolări/bilete)
--   🔴 record_bank_incasare     (fabrică încasări, stinge datorii)
--   ⚠️ mark/clear_opt_out, activate_reinscriere*, adjust_inchiriere_price,
--      record_taxa_rezervare, rezerva_loc_open, converteste_*, use_client_credit,
--      anuleaza_rezervare_open, add/remove_eveniment_participant, match_bank_payer …
--
-- Verificat că NIMIC legitim nu rulează ca anon pe aceste RPC-uri:
--   - app staff (qapp v2): sesiune `authenticated` (grant direct păstrat).
--   - portal (qapp-membri): parinte = JWT cu role `authenticated`; paginile publice
--     (/servicii etc.) fac doar SELECT pe tabele *_publice sub RLS (fără RPC).
--   - qsite: nu folosește deloc Supabase. Widget public: niciun RPC.
--   - edge functions (netopia-webhook, autofgo, cron-*): folosesc service_role,
--     care ignoră grant-urile → neafectate.
--
-- Fix: revocă `anon` de pe toate funcțiile security definer non-trigger, cu O
-- singură excepție — `my_teacher_id()`, referențiată în politica RLS
-- `salarii_teacher_self_select` pentru rolul public (anon are nevoie de EXECUTE ca
-- evaluarea politicii să întoarcă gol, nu eroare). `authenticated` păstrează
-- grantul direct, deci staff-ul și portalul funcționează normal.

do $$
declare
  r record;
  v_count int := 0;
begin
  for r in
    select p.oid::regprocedure::text as sig, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.prorettype <> 'trigger'::regtype
      and has_function_privilege('anon', p.oid, 'EXECUTE')
      and p.proname <> 'my_teacher_id'
  loop
    execute 'revoke execute on function ' || r.sig || ' from anon';
    v_count := v_count + 1;
  end loop;
  raise notice 'Revocat anon EXECUTE pe % funcții security definer.', v_count;
end$$;

-- Future-proofing: funcțiile viitoare create de rolul migrațiilor (postgres) NU mai
-- primesc EXECUTE pentru anon. (Nu atingem default privileges ale lui supabase_admin
-- — sunt interne Supabase, nu creăm funcții ca acel rol.)
alter default privileges in schema public revoke execute on functions from anon;

-- Gardian pentru scriptul de verificare (scripts/check-anon-rpc.mjs): raportează
-- orice funcție security definer non-trigger încă apelabilă de anon, exceptând
-- pe cele referențiate în politici RLS anon/public (au nevoie de EXECUTE acolo).
create or replace function anon_rpc_gap_report()
returns table(functie text)
language sql stable security definer set search_path = public as $$
  with pol as (
    select coalesce(string_agg(coalesce(qual,'') || ' ' || coalesce(with_check,''), ' '), '') as expr
    from pg_policies
    where schemaname = 'public'
      and (roles::text like '%anon%' or roles::text like '%public%')
  )
  select p.oid::regprocedure::text
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace, pol
  where n.nspname = 'public'
    and p.prosecdef
    and p.prorettype <> 'trigger'::regtype
    and has_function_privilege('anon', p.oid, 'EXECUTE')
    and pol.expr !~ ('\m' || p.proname || '\M')
  order by 1;
$$;

revoke all on function anon_rpc_gap_report() from public;
revoke execute on function anon_rpc_gap_report() from anon;
grant execute on function anon_rpc_gap_report() to authenticated, service_role;
