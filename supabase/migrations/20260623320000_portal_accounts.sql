-- Portal membri — DIRECTOR DE LOGIN SEPARAT.
--
-- Problemă: staff (auth.users) și membrii portalului trăiau în același director Supabase
-- Auth → un email = un singur cont. Un angajat care e și părinte (ex. roxana@quasardance.ro)
-- nu putea avea cont de portal. Soluția: un director de credențiale propriu (`portal_accounts`)
-- INDEPENDENT de auth.users, în același proiect. portal-auth (edge fn) verifică parola aici
-- și emite un JWT semnat cu secretul proiectului, cu `sub = portal_accounts.id` și
-- app_metadata.role='parinte' — compatibil cu auth.uid()/auth_role() din RPC-urile existente.
--
-- Coloana de legătură `familii/clienti.auth_user_id` rămâne, dar stochează acum
-- `portal_accounts.id` (nu auth.users.id). Toate RPC-urile `where auth_user_id = auth.uid()`
-- rămân neschimbate.

create extension if not exists pgcrypto;
create extension if not exists citext;

-- pgcrypto/citext trăiesc în schema `extensions` pe Supabase — include-o în search_path
-- pentru statement-urile top-level (funcțiile au propriul search_path setat).
set search_path = public, extensions;

-- ============================================================
-- 1) Tabele
-- ============================================================
create table if not exists portal_accounts (
  id             uuid primary key default gen_random_uuid(),
  email          citext not null unique,
  password_hash  text not null,
  status         text not null default 'active',   -- active | disabled
  created_at     timestamptz not null default now(),
  last_login_at  timestamptz,
  failed_attempts int not null default 0,           -- lockout anti-brute-force
  locked_until   timestamptz
);
alter table portal_accounts enable row level security;
-- fără policies → niciun rol „authenticated"/„anon"/„parinte" nu atinge tabelul direct;
-- doar RPC-urile SECURITY DEFINER de mai jos + service_role (care ocolește RLS).

-- Refresh tokens: stocăm DOAR hash-ul (sha256) tokenului opac; rotim la fiecare refresh.
create table if not exists portal_sessions (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references portal_accounts(id) on delete cascade,
  token_hash  text not null unique,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  last_used_at timestamptz
);
alter table portal_sessions enable row level security;
create index if not exists portal_sessions_account_idx on portal_sessions(account_id);

-- Token de reset parolă (self-service pe email): stocăm hash-ul, single-use, scurt.
create table if not exists portal_reset_tokens (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references portal_accounts(id) on delete cascade,
  token_hash  text not null unique,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz
);
alter table portal_reset_tokens enable row level security;

-- ============================================================
-- 2) RPC-uri credențiale (SECURITY DEFINER; pgcrypto stă DOAR în DB, niciodată în edge)
--    revoke de la public/anon/authenticated → doar service_role (edge fn) le cheamă.
-- ============================================================

-- Verifică parola cu lockout anti-brute-force (8 încercări → blocat 15 min).
-- Întoarce rândul (id, email) DOAR la potrivire + status active + necablat.
create or replace function portal_login(p_email citext, p_password text)
returns table (id uuid, email citext)
language plpgsql security definer set search_path = public, extensions as $$
declare a portal_accounts%rowtype;
begin
  select * into a from portal_accounts where portal_accounts.email = p_email;
  if not found or a.status <> 'active' then return; end if;
  if a.locked_until is not null and a.locked_until > now() then return; end if;

  if a.password_hash = crypt(p_password, a.password_hash) then
    update portal_accounts
       set last_login_at = now(), failed_attempts = 0, locked_until = null
     where portal_accounts.id = a.id;
    return query select a.id, a.email;
  else
    update portal_accounts
       set failed_attempts = case when a.failed_attempts + 1 >= 8
                                  then 0 else a.failed_attempts + 1 end,
           locked_until = case when a.failed_attempts + 1 >= 8
                               then now() + interval '15 minutes' else null end
     where portal_accounts.id = a.id;
    return;
  end if;
end; $$;

-- Creează un cont NOU (insert-only). Întoarce null dacă emailul e deja folosit
-- (evită hijack-ul unui cont existent la provisioning).
create or replace function portal_create_account(p_email citext, p_password text)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  insert into portal_accounts (email, password_hash)
  values (p_email, crypt(p_password, gen_salt('bf', 12)))
  returning id into v_id;
  return v_id;
exception when unique_violation then
  return null;
end; $$;

-- Creează sau resetează credențialele (seed/idempotent). bcrypt cost 12.
create or replace function portal_upsert_credentials(p_email citext, p_password text)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  insert into portal_accounts (email, password_hash)
  values (p_email, crypt(p_password, gen_salt('bf', 12)))
  on conflict (email) do update
    set password_hash = crypt(p_password, gen_salt('bf', 12)),
        status = 'active'
  returning id into v_id;
  return v_id;
end; $$;

-- Setează o parolă nouă pe un cont existent (reset). Invalidează sesiunile (refresh) curente.
create or replace function portal_set_password(p_id uuid, p_password text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  update portal_accounts
     set password_hash = crypt(p_password, gen_salt('bf', 12)),
         status = 'active'
   where id = p_id;
  delete from portal_sessions where account_id = p_id;
end; $$;

revoke all on function portal_login(citext, text) from public, anon, authenticated;
revoke all on function portal_create_account(citext, text) from public, anon, authenticated;
revoke all on function portal_upsert_credentials(citext, text) from public, anon, authenticated;
revoke all on function portal_set_password(uuid, text) from public, anon, authenticated;
grant execute on function portal_login(citext, text) to service_role;
grant execute on function portal_create_account(citext, text) to service_role;
grant execute on function portal_upsert_credentials(citext, text) to service_role;
grant execute on function portal_set_password(uuid, text) to service_role;

-- ============================================================
-- 3) Drop FK vechi spre auth.users (ÎNAINTE de repoint — altfel UPDATE-ul îl violează).
--    Robust la nume/drift: găsește orice FK pe coloana auth_user_id.
-- ============================================================
do $$
declare r record;
begin
  for r in
    select rel.relname as tbl, con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
    where con.contype = 'f'
      and rel.relname in ('familii', 'clienti')
      and att.attname = 'auth_user_id'
  loop
    execute format('alter table public.%I drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

-- ============================================================
-- 4) Migrarea conturilor existente (parinte din auth.users → portal_accounts)
--    Hash-urile GoTrue nu se pot extrage → parolă random temporară, necesită reset.
--    (Cele reale: staff le re-setează; portal.test e re-setat de seed-portal-test.mjs.)
-- ============================================================
insert into portal_accounts (email, password_hash, created_at)
select u.email::citext,
       extensions.crypt(gen_random_uuid()::text || gen_random_uuid()::text, extensions.gen_salt('bf', 12)),
       coalesce(u.created_at, now())
from auth.users u
where coalesce(u.raw_app_meta_data ->> 'role', '') = 'parinte'
  and u.email is not null
on conflict (email) do nothing;

-- Repoint legături: id auth.users (parinte) → id portal_accounts (același email).
update familii f
   set auth_user_id = pa.id
  from auth.users u
  join portal_accounts pa on pa.email = u.email::citext
 where f.auth_user_id = u.id
   and coalesce(u.raw_app_meta_data ->> 'role', '') = 'parinte';

update clienti c
   set auth_user_id = pa.id
  from auth.users u
  join portal_accounts pa on pa.email = u.email::citext
 where c.auth_user_id = u.id
   and coalesce(u.raw_app_meta_data ->> 'role', '') = 'parinte';

-- Orice auth_user_id rămas care NU corespunde unui portal_account (teoretic 0 — doar
-- parinte erau legați) e curățat ca să nu pice noul FK.
update familii set auth_user_id = null
 where auth_user_id is not null
   and auth_user_id not in (select id from portal_accounts);
update clienti set auth_user_id = null
 where auth_user_id is not null
   and auth_user_id not in (select id from portal_accounts);

-- ============================================================
-- 5) FK nou: auth_user_id → portal_accounts
-- ============================================================
alter table familii
  add constraint familii_auth_user_id_fkey
  foreign key (auth_user_id) references portal_accounts(id) on delete set null;
alter table clienti
  add constraint clienti_auth_user_id_fkey
  foreign key (auth_user_id) references portal_accounts(id) on delete set null;
-- Indexurile unice parțiale familii_auth_user_id_key / clienti_auth_user_id_key rămân.
