-- Cand o clasa demo se umple, decidentii afla imediat — notificarea e un TODO
-- („mai vin cereri? programeaza inca una"), nu o simpla informare. Crearea clasei
-- noi ramane MANUALA: nu inventam sloturi in orar fara om (sala, teacher si ora
-- se negociaza offline).

create or replace function notifica_demo_class_completa(p_eveniment uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  e           record;
  v_recipient uuid;
  v_count     integer := 0;
  v_cand      text;
begin
  select ev.id, ev.nume_eveniment, ev.data, ev.ora, ev.locatia, ev.capacitate,
         c.numele as curs_tinta_nume
    into e
    from evenimente ev
    left join cursuri c on c.id = ev.curs_tinta
   where ev.id = p_eveniment;

  -- Fara capacitate setata nu exista prag de umplere.
  if not found or e.capacitate is null then
    return 0;
  end if;

  -- O singura data per eveniment: umplerea e un prag traversat, nu o stare. Daca
  -- se anuleaza o inscriere si clasa se umple la loc, nu re-notificam.
  if exists (
    select 1 from notifications
     where kind = 'demo_class_full'
       and payload->>'eveniment_id' = p_eveniment::text
  ) then
    return 0;
  end if;

  -- `evenimente.ora` e text liber („18:00"), nu `time` — se taie, nu se formateaza.
  v_cand := coalesce(
    to_char(e.data, 'DD.MM.YYYY') || coalesce(' ' || left(e.ora, 5), ''),
    'fără dată'
  );

  for v_recipient in
    select id from auth.users
     where raw_app_meta_data->>'role' in ('owner', 'admin', 'manager')
  loop
    insert into notifications (
      recipient_user_id, kind, title, body, payload, requires_action, status
    ) values (
      v_recipient,
      'demo_class_full',
      format('Clasă demo completă: %s', e.nume_eveniment),
      format(
        '%s%s · %s. Dacă mai vin cereri, programează încă o clasă demo.',
        v_cand,
        coalesce(' · ' || nullif(e.locatia, ''), ''),
        case when e.capacitate = 1
             then 'singurul loc e ocupat'
             else format('toate cele %s locuri sunt ocupate', e.capacitate) end
      ),
      jsonb_build_object(
        'eveniment_id', e.id,
        'nume', e.nume_eveniment,
        'data', e.data,
        'capacitate', e.capacitate,
        'curs_tinta', e.curs_tinta_nume
      ),
      true,
      'open'
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function notifica_demo_class_completa(uuid) from anon, public;
grant  execute on function notifica_demo_class_completa(uuid) to authenticated;

-- ============================================================
-- `inscrie_la_demo`: acelasi corp ca in 20260831180000, plus alarma de umplere.
-- Se declanseaza doar la o inscriere NOUA care atinge capacitatea (inclusiv prin
-- overbook, unde depaseste) — nu la reinscrierea cuiva deja pe lista.
-- ============================================================
create or replace function inscrie_la_demo(
  p_eveniment        uuid,
  p_lead             uuid    default null,
  p_client           uuid    default null,
  p_sursa            text    default 'receptie',
  p_adus_de          uuid    default null,
  p_permite_overbook boolean default false,
  p_data_programarii date    default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  e        record;
  v_ocupat int;
  v_id     uuid;
  v_data   date;
  v_nou    boolean;
begin
  if auth_role() not in ('owner', 'admin', 'manager', 'front_desk') then
    raise exception 'Acces interzis.';
  end if;
  if num_nonnulls(p_lead, p_client) <> 1 then
    raise exception 'Trebuie exact un lead SAU un client.';
  end if;

  select * into e from evenimente where id = p_eveniment for update;
  if not found then
    raise exception 'Evenimentul nu exista.';
  end if;
  if e.status = 'Anulat' then
    raise exception 'Evenimentul e anulat.';
  end if;
  v_data := coalesce(p_data_programarii, e.data);

  if p_lead is not null then
    select id into v_id from programari_leads
     where lead = p_lead and eveniment_programat = p_eveniment limit 1;
  else
    select id into v_id from evenimente_participanti
     where client = p_client and eveniment = p_eveniment limit 1;
  end if;

  v_nou := v_id is null;

  if v_nou then
    v_ocupat := locuri_ocupate_eveniment(p_eveniment);
    if e.capacitate is not null and v_ocupat >= e.capacitate and not p_permite_overbook then
      raise exception 'Clasa demo e completa (% / % locuri). Se poate inscrie peste capacitate din fisa clasei.',
        v_ocupat, e.capacitate;
    end if;
  end if;

  if p_lead is not null then
    if v_nou then
      insert into programari_leads (
        lead, eveniment_programat, locatie, data_programarii, ora,
        prezenta, sursa_inscriere, adus_de
      ) values (
        p_lead, p_eveniment, e.locatie_id, v_data, e.ora,
        'programat', p_sursa, p_adus_de
      ) returning id into v_id;
    else
      -- Reprogramare pe ACELASI slot: actualizam, nu inseram (indexul unic partial
      -- ar da 23505 si receptia ar vedea „Exista deja o inregistrare cu aceste date").
      update programari_leads
         set data_programarii = v_data,
             ora = e.ora,
             locatie = coalesce(e.locatie_id, locatie),
             sursa_inscriere = coalesce(p_sursa, sursa_inscriere),
             adus_de = coalesce(p_adus_de, adus_de),
             updated = now()
       where id = v_id;
    end if;

    update leads
       set status = 'programat', data_programare = v_data, updated = now()
     where id = p_lead
       and status in ('nou', 'contactat', 'waiting_list', 'nurture', 'nu_a_venit');
  else
    if v_nou then
      insert into evenimente_participanti (eveniment, client, sursa_inscriere, adus_de)
      values (p_eveniment, p_client, p_sursa, p_adus_de)
      returning id into v_id;
    else
      update evenimente_participanti
         set sursa_inscriere = coalesce(p_sursa, sursa_inscriere),
             adus_de = coalesce(p_adus_de, adus_de),
             updated = now()
       where id = v_id;
    end if;
    update evenimente
       set participant = case
             when p_client = any(coalesce(participant, '{}'::uuid[])) then participant
             else coalesce(participant, '{}'::uuid[]) || p_client
           end,
           updated = now()
     where id = p_eveniment;
  end if;

  if v_nou and e.capacitate is not null then
    if locuri_ocupate_eveniment(p_eveniment) >= e.capacitate then
      perform notifica_demo_class_completa(p_eveniment);
    end if;
  end if;

  return v_id;
end;
$$;

revoke execute on function inscrie_la_demo(uuid, uuid, uuid, text, uuid, boolean, date) from anon, public;
grant  execute on function inscrie_la_demo(uuid, uuid, uuid, text, uuid, boolean, date) to authenticated;
