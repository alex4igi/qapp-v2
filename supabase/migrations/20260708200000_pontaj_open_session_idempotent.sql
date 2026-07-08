-- Qapp v2 — Pontaj: pontaj_open_session() idempotentă pe ziua calendaristică RO.
-- Problemă: contul partajat de recepție genera multe ture scurte pe aceeași zi. Fiecare
-- SIGNED_IN (reload / focus tab / alt device) reapela pontaj_open_session(), care închidea
-- tura reziduală la now() cu source='auto_midnight' și deschidea una nouă → tura continuă se
-- fragmenta, iar închiderile de zi apăreau greșit ca „auto (ora închidere)".
-- Decizie user 2026-07-08: un cont = o tură pe zi. Dacă există deja o tură deschisă începută
-- azi (RO), o returnăm neschimbată; doar turile reziduale din zile ANTERIOARE se închid (la ora
-- lor de închidere) și abia atunci se deschide una nouă. Efect secundar: 'auto_midnight' se mai
-- setează doar când least() alege efectiv ora de închidere → eticheta redevine adevărată.

create or replace function pontaj_open_session()
returns staff_pontaj
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_locatie uuid := user_locatie_id();
  v_today   date := (now() at time zone 'Europe/Bucharest')::date;
  v_row     staff_pontaj;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Tură deja deschisă azi? → o continuăm, nu fragmentăm (reload / focus / multi-device).
  select * into v_row from staff_pontaj
    where user_id = v_user_id and end_at is null
      and (start_at at time zone 'Europe/Bucharest')::date = v_today
    order by start_at desc limit 1;
  if found then
    return v_row;
  end if;

  -- Doar turile reziduale din zile ANTERIOARE se închid, la ora lor de închidere.
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

grant execute on function pontaj_open_session() to authenticated;
