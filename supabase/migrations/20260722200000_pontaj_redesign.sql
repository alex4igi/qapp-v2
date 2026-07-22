-- Qapp v2 — Pontaj: redesign de la „log de sesiune auth" la pontaj explicit.
-- Decizie user 2026-07-22.
--
-- Problema de fond: pontajul era un efect secundar al autentificării (login deschidea
-- tura, logout/idle o închidea). Auth ≠ prezență: lucrezi fără să deschizi app-ul → 0 ore;
-- intri de acasă seara → tură. Iar idle-ul de 30 min tăia ture reale (recepția e legitim
-- plecată de la tab). Cu pontajul ca SUGESTIE pentru salariu, orele trebuie să provină
-- dintr-o declarație explicită, corectabilă, nu dintr-un artefact de sesiune.
--
-- Trei straturi: (1) pontare explicită, (2) corecție cu motiv + audit, (3) lună aprobată
-- = propunerea pentru salariu (nu document de plată — owner decide final).
--
-- Rotunjire: la 15 min pe FIECARE capăt (nu pe durată). „Ai pontat 9:07, îți intră 9:00".

-- ============================================================
-- 1) Schema
-- ============================================================
alter table staff_pontaj
  add column if not exists status text not null default 'ok',
  add column if not exists minute_platibile integer,
  add column if not exists nota text,
  add column if not exists corectat_de uuid references auth.users(id) on delete set null,
  add column if not exists corectat_la timestamptz;

alter table staff_pontaj drop constraint if exists staff_pontaj_status_check;
alter table staff_pontaj add constraint staff_pontaj_status_check
  check (status in ('ok', 'necesita_confirmare', 'corectat', 'legacy'));

-- `source` își schimbă semantica: nu mai e „cum s-a închis sesiunea auth", ci
-- „de unde vine rândul". Vechile valori rămân permise pentru istoric (legacy).
alter table staff_pontaj drop constraint if exists staff_pontaj_source_check;
alter table staff_pontaj add constraint staff_pontaj_source_check
  check (source in (
    'checkin', 'auto_close', 'adaugat',
    'login', 'signout', 'manual', 'auto_midnight', 'idle'  -- istoric
  ));

create index if not exists idx_staff_pontaj_status on staff_pontaj(status)
  where status = 'necesita_confirmare';

-- Istoricul derivat din auth nu e prezență reală → nu intră în nicio propunere.
update staff_pontaj set status = 'legacy' where status = 'ok';

-- ============================================================
-- 2) Luni aprobate — snapshotul propunerii pentru salariu
-- ============================================================
create table if not exists pontaj_luni (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  luna         date not null,           -- prima zi a lunii (RO)
  total_minute integer not null,
  nr_ture      integer not null default 0,
  aprobat_de   uuid references auth.users(id) on delete set null,
  aprobat_la   timestamptz not null default now(),
  nota         text,
  created      timestamptz not null default now(),
  unique (user_id, luna)
);

create index if not exists idx_pontaj_luni_luna on pontaj_luni(luna desc);

alter table pontaj_luni enable row level security;

drop policy if exists pontaj_luni_admin_all on pontaj_luni;
create policy pontaj_luni_admin_all on pontaj_luni
  for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists pontaj_luni_self_select on pontaj_luni;
create policy pontaj_luni_self_select on pontaj_luni
  for select to authenticated using (user_id = auth.uid());

drop policy if exists pontaj_luni_manager_select on pontaj_luni;
create policy pontaj_luni_manager_select on pontaj_luni
  for select to authenticated using (is_manager());

-- Gard portal (regula din CLAUDE.md pentru orice tabel nou)
drop policy if exists deny_parinte_direct on pontaj_luni;
create policy deny_parinte_direct on pontaj_luni as restrictive for all to authenticated
  using (auth_role() <> 'parinte') with check (auth_role() <> 'parinte');

-- ============================================================
-- 3) RLS staff_pontaj: scrierea trece EXCLUSIV prin RPC
--    (RPC-urile sunt security definer → sar RLS). Un angajat nu-și mai poate
--    edita direct orele acum că influențează salariul.
-- ============================================================
drop policy if exists staff_pontaj_self_insert on staff_pontaj;
drop policy if exists staff_pontaj_self_update on staff_pontaj;

-- ============================================================
-- 4) Rotunjire + calcul minute plătibile
-- ============================================================
create or replace function pontaj_round_quarter(t timestamptz)
returns timestamptz
language sql
immutable
as $$
  select to_timestamp(round(extract(epoch from t) / 900.0) * 900);
$$;

create or replace function pontaj_calc_minute()
returns trigger
language plpgsql
as $$
begin
  if new.end_at is null then
    new.minute_platibile := null;
  else
    new.minute_platibile := greatest(0, (
      extract(epoch from (
        pontaj_round_quarter(new.end_at) - pontaj_round_quarter(new.start_at)
      )) / 60
    )::integer);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pontaj_calc_minute on staff_pontaj;
create trigger trg_pontaj_calc_minute
  before insert or update of start_at, end_at on staff_pontaj
  for each row execute function pontaj_calc_minute();

-- Backfill pentru rândurile existente (inclusiv legacy — ca raportul să fie complet)
update staff_pontaj set start_at = start_at where end_at is not null;

-- ============================================================
-- 5) Gard: luna aprobată e închisă la modificări
-- ============================================================
create or replace function pontaj_luna_e_aprobata(p_user uuid, p_moment timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from pontaj_luni
    where user_id = p_user
      and luna = date_trunc('month', (p_moment at time zone 'Europe/Bucharest'))::date
  );
$$;

create or replace function pontaj_guard_luna_aprobata()
returns trigger
language plpgsql
as $$
begin
  -- Verificăm AMBELE capete: mutarea unei ture dintr-o lună aprobată în alta
  -- neaprobată i-ar schimba totalul deja aprobat, la fel ca invers.
  if old is not null and pontaj_luna_e_aprobata(old.user_id, old.start_at) then
    raise exception 'Luna e deja aprobată pentru acest utilizator. Deblocheaz-o întâi.';
  end if;
  if new is not null and pontaj_luna_e_aprobata(new.user_id, new.start_at) then
    raise exception 'Luna e deja aprobată pentru acest utilizator. Deblocheaz-o întâi.';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_pontaj_guard_luna on staff_pontaj;
create trigger trg_pontaj_guard_luna
  before update or delete on staff_pontaj
  for each row execute function pontaj_guard_luna_aprobata();

-- ============================================================
-- 6) Check-in / check-out explicit
-- ============================================================
create or replace function pontaj_check_in(p_locatie uuid default null)
returns staff_pontaj
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_today   date := (now() at time zone 'Europe/Bucharest')::date;
  v_row     staff_pontaj;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Tură deja deschisă azi → o continuăm (dublu-click, alt device, reload).
  select * into v_row from staff_pontaj
    where user_id = v_user_id and end_at is null
      and (start_at at time zone 'Europe/Bucharest')::date = v_today
    order by start_at desc limit 1;
  if found then
    return v_row;
  end if;

  -- Ture reziduale din zile ANTERIOARE: închise la ora locației, marcate spre confirmare.
  update staff_pontaj
    set end_at = least(now(), pontaj_closing_at(start_at, locatie_id)),
        source = 'auto_close',
        status = 'necesita_confirmare'
    where user_id = v_user_id and end_at is null;

  insert into staff_pontaj (user_id, locatie_id, source, status)
  values (v_user_id, coalesce(p_locatie, user_locatie_id()), 'checkin', 'ok')
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function pontaj_check_out()
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

  update staff_pontaj
    set end_at = now(), status = 'ok'
    where user_id = v_user_id and end_at is null
    returning * into v_row;

  if not found then
    raise exception 'Nu ai nicio tură deschisă.';
  end if;

  return v_row;
end;
$$;

-- Starea curentă pentru butonul din Rail.
create or replace function pontaj_stare_curenta()
returns staff_pontaj
language sql
stable
security definer
set search_path = public
as $$
  select * from staff_pontaj
   where user_id = auth.uid() and end_at is null
   order by start_at desc limit 1;
$$;

-- ============================================================
-- 7) Corecție manuală (manager+) — motiv obligatoriu, scrisă în audit_log
-- ============================================================
create or replace function pontaj_upsert_manual(
  p_id      uuid,
  p_user_id uuid,
  p_start   timestamptz,
  p_end     timestamptz,
  p_locatie uuid,
  p_motiv   text
)
returns staff_pontaj
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old staff_pontaj;
  v_row staff_pontaj;
begin
  if not (is_admin() or is_manager()) then
    raise exception 'Access denied';
  end if;
  if coalesce(trim(p_motiv), '') = '' then
    raise exception 'Motivul corecției e obligatoriu.';
  end if;
  if p_end is not null and p_end <= p_start then
    raise exception 'Sfârșitul turei trebuie să fie după început.';
  end if;

  if p_id is null then
    insert into staff_pontaj (user_id, locatie_id, start_at, end_at, source, status, nota,
                              corectat_de, corectat_la)
    values (p_user_id, p_locatie, p_start, p_end, 'adaugat', 'corectat', p_motiv,
            auth.uid(), now())
    returning * into v_row;
  else
    select * into v_old from staff_pontaj where id = p_id;
    if not found then
      raise exception 'Tura nu există.';
    end if;

    update staff_pontaj
      set start_at = p_start,
          end_at   = p_end,
          locatie_id = p_locatie,
          status   = 'corectat',
          nota     = p_motiv,
          corectat_de = auth.uid(),
          corectat_la = now()
      where id = p_id
      returning * into v_row;
  end if;

  insert into audit_log (actor_id, actor_role, action, entity_type, entity_id,
                         old_value, new_value, reason, locatie_id)
  values (auth.uid(), auth_role(),
          case when p_id is null then 'pontaj_adaugat' else 'pontaj_corectat' end,
          'staff_pontaj', v_row.id,
          to_jsonb(v_old), to_jsonb(v_row), p_motiv, v_row.locatie_id);

  return v_row;
end;
$$;

-- Confirmă o tură închisă automat, fără a-i schimba orele.
create or replace function pontaj_confirma(p_id uuid)
returns staff_pontaj
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row staff_pontaj;
begin
  if not (is_admin() or is_manager()) then
    raise exception 'Access denied';
  end if;

  update staff_pontaj
    set status = 'ok', corectat_de = auth.uid(), corectat_la = now()
    where id = p_id and status = 'necesita_confirmare'
    returning * into v_row;

  if not found then
    raise exception 'Tura nu există sau nu necesită confirmare.';
  end if;

  insert into audit_log (actor_id, actor_role, action, entity_type, entity_id,
                         new_value, locatie_id)
  values (auth.uid(), auth_role(), 'pontaj_confirmat', 'staff_pontaj', v_row.id,
          to_jsonb(v_row), v_row.locatie_id);

  return v_row;
end;
$$;

create or replace function pontaj_sterge(p_id uuid, p_motiv text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old staff_pontaj;
begin
  if not is_admin() then
    raise exception 'Access denied';
  end if;
  if coalesce(trim(p_motiv), '') = '' then
    raise exception 'Motivul ștergerii e obligatoriu.';
  end if;

  select * into v_old from staff_pontaj where id = p_id;
  if not found then
    raise exception 'Tura nu există.';
  end if;

  delete from staff_pontaj where id = p_id;

  insert into audit_log (actor_id, actor_role, action, entity_type, entity_id,
                         old_value, reason, locatie_id)
  values (auth.uid(), auth_role(), 'pontaj_sters', 'staff_pontaj', p_id,
          to_jsonb(v_old), p_motiv, v_old.locatie_id);
end;
$$;

-- ============================================================
-- 8) Sumar lunar — ACEEAȘI sursă pentru previzualizarea din UI și pentru aprobare
--    (lecția din bf869d9: preview-ul trebuie să numere ce numără DB-ul)
-- ============================================================
create or replace function pontaj_sumar_luna(p_luna date)
returns table (
  user_id            uuid,
  total_minute       bigint,
  nr_ture            bigint,
  nr_neconfirmate    bigint,
  nr_deschise        bigint,
  aprobat            boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with luna as (
    select date_trunc('month', p_luna)::date as prima,
           (date_trunc('month', p_luna) + interval '1 month')::date as urmatoare
  )
  select p.user_id,
         coalesce(sum(p.minute_platibile), 0)::bigint,
         count(*)::bigint,
         count(*) filter (where p.status = 'necesita_confirmare')::bigint,
         count(*) filter (where p.end_at is null)::bigint,
         bool_or(l.id is not null)
    from staff_pontaj p
    cross join luna
    left join pontaj_luni l
      on l.user_id = p.user_id and l.luna = luna.prima
   where p.status <> 'legacy'
     and (p.start_at at time zone 'Europe/Bucharest')::date >= luna.prima
     and (p.start_at at time zone 'Europe/Bucharest')::date <  luna.urmatoare
     and (is_admin() or is_manager() or p.user_id = auth.uid())
   group by p.user_id;
$$;

create or replace function pontaj_aproba_luna(p_user_id uuid, p_luna date, p_nota text default null)
returns pontaj_luni
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prima date := date_trunc('month', p_luna)::date;
  v_sumar record;
  v_row   pontaj_luni;
begin
  if not is_admin() then
    raise exception 'Doar owner/admin pot aproba luna.';
  end if;

  select * into v_sumar from pontaj_sumar_luna(v_prima) where user_id = p_user_id;
  if not found then
    raise exception 'Nicio tură de aprobat în luna aleasă.';
  end if;
  if v_sumar.nr_deschise > 0 then
    raise exception 'Există ture încă deschise. Închide-le sau corectează-le întâi.';
  end if;
  if v_sumar.nr_neconfirmate > 0 then
    raise exception 'Există % ture neconfirmate. Confirmă-le sau corectează-le întâi.',
      v_sumar.nr_neconfirmate;
  end if;

  insert into pontaj_luni (user_id, luna, total_minute, nr_ture, aprobat_de, nota)
  values (p_user_id, v_prima, v_sumar.total_minute::integer, v_sumar.nr_ture::integer,
          auth.uid(), p_nota)
  returning * into v_row;

  insert into audit_log (actor_id, actor_role, action, entity_type, entity_id,
                         new_value, reason)
  values (auth.uid(), auth_role(), 'pontaj_luna_aprobata', 'pontaj_luni', v_row.id,
          to_jsonb(v_row), p_nota);

  return v_row;
end;
$$;

create or replace function pontaj_deblocheaza_luna(p_user_id uuid, p_luna date, p_motiv text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prima date := date_trunc('month', p_luna)::date;
  v_old   pontaj_luni;
begin
  if not is_admin() then
    raise exception 'Doar owner/admin pot debloca luna.';
  end if;
  if coalesce(trim(p_motiv), '') = '' then
    raise exception 'Motivul deblocării e obligatoriu.';
  end if;

  select * into v_old from pontaj_luni where user_id = p_user_id and luna = v_prima;
  if not found then
    raise exception 'Luna nu e aprobată.';
  end if;

  delete from pontaj_luni where id = v_old.id;

  insert into audit_log (actor_id, actor_role, action, entity_type, entity_id,
                         old_value, reason)
  values (auth.uid(), auth_role(), 'pontaj_luna_deblocata', 'pontaj_luni', v_old.id,
          to_jsonb(v_old), p_motiv);
end;
$$;

-- ============================================================
-- 9) Cron auto-close: nu mai inventează ore tăcut — marchează spre confirmare
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
  if auth.uid() is not null and not is_admin() then
    raise exception 'Access denied';
  end if;

  -- Doar turele din zile ANTERIOARE: o tură deschisă azi e legitimă (cron-ul rulează
  -- la 00:00 UTC = 03:00 RO, deci „azi" RO abia a început).
  update staff_pontaj
    set end_at = least(now(), pontaj_closing_at(start_at, locatie_id)),
        source = 'auto_close',
        status = 'necesita_confirmare'
    where end_at is null
      and (start_at at time zone 'Europe/Bucharest')::date
          < (now() at time zone 'Europe/Bucharest')::date;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ============================================================
-- 10) RPC-urile vechi derivate din auth — scoase din uz
-- ============================================================
drop function if exists pontaj_open_session();
drop function if exists pontaj_close_session(text);

-- ============================================================
-- 11) Granturi (regula CLAUDE.md: revoke anon/public pe fiecare security definer nou)
-- ============================================================
grant execute on function pontaj_check_in(uuid)            to authenticated;
grant execute on function pontaj_check_out()               to authenticated;
grant execute on function pontaj_stare_curenta()           to authenticated;
grant execute on function pontaj_upsert_manual(uuid, uuid, timestamptz, timestamptz, uuid, text) to authenticated;
grant execute on function pontaj_confirma(uuid)            to authenticated;
grant execute on function pontaj_sterge(uuid, text)        to authenticated;
grant execute on function pontaj_sumar_luna(date)          to authenticated;
grant execute on function pontaj_aproba_luna(uuid, date, text) to authenticated;
grant execute on function pontaj_deblocheaza_luna(uuid, date, text) to authenticated;
grant execute on function pontaj_luna_e_aprobata(uuid, timestamptz) to authenticated;

revoke execute on function pontaj_check_in(uuid)            from anon, public;
revoke execute on function pontaj_check_out()               from anon, public;
revoke execute on function pontaj_stare_curenta()           from anon, public;
revoke execute on function pontaj_upsert_manual(uuid, uuid, timestamptz, timestamptz, uuid, text) from anon, public;
revoke execute on function pontaj_confirma(uuid)            from anon, public;
revoke execute on function pontaj_sterge(uuid, text)        from anon, public;
revoke execute on function pontaj_sumar_luna(date)          from anon, public;
revoke execute on function pontaj_aproba_luna(uuid, date, text) from anon, public;
revoke execute on function pontaj_deblocheaza_luna(uuid, date, text) from anon, public;
revoke execute on function pontaj_luna_e_aprobata(uuid, timestamptz) from anon, public;
revoke execute on function pontaj_round_quarter(timestamptz) from anon, public;
revoke execute on function pontaj_auto_close_open_sessions() from anon, public;
