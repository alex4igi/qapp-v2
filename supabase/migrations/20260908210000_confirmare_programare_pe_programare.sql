-- Confirmarea programarii se leaga de PROGRAMARE, nu de statusul leadului.
--
-- Inainte, drenarea cerea `leads.status='programat'`. Dar inscrierea la o clasa
-- demo din rosterul evenimentului (`inscrie_la_demo`) NU intoarce leadul in
-- „Programat" daca e deja mai departe in pipeline (a_venit) sau programat pe
-- altceva — corect pentru kanban, dar omul ramanea fara confirmare desi era pe
-- lista clasei. Acelasi tratament ca reminderul din cron-morning (pasul 1).
--
-- Fereastra de undo devine explicita: randul din coada tine `programare`, cu
-- ON DELETE CASCADE — daca receptia scoate omul de pe lista clasei in cele 2
-- minute, randul dispare si SMS-ul nu mai pleaca.

alter table confirmari_programare_sms
  add column if not exists programare uuid
    references programari_leads(id) on delete cascade;

-- Dedupul devine „am trimis confirmare pentru ACEASTA programare?", nu „am
-- trimis vreodata una acestui lead". Vechea forma facea ca o reprogramare
-- (marti → joi) sa nu mai anunte niciodata data noua.
alter table sms_logs
  add column if not exists programare uuid
    references programari_leads(id) on delete set null;

create index if not exists idx_sms_logs_programare
  on sms_logs (programare) where programare is not null;

-- Semnatura noua: primeste programarea. Vechea versiune cu un singur argument se
-- sterge (un default pe al doilea ar face apelul cu 1 argument ambiguu).
drop function if exists enqueue_confirmare_programare(uuid);

create or replace function enqueue_confirmare_programare(
  p_lead       uuid,
  p_programare uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_programare uuid;
begin
  -- Fallback cand callerul nu are id-ul la indemana: ultima programare creata
  -- care e inca in picioare (azi sau in viitor, neconsumata).
  v_programare := p_programare;
  if v_programare is null then
    select id into v_programare
      from programari_leads
     where lead = p_lead
       and prezenta = 'programat'
       and data_programarii >= current_date
     order by created desc
     limit 1;
  end if;

  insert into confirmari_programare_sms (lead_id, programare, status, send_after, error, trimis_la)
  values (p_lead, v_programare, 'programat', now() + interval '2 minutes', null, null)
  on conflict (lead_id) do update
    set programare = excluded.programare,
        status = 'programat',
        send_after = now() + interval '2 minutes',
        error = null,
        trimis_la = null;
end;
$$;

grant execute on function enqueue_confirmare_programare(uuid, uuid) to authenticated;
revoke execute on function enqueue_confirmare_programare(uuid, uuid) from anon, public;

-- Backfill: randurile aflate in coada acum primesc programarea corespunzatoare,
-- ca drenarea de dupa deploy sa nu le trateze ca legacy.
update confirmari_programare_sms c
   set programare = (
     select p.id from programari_leads p
      where p.lead = c.lead_id
        and p.prezenta = 'programat'
        and p.data_programarii >= current_date
      order by p.created desc
      limit 1
   )
 where c.programare is null
   and c.status = 'programat';

-- Walk-in-ul intoarce si id-ul programarii, ca frontendul sa lege confirmarea de
-- ea (altfel ar cadea pe fallback-ul „ultima programare a leadului").
create or replace function creeaza_lead_si_inscrie_la_demo(
  p_eveniment        uuid,
  p_nume             text,
  p_telefon          text,
  p_prenume          text    default null,
  p_varsta           int     default null,
  p_interes          text    default null,
  p_adus_de          uuid    default null,
  p_sursa            text    default 'walk_in',
  p_permite_overbook boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  e        record;
  v_lead   uuid;
  v_progr  uuid;
  v_creat  boolean := false;
  v_deja   boolean := false;
  v_tel9   text;
begin
  if auth_role() not in ('owner', 'admin', 'manager', 'front_desk') then
    raise exception 'Acces interzis.';
  end if;
  if coalesce(btrim(p_nume), '') = '' then
    raise exception 'Numele e obligatoriu.';
  end if;

  v_tel9 := right(regexp_replace(coalesce(p_telefon, ''), '\D', '', 'g'), 9);
  if length(v_tel9) < 9 then
    raise exception 'Telefon invalid.';
  end if;

  select * into e from evenimente where id = p_eveniment;
  if not found then
    raise exception 'Evenimentul nu exista.';
  end if;

  select id into v_lead
    from leads
   where right(regexp_replace(coalesce(telefon, ''), '\D', '', 'g'), 9) = v_tel9
   order by created desc
   limit 1;

  if v_lead is null then
    insert into leads (nume, prenume, telefon, varsta, interes, status, sursa, locatia)
    values (
      btrim(p_nume),
      nullif(btrim(coalesce(p_prenume, '')), ''),
      btrim(p_telefon),
      p_varsta,
      nullif(p_interes, '')::interes_lead,
      'nou',
      e.campanie,
      (select nume from locatii where id = e.locatie_id)
    )
    returning id into v_lead;
    v_creat := true;
  else
    v_deja := exists (
      select 1 from programari_leads
       where lead = v_lead and eveniment_programat = p_eveniment
    );
  end if;

  v_progr := inscrie_la_demo(p_eveniment, v_lead, null, p_sursa, p_adus_de, p_permite_overbook);

  return jsonb_build_object(
    'lead_id', v_lead,
    'programare_id', v_progr,
    'created', v_creat,
    'deja_inscris', v_deja
  );
end;
$$;

revoke execute on function creeaza_lead_si_inscrie_la_demo(uuid, text, text, text, int, text, uuid, text, boolean) from anon, public;
grant  execute on function creeaza_lead_si_inscrie_la_demo(uuid, text, text, text, int, text, uuid, text, boolean) to authenticated;
