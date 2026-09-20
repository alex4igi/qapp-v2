-- Recepția corectează forma de plată, dar nu suma/data/ștergerea (meniul din
-- /plati: „Corectează forma de plată" e pentru tot staff-ul, „Editează sau șterge"
-- doar pentru manager+). După ce UPDATE-ul direct pe `incasari` a fost revocat
-- (20260920151546), fluxul ăsta are nevoie de RPC-ul lui, cu același audit.
create or replace function corecteaza_metoda_incasare(
  p_id     uuid,
  p_metoda text,
  p_motiv  text
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

revoke execute on function corecteaza_metoda_incasare(uuid, text, text) from anon, public;
grant execute on function corecteaza_metoda_incasare(uuid, text, text) to authenticated;
