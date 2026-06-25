-- Qapp v2 — Pontaj: închidere corectă a turilor uitate deschise.
-- Problemă: turile rămase deschise (browser închis fără sign-out) se închideau cu
-- end_at = now() la cronul de 00:00 UTC (= 02:00/03:00 RO) → ore fictive.
-- Decizie user 2026-06-25: închidem la ORA DE ÎNCHIDERE A LOCAȚIEI din ziua turei.
-- + sursă nouă 'idle' pentru delogarea automată după inactivitate (client-side).

-- ============================================================
-- 1) Oră de închidere per locație (configurabilă în Setări → Locații)
-- ============================================================
alter table locatii add column if not exists ora_inchidere time not null default '22:00';

-- ============================================================
-- 2) Sursă nouă 'idle' pe staff_pontaj
-- ============================================================
alter table staff_pontaj drop constraint if exists staff_pontaj_source_check;
alter table staff_pontaj add constraint staff_pontaj_source_check
  check (source in ('login','signout','manual','auto_midnight','idle'));

-- ============================================================
-- 3) Helper: datetime-ul de închidere pentru o tură, pe data RO a lui start_at
-- ============================================================
create or replace function pontaj_closing_at(p_start timestamptz, p_locatie uuid)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ora   time;
  v_close timestamptz;
begin
  select ora_inchidere into v_ora from locatii where id = p_locatie;
  if v_ora is null then
    v_ora := '22:00';  -- fallback dacă locația lipsește sau n-are oră setată
  end if;

  -- data calendaristică RO a startului + ora de închidere, re-convertit în timestamptz
  v_close := (((p_start at time zone 'Europe/Bucharest')::date + v_ora)
              at time zone 'Europe/Bucharest');

  -- gard: login după ora de închidere → durată 0 (nu negativă)
  if v_close <= p_start then
    v_close := p_start;
  end if;

  return v_close;
end;
$$;

-- ============================================================
-- 4) Rescrie cronul auto-close: end_at = min(now, ora închidere locație)
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
  -- Doar admin/owner sau cron (service_role sare RLS) pot rula
  if auth.uid() is not null and not is_admin() then
    raise exception 'Access denied';
  end if;

  update staff_pontaj
    set end_at = least(now(), pontaj_closing_at(start_at, locatie_id)),
        source = 'auto_midnight'
    where end_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ============================================================
-- 5) open_session: închiderea turei reziduale folosește aceeași logică
--    (next-login de a doua zi nu mai inflatează ora)
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

  -- Închide sesiuni reziduale (browser închis fără sign-out) la ora de închidere
  update staff_pontaj
    set end_at = least(now(), pontaj_closing_at(start_at, locatie_id)),
        source = 'auto_midnight'
    where user_id = v_user_id and end_at is null;

  -- Deschide sesiune nouă
  insert into staff_pontaj (user_id, locatie_id, source)
  values (v_user_id, v_locatie, 'login')
  returning * into v_row;

  return v_row;
end;
$$;

-- ============================================================
-- 6) close_session: acceptă și sursa 'idle'
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

  if p_source not in ('signout', 'manual', 'auto_midnight', 'idle') then
    raise exception 'Invalid source: %', p_source;
  end if;

  update staff_pontaj
    set end_at = now(), source = p_source
    where user_id = v_user_id and end_at is null
    returning * into v_row;

  return v_row;
end;
$$;

grant execute on function pontaj_closing_at(timestamptz, uuid) to authenticated;
