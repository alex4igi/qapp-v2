-- Doua corecturi pe `inscrie_la_demo`, ca programarea din /leads sa poata trece
-- prin el (vezi migratia de cod care schimba LeadModal):
--
-- 1. Eroarea de capacitate ridica P0001 (raise_exception), nu 23514. `humanizeError`
--    mapeaza 23514 la un generic „O valoare nu respecta regulile", care ascundea
--    exact mesajul util („Clasa e completa (8 / 8 locuri)"). P0001 trece ca text.
--
-- 2. `p_data_programarii` optional: LeadModal lasa recepția sa aleaga data, iar
--    pentru un eveniment fara `data` setata programarea ar fi ramas fara zi.
--    Implicit ramane data evenimentului.

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

  if v_id is null then
    v_ocupat := locuri_ocupate_eveniment(p_eveniment);
    if e.capacitate is not null and v_ocupat >= e.capacitate and not p_permite_overbook then
      raise exception 'Clasa demo e completa (% / % locuri). Se poate inscrie peste capacitate din fisa clasei.',
        v_ocupat, e.capacitate;
    end if;
  end if;

  if p_lead is not null then
    if v_id is null then
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
    if v_id is null then
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

  return v_id;
end;
$$;

-- Semnatura veche (6 argumente) ramane in DB dupa CREATE OR REPLACE cu un parametru
-- nou cu default? NU — `create or replace` cu parametru suplimentar creeaza un
-- OVERLOAD, iar PostgREST da PGRST203 (ambiguous) la apelul fara el. Stergem vechea.
drop function if exists inscrie_la_demo(uuid, uuid, uuid, text, uuid, boolean);

revoke execute on function inscrie_la_demo(uuid, uuid, uuid, text, uuid, boolean, date) from anon, public;
grant  execute on function inscrie_la_demo(uuid, uuid, uuid, text, uuid, boolean, date) to authenticated;
