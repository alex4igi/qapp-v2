-- Delimitarea înrolărilor la sfârșitul sezonului.
--
-- Problema: la arhivarea unui sezon codul seta doar sezoane.stare='arhivat', fără
-- să închidă data_final pe înrolări. Înrolările migrate din v1 / per-ședință au rămas
-- cu data_final=NULL → tratate ca „active la infinit" în roster, acoperire-lună și
-- cross-sell (ex: un client cu abonament vechi deschis pare să aibă încă un abonament
-- recurent activ și declanșează fals politica −10%).
--
-- Fix: când un sezon trece în 'arhivat', închidem data_final pe înrolările lui rămase
-- deschise la LEAST(sfârșitul lunii data_incepere, sezon.data_final) — aceeași convenție
-- ca buildRecurentPerLuna (înrolare lunară = se închide la finalul lunii ei), fără a
-- depăși sfârșitul sezonului. Apelat din activate_sezon + archive_expired_sezoane.

create or replace function close_season_open_enrollments(p_sezon uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_data_final date;
begin
  select data_final into v_data_final from sezoane where id = p_sezon;
  if v_data_final is null then
    return 0;
  end if;

  with upd as (
    update enrollments e
    set data_final = least(
          (date_trunc('month', e.data_incepere) + interval '1 month - 1 day')::date,
          v_data_final)
    where e.sezon_id = p_sezon
      and e.data_final is null
      and e.data_incepere is not null
    returning e.id
  )
  select count(*) into v_count from upd;
  return v_count;
end;
$$;

grant execute on function close_season_open_enrollments(uuid) to authenticated;

-- ============================================================================
-- Recreez activate_sezon: după arhivarea sezonului activ, îi închid înrolările.
-- ============================================================================
create or replace function activate_sezon(p_sezon_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stare text;
  v_arhivat uuid;
begin
  if not is_admin() then
    raise exception 'Acces refuzat: doar admin poate activa sezoane.';
  end if;

  select stare into v_stare from sezoane where id = p_sezon_id;
  if v_stare is null then
    raise exception 'Sezonul nu există.';
  end if;
  if v_stare = 'activ' then
    return;
  end if;
  if v_stare = 'arhivat' then
    raise exception 'Sezonul este arhivat și nu poate fi reactivat.';
  end if;

  update sezoane set stare = 'arhivat' where stare = 'activ'
  returning id into v_arhivat;
  if v_arhivat is not null then
    perform close_season_open_enrollments(v_arhivat);
  end if;

  update sezoane set stare = 'activ' where id = p_sezon_id;
end;
$$;

grant execute on function activate_sezon(uuid) to authenticated;

-- ============================================================================
-- Recreez archive_expired_sezoane: închid înrolările fiecărui sezon arhivat.
-- ============================================================================
create or replace function archive_expired_sezoane()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
  v_id uuid;
begin
  for v_id in
    update sezoane
    set stare = 'arhivat'
    where stare = 'activ'
      and data_final is not null
      and data_final < current_date
    returning id
  loop
    perform close_season_open_enrollments(v_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

grant execute on function archive_expired_sezoane() to authenticated;
