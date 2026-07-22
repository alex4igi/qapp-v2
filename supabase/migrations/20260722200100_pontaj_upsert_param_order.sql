-- `pontaj_upsert_manual` avea `p_id` primul și fără default → tipurile generate îl
-- cereau obligatoriu (`p_id: string`), deși la ADĂUGARE e null. Reordonăm ca
-- parametrul opțional să fie ultimul (constrângere Postgres) și să apară în
-- database.ts ca `p_id?: string` — altfel clientul ar fi trebuit să mintă tipul.

drop function if exists pontaj_upsert_manual(uuid, uuid, timestamptz, timestamptz, uuid, text);

create or replace function pontaj_upsert_manual(
  p_user_id uuid,
  p_start   timestamptz,
  p_end     timestamptz,
  p_locatie uuid,
  p_motiv   text,
  p_id      uuid default null
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

grant execute on function pontaj_upsert_manual(uuid, timestamptz, timestamptz, uuid, text, uuid) to authenticated;
revoke execute on function pontaj_upsert_manual(uuid, timestamptz, timestamptz, uuid, text, uuid) from anon, public;
