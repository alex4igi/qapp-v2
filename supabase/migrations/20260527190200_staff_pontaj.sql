-- Qapp v2 — Pontaj real pentru staff (front-desk în primul rând, dar și manager/admin/teacher).
-- Login auto la sign-in, logout la sign-out / buton „Încheie tura" / cron auto-close 00:00 UTC.
-- Decizie user 2026-05-27.

-- ============================================================
-- 1) Tabel
-- ============================================================
create table staff_pontaj (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  locatie_id  uuid references locatii(id) on delete set null,
  start_at    timestamptz not null default now(),
  end_at      timestamptz,
  source      text default 'login' check (source in ('login','signout','manual','auto_midnight')),
  created     timestamptz not null default now()
);

create index idx_staff_pontaj_user  on staff_pontaj(user_id);
create index idx_staff_pontaj_open  on staff_pontaj(user_id) where end_at is null;
create index idx_staff_pontaj_start on staff_pontaj(start_at desc);
create index idx_staff_pontaj_loc   on staff_pontaj(locatie_id);

-- ============================================================
-- 2) RLS
-- ============================================================
alter table staff_pontaj enable row level security;

-- admin/owner: full (vizualizare globală în /pontaj-staff)
create policy staff_pontaj_admin_all on staff_pontaj
  for all to authenticated
  using (is_admin()) with check (is_admin());

-- manager: vede pontajul la locația lui
create policy staff_pontaj_manager_select on staff_pontaj
  for select to authenticated
  using (is_manager() and is_in_my_locatie(locatie_id));

-- self: vede propriul pontaj
create policy staff_pontaj_self_select on staff_pontaj
  for select to authenticated
  using (user_id = auth.uid());

-- self: poate insera propriul pontaj (la login)
create policy staff_pontaj_self_insert on staff_pontaj
  for insert to authenticated
  with check (user_id = auth.uid());

-- self: poate închide propriul pontaj (sign-out sau Încheie tura)
create policy staff_pontaj_self_update on staff_pontaj
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================
-- 3) RPC: deschide o sesiune nouă (apelat de client la sign-in)
--    Închide automat orice sesiune deschisă anterior pentru același user
--    (în caz că nu s-a făcut sign-out curat — browser închis brutal, etc).
-- ============================================================
create or replace function pontaj_open_session()
returns staff_pontaj
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_locatie uuid := user_locatie_id();
  v_row staff_pontaj;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Închide sesiuni reziduale (browser închis fără sign-out)
  update staff_pontaj
    set end_at = now(), source = 'auto_midnight'
    where user_id = v_user_id and end_at is null;

  -- Deschide sesiune nouă
  insert into staff_pontaj (user_id, locatie_id, source)
  values (v_user_id, v_locatie, 'login')
  returning * into v_row;

  return v_row;
end;
$$;

-- ============================================================
-- 4) RPC: închide sesiunea curentă (sign-out / Încheie tura)
-- ============================================================
create or replace function pontaj_close_session(p_source text default 'signout')
returns staff_pontaj
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_row staff_pontaj;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_source not in ('signout', 'manual', 'auto_midnight') then
    raise exception 'Invalid source: %', p_source;
  end if;

  update staff_pontaj
    set end_at = now(), source = p_source
    where user_id = v_user_id and end_at is null
    returning * into v_row;

  return v_row;
end;
$$;

-- ============================================================
-- 5) RPC: cron auto-close (apelat de cron-ul Vercel 00:00 UTC)
--    Închide TOATE sesiunile rămase deschise → end_at = start_at + interval
--    rezonabil (sau now() dacă start_at e prea recent).
-- ============================================================
create or replace function pontaj_auto_close_open_sessions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  -- Doar admin/owner sau cron pot rula (cron rulează ca service_role, deci sare RLS)
  if auth.uid() is not null and not is_admin() then
    raise exception 'Access denied';
  end if;

  update staff_pontaj
    set end_at = now(), source = 'auto_midnight'
    where end_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function pontaj_open_session() to authenticated;
grant execute on function pontaj_close_session(text) to authenticated;
grant execute on function pontaj_auto_close_open_sessions() to authenticated;
