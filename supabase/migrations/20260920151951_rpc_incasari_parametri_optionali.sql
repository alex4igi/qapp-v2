-- Parametrii care pot fi null primesc DEFAULT: așa `supabase gen types` îi scrie
-- opționali (`p_suma?: number`) și TypeScript-ul poate trimite `undefined` în loc
-- de `null`. Fără asta, tipurile generate cer valori non-null și apelul nu compilează.
-- Reordonarea cere drop: Postgres nu schimbă ordinea parametrilor la `replace`.
drop function if exists edit_incasare(uuid, date, numeric, text, text, text);
drop function if exists corecteaza_metoda_incasare(uuid, text, text);

create or replace function edit_incasare(
  p_id         uuid,
  p_motiv      text,
  p_data       date    default null,
  p_suma       numeric default null,
  p_metoda     text    default null,
  p_observatii text    default null
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

  -- Scrie TOATE cele patru coloane: apelantul (updateIncasareWithAudit) le
  -- completează din valorile curente, deci un null aici e un null voit.
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

create or replace function corecteaza_metoda_incasare(
  p_id     uuid,
  p_motiv  text,
  p_metoda text default null
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
  if v_rol not in ('owner', 'admin', 'manager', 'front_desk') then
    raise exception 'Acces refuzat.' using errcode = '42501';
  end if;
  if v_motiv is null then
    raise exception 'Motivul corectării e obligatoriu.';
  end if;

  select * into v_old from incasari where id = p_id;
  if not found then
    raise exception 'Încasarea nu există.';
  end if;

  -- „Online" = Netopia din portal; forma de plată nu e o alegere a recepției.
  if v_old.metoda = 'Online'::metoda_plata then
    raise exception 'Plata online nu își schimbă forma de plată.';
  end if;

  update incasari
     set metoda  = nullif(p_metoda, '')::metoda_plata,
         updated = now()
   where id = p_id;

  insert into audit_log (
    actor_id, actor_role, action, entity_type, entity_id,
    old_value, new_value, reason, locatie_id
  ) values (
    auth.uid(), v_rol, 'incasare_modified', 'incasare', p_id,
    jsonb_build_object('suma', v_old.suma, 'metoda', v_old.metoda),
    jsonb_build_object('suma', v_old.suma, 'metoda', nullif(p_metoda, '')),
    v_motiv, v_old.locatie
  );
end;
$$;

revoke execute on function edit_incasare(uuid, text, date, numeric, text, text) from anon, public;
revoke execute on function corecteaza_metoda_incasare(uuid, text, text) from anon, public;
grant execute on function edit_incasare(uuid, text, date, numeric, text, text) to authenticated;
grant execute on function corecteaza_metoda_incasare(uuid, text, text) to authenticated;
