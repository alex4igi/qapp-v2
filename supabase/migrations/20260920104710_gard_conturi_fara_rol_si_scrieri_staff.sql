-- Audit securitate 2026-09-20 — trei garduri defensive + un raport de verificare.
--
-- 1) Conturi de Supabase Auth fără rol. Self-signup-ul e activ pe proiect
--    (`disable_signup=false`), iar `auth_role()` cade pe 'front_desk' pentru un JWT fără
--    app_metadata.role. Deci un cont creat prin `signUp` cu cheia publică ar deveni
--    recepționer: citește clienți/familii/leaduri/încasări și scrie ca front_desk. Azi îl
--    salvează doar faptul că SMTP-ul implicit Supabase nu livrează emailul de confirmare
--    unor adrese străine — în ziua în care se configurează SMTP propriu, gaura se deschide.
--    Toate cele 18 conturi de staff au rol (create prin edge function `admin-users`, care
--    pune app_metadata.role la creare). Trigger-ul refuză orice INSERT în auth.users fără
--    rol, indiferent de setarea de signup din dashboard. Consecință: „Add user" din
--    dashboardul Supabase nu mai merge — conturile se fac din Setări → Utilizatori.
--
-- 2) `netopia_orders` avea politica `netopia_orders_all` ALL using(true): orice staff
--    (inclusiv teacher) putea edita `fifo_plan`/`amount` pe o comandă în așteptare sau
--    șterge comenzi. Aplicația de staff nu scrie deloc în tabel (fluxul e service_role din
--    edge functions), deci scrierea rămâne doar la admin/owner; citirea, la staff.
--
-- 3) `documente_client` avea `documente_client_write_all` ALL using(true): un teacher
--    putea șterge contractele atașate. Scriu doar rolurile care lucrează cu fișa clientului.
--
-- 4) `definer_views_report()`: view-urile fără `security_invoker` ocolesc RLS (cazul
--    opt_out_list/datorii_rest din 20260920104407). Raportul e citit de
--    scripts/check-views.mjs după orice migrație care creează view-uri.

-- ── 1) auth.users: rol obligatoriu la creare ──────────────────────────────────────
create or replace function public.auth_users_require_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.raw_app_meta_data->>'role', '') = '' then
    raise exception 'Conturile se creează doar din aplicație, de un administrator (rol lipsă).'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.auth_users_require_role() from anon, public, authenticated;
-- Trigger-ul rulează ca supabase_auth_admin (owner-ul auth.users): fără grantul explicit,
-- revoke-ul de pe public îi ia dreptul de execuție și ORICE creare de cont pică cu
-- „Database error creating new user" — inclusiv cele legitime din admin-users.
grant execute on function public.auth_users_require_role() to supabase_auth_admin;

drop trigger if exists trg_auth_users_require_role on auth.users;
create trigger trg_auth_users_require_role
  before insert on auth.users
  for each row execute function public.auth_users_require_role();

-- ── 2) netopia_orders: scriere doar admin/owner ───────────────────────────────────
drop policy if exists netopia_orders_all on public.netopia_orders;
drop policy if exists netopia_orders_staff_select on public.netopia_orders;
drop policy if exists netopia_orders_admin_write on public.netopia_orders;
create policy netopia_orders_staff_select on public.netopia_orders
  for select to authenticated using (true);
create policy netopia_orders_admin_write on public.netopia_orders
  for all to authenticated using (is_admin()) with check (is_admin());

-- ── 3) documente_client: scriere doar owner/admin/manager/front_desk ──────────────
drop policy if exists documente_client_write_all on public.documente_client;
drop policy if exists documente_client_write_staff on public.documente_client;
create policy documente_client_write_staff on public.documente_client
  for all to authenticated
  using ((select auth_role()) = any (array['owner', 'admin', 'manager', 'front_desk']))
  with check ((select auth_role()) = any (array['owner', 'admin', 'manager', 'front_desk']));

-- ── 4) raport: view-uri care rulează ca owner (ocolesc RLS) ───────────────────────
create or replace function public.definer_views_report()
returns table (view_name text, anon_select boolean, authenticated_select boolean, updatable boolean)
language sql
stable
security definer
set search_path = public
as $$
  select c.relname::text,
         has_table_privilege('anon', c.oid, 'SELECT'),
         has_table_privilege('authenticated', c.oid, 'SELECT'),
         has_table_privilege('anon', c.oid, 'UPDATE') or has_table_privilege('authenticated', c.oid, 'UPDATE')
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'v'
    and not coalesce(
      (select bool_or(o ~ '^security_invoker=(true|on)$') from unnest(c.reloptions) o), false)
  order by 1;
$$;
revoke execute on function public.definer_views_report() from anon, public, authenticated;
grant execute on function public.definer_views_report() to service_role;
