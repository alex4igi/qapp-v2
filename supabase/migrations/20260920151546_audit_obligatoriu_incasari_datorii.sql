-- Urmă obligatorie pe bani (audit 2026-09-20, secțiunea 4.7).
--
-- Până acum `authenticated` avea UPDATE/DELETE direct pe `incasari` și `datorii`,
-- iar rândul din `audit_log` îl scria APLICAȚIA, dintr-un al doilea apel. Cine
-- lovea PostgREST direct cu tokenul lui (orice cont de staff, recepția inclusă)
-- schimba o sumă sau ștergea o datorie fără să rămână nimic în bază.
--
-- Acum:
--   • `incasari` — modificarea și ștergerea trec prin RPC-uri definer care scriu
--     auditul în ACEEAȘI tranzacție; dreptul direct de UPDATE/DELETE e revocat.
--     INSERT-ul (încasare nouă) rămâne direct, ca până acum.
--   • `datorii` — UPDATE-ul direct e revocat (nimic din aplicație nu-l folosea;
--     recalculele de reduceri merg prin funcții definer). DELETE-ul rămâne, fiindcă
--     anularea unei închirieri îl folosește, dar e prins de un trigger de audit.
--     Nu punem trigger și pe UPDATE: recalculul de reduceri atinge mii de rânduri
--     și ar îneca jurnalul.

-- ============================================================
-- 1) incasari — modificare
-- ============================================================
create or replace function edit_incasare(
  p_id         uuid,
  p_data       date,
  p_suma       numeric,
  p_metoda     text,
  p_observatii text,
  p_motiv      text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old   incasari;
  v_motiv text := nullif(btrim(p_motiv), '');
  v_rol   text := (select auth_role());
begin
  -- Oglindește gardul din UI (`isManagerOrHigher`, PlatiListPage).
  if v_rol not in ('owner', 'admin', 'manager') then
    raise exception 'Acces refuzat.' using errcode = '42501';
  end if;
  if v_motiv is null then
    raise exception 'Motivul modificării e obligatoriu.';
  end if;

  select * into v_old from incasari where id = p_id;
  if not found then
    raise exception 'Încasarea nu există.';
  end if;

  update incasari
     set data       = p_data,
         suma       = p_suma,
         metoda     = nullif(p_metoda, '')::metoda_plata,
         observatii = p_observatii,
         updated    = now()
   where id = p_id;

  insert into audit_log (
    actor_id, actor_role, action, entity_type, entity_id,
    old_value, new_value, reason, locatie_id
  ) values (
    auth.uid(), v_rol, 'incasare_modified', 'incasare', p_id,
    jsonb_build_object('data', v_old.data, 'suma', v_old.suma,
                       'metoda', v_old.metoda, 'observatii', v_old.observatii),
    jsonb_build_object('data', p_data, 'suma', p_suma,
                       'metoda', nullif(p_metoda, ''), 'observatii', p_observatii),
    v_motiv, v_old.locatie
  );
end;
$$;

-- ============================================================
-- 2) incasari — ștergere
-- ============================================================
create or replace function delete_incasare(
  p_id    uuid,
  p_motiv text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old   incasari;
  v_nume  text;
  v_motiv text := nullif(btrim(p_motiv), '');
  v_rol   text := (select auth_role());
begin
  if v_rol not in ('owner', 'admin', 'manager') then
    raise exception 'Acces refuzat.' using errcode = '42501';
  end if;
  if v_motiv is null then
    raise exception 'Motivul ștergerii e obligatoriu.';
  end if;

  select * into v_old from incasari where id = p_id;
  if not found then
    raise exception 'Încasarea nu există.';
  end if;

  select btrim(coalesce(c.nume, '') || ' ' || coalesce(c.prenume, ''))
    into v_nume
    from clienti c
   where c.id = v_old.client;

  delete from incasari where id = p_id;

  insert into audit_log (
    actor_id, actor_role, action, entity_type, entity_id,
    old_value, new_value, reason, locatie_id
  ) values (
    auth.uid(), v_rol, 'incasare_deleted', 'incasare', p_id,
    jsonb_build_object('data', v_old.data, 'suma', v_old.suma,
                       'metoda', v_old.metoda, 'categorie', v_old.categorie,
                       'client', nullif(v_nume, ''), 'client_id', v_old.client,
                       'observatii', v_old.observatii),
    null, v_motiv, v_old.locatie
  );
end;
$$;

-- ============================================================
-- 3) datorii — trigger de audit pe ștergere
-- ============================================================
create or replace function audit_datorie_stearsa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Un cron sau o edge function nu are auth.uid(): spunem pe șleau cine a fost.
  v_rol text := case when auth.uid() is null then current_user else (select auth_role()) end;
begin
  insert into audit_log (
    actor_id, actor_role, action, entity_type, entity_id,
    old_value, new_value, reason, locatie_id
  ) values (
    auth.uid(), v_rol, 'datorie_deleted', 'datorie', old.id,
    jsonb_build_object('suma_datorata', old.suma_datorata, 'categorie', old.categorie,
                       'descriere', old.descriere, 'client', old.client,
                       'sezon', old.sezon),
    null, null, old.locatie
  );
  return old;
end;
$$;

drop trigger if exists trg_audit_datorie_stearsa on datorii;
create trigger trg_audit_datorie_stearsa
  after delete on datorii
  for each row execute function audit_datorie_stearsa();

-- ============================================================
-- 4) Drepturi
-- ============================================================
revoke update, delete on incasari from authenticated, anon;
revoke update on datorii from authenticated, anon;

revoke execute on function edit_incasare(uuid, date, numeric, text, text, text) from anon, public;
revoke execute on function delete_incasare(uuid, text) from anon, public;
revoke execute on function audit_datorie_stearsa() from anon, public, authenticated;

grant execute on function edit_incasare(uuid, date, numeric, text, text, text) to authenticated;
grant execute on function delete_incasare(uuid, text) to authenticated;
