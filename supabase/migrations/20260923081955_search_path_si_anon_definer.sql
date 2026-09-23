-- Curățenie de securitate (audit 2026-09-20, secțiunea 4.8 + „Regulă anon pe RPC").
--
-- 1. `search_path` fix pe funcțiile care nu-l aveau (49 la 2026-09-23). O funcție
--    `security definer` fără search_path fixat rezolvă numele de tabele în schema aleasă
--    de APELANT: cine poate crea obiecte într-o schemă de pe drum îi poate strecura
--    funcției alt tabel. Valoarea 'public' păstrează comportamentul (numele necalificate
--    se rezolvă la fel) și scoate din drum pg_temp.
-- 2. Cele 5 funcții de trigger apelabile prin API cu cheia publică: triggerele NU verifică
--    EXECUTE la rulare (doar la crearea triggerului), deci revocarea nu le atinge.
-- 3. `my_teacher_id()` rămâne executabilă de `authenticated` fiindcă o cheamă o politică
--    RLS de pe `salarii_teacher` — dar politica se leagă explicit de `authenticated`
--    (era pe rolul `public`, deci se evalua și pentru vizitatori nelogați).

do $$
declare
  r record;
  n int := 0;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.prokind in ('f', 'p')
      -- funcțiile aduse de extensii (pg_net, citext, pg_trgm, btree_gist stau în public)
      -- sunt ale extensiei, nu ale noastre
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      and (
        p.proconfig is null
        or not exists (select 1 from unnest(p.proconfig) c where c like 'search\_path=%')
      )
  loop
    begin
      execute format('alter function %s set search_path = %L', r.sig, 'public');
      n := n + 1;
    exception when insufficient_privilege then
      raise notice 'sărită (nu suntem owner): %', r.sig;
    end;
  end loop;
  raise notice 'search_path fixat pe % funcții', n;
end $$;

revoke execute on function public.log_lead_activity() from anon, authenticated, public;
revoke execute on function public.notify_admins_new_app_feedback() from anon, authenticated, public;
revoke execute on function public.prezente_dedup_client_curs_data() from anon, authenticated, public;
revoke execute on function public.sync_lead_neprezentari() from anon, authenticated, public;
revoke execute on function public.trg_enrollment_marcheaza_activ() from anon, authenticated, public;

drop policy if exists salarii_teacher_self_select on public.salarii_teacher;
create policy salarii_teacher_self_select on public.salarii_teacher
  for select to authenticated
  using (teacher = (select public.my_teacher_id()));

drop policy if exists salarii_teacher_admin_all on public.salarii_teacher;
create policy salarii_teacher_admin_all on public.salarii_teacher
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

revoke execute on function public.my_teacher_id() from anon, public;
grant execute on function public.my_teacher_id() to authenticated;
