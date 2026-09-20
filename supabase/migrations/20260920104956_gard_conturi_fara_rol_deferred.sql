-- GoTrue creează rândul din auth.users ÎNTÂI și abia apoi, în aceeași tranzacție, scrie
-- app_metadata (createUser din admin-users). Un trigger BEFORE INSERT vede deci rolul lipsă
-- și pe conturile legitime (verificat 2026-09-20: „Database error creating new user" și la
-- crearea cu rol). Verificarea se mută la COMMIT: constraint trigger amânat, care recitește
-- rândul. Test: scripts/test-auth-guard.mjs (signUp public → refuzat; createUser cu rol → OK;
-- createUser fără rol → refuzat).
drop trigger if exists trg_auth_users_require_role on auth.users;

create or replace function public.auth_users_require_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_role text;
begin
  select u.raw_app_meta_data->>'role' into v_role from auth.users u where u.id = new.id;
  if coalesce(v_role, '') = '' then
    raise exception 'Conturile se creează doar din aplicație, de un administrator (rol lipsă).'
      using errcode = 'P0001';
  end if;
  return null;
end;
$$;
revoke execute on function public.auth_users_require_role() from anon, public, authenticated;
grant execute on function public.auth_users_require_role() to supabase_auth_admin;

create constraint trigger trg_auth_users_require_role
  after insert on auth.users
  deferrable initially deferred
  for each row execute function public.auth_users_require_role();
