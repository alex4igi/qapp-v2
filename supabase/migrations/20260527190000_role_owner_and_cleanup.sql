-- Qapp v2 — Rol nou `owner` + cleanup rol legacy `user`.
-- Adaugă helperi SQL pentru RBAC granular: is_owner, is_manager, is_front_desk,
-- user_locatie_id, is_in_my_locatie.
--
-- Decizii confirmate de user (vezi /plans/vreau-sa-ne-organizam-cached-dusk.md):
-- - owner = doar Alex; singur poate promova la admin/owner; tab Organizație.
-- - admin (multipli) = tot mai puțin privilegiile owner.
-- - `user` legacy → migrat la `front_desk`.
-- - is_admin() return TRUE și pentru owner (owner are toate puterile admin + mai mult).

-- ============================================================
-- 1) Cleanup `user` legacy → `front_desk` (conturi existente)
-- ============================================================
update auth.users
set raw_app_meta_data = jsonb_set(
  coalesce(raw_app_meta_data, '{}'::jsonb),
  '{role}',
  '"front_desk"'
)
where raw_app_meta_data->>'role' = 'user';

-- ============================================================
-- 2) Promovează alex@quasardance.ro la `owner`
-- ============================================================
update auth.users
set raw_app_meta_data = jsonb_set(
  coalesce(raw_app_meta_data, '{}'::jsonb),
  '{role}',
  '"owner"'
)
where lower(email) = 'alex@quasardance.ro';

-- ============================================================
-- 3) auth_role(): fallback la front_desk (nu mai era 'user')
-- ============================================================
create or replace function auth_role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'role', ''),
    'front_desk'
  );
$$;

-- ============================================================
-- 4) is_admin(): include OWNER (owner = admin + extra)
-- ============================================================
create or replace function is_admin()
returns boolean
language sql
stable
as $$
  select auth_role() in ('admin', 'owner');
$$;

-- ============================================================
-- 5) Helperi noi
-- ============================================================
create or replace function is_owner()
returns boolean
language sql
stable
as $$
  select auth_role() = 'owner';
$$;

create or replace function is_manager()
returns boolean
language sql
stable
as $$
  select auth_role() = 'manager';
$$;

create or replace function is_front_desk()
returns boolean
language sql
stable
as $$
  select auth_role() = 'front_desk';
$$;

-- locația asignată user-ului (din app_metadata.locatie_id).
-- Returnează NULL pentru admin/owner/manager care nu au locație fixă.
create or replace function user_locatie_id()
returns uuid
language sql
stable
as $$
  select nullif(
    current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'locatie_id',
    ''
  )::uuid;
$$;

-- True dacă locatia primită e cea a user-ului, SAU dacă user-ul nu are locație
-- fixă (caz admin/owner/manager — văd tot).
create or replace function is_in_my_locatie(loc uuid)
returns boolean
language sql
stable
as $$
  select user_locatie_id() is null or user_locatie_id() = loc;
$$;

-- ============================================================
-- 6) RLS user_write: înlocuim 'user' cu lista completă a rolurilor cu drept de scriere.
--    `owner` capabil (via is_admin = include owner), dar îl includem explicit
--    pentru lizibilitate / coerență cu update_policy comparațiile.
-- ============================================================
do $$
declare
  user_write_tables text[] := array[
    'clienti','familii','enrollments','incasari','prezente','leads',
    'programari_leads','prospecti','situatie_sms_uri','feedback'
  ];
  t text;
begin
  foreach t in array user_write_tables loop
    execute format('drop policy if exists %I on %I', t || '_user_insert', t);
    execute format('drop policy if exists %I on %I', t || '_user_update', t);

    execute format(
      'create policy %I on %I for insert to authenticated with check (auth_role() in (''admin'', ''owner'', ''manager'', ''front_desk''))',
      t || '_user_insert', t
    );
    execute format(
      'create policy %I on %I for update to authenticated using (auth_role() in (''admin'', ''owner'', ''manager'', ''front_desk'')) with check (auth_role() in (''admin'', ''owner'', ''manager'', ''front_desk''))',
      t || '_user_update', t
    );
  end loop;
end $$;

-- ============================================================
-- 7) campanii_promovare RLS: include owner (deja era admin+manager)
-- ============================================================
drop policy if exists campanii_promovare_manager_write on campanii_promovare;
create policy campanii_promovare_manager_write on campanii_promovare
  for all to authenticated
  using (auth_role() in ('admin', 'owner', 'manager'))
  with check (auth_role() in ('admin', 'owner', 'manager'));

-- ============================================================
-- 8) Grants
-- ============================================================
grant execute on function auth_role() to authenticated;
grant execute on function is_admin() to authenticated;
grant execute on function is_owner() to authenticated;
grant execute on function is_manager() to authenticated;
grant execute on function is_front_desk() to authenticated;
grant execute on function user_locatie_id() to authenticated;
grant execute on function is_in_my_locatie(uuid) to authenticated;
