-- Prezenta unui lead, marcata pe programarea CORECTA si de catre rolul care
-- chiar sta in sala.
--
-- Doua probleme rezolvate aici:
--
-- 1. `teacher` nu putea marca deloc prezenta unui lead. RLS-ul restrange
--    scrierile pe `programari_leads`/`leads` la admin|owner|manager|front_desk
--    (20260515110000, 20260527190000), dar /grupa e deschisa si teacherilor —
--    click-ul pe bifa returna PGRST116 in tacere.
--
-- 2. Scrierea nu era legata de ora marcata: codul TS tintea mereu „ultima
--    programare" a leadului. Aici tintim explicit evenimentul (clasa demo) sau
--    perechea (curs, zi).
--
-- RPC-ul scrie DOAR prezenta. Efectele de pipeline (leads.status, contorul de
-- neprezentari via trigger, SMS-ul de follow-up, trecerea in nurture la a 2-a
-- neprezentare) raman pe calea TS a recepției: un teacher care bifeaza cine a
-- venit nu trebuie sa declanseze SMS-uri catre lead.

create or replace function marcheaza_prezenta_lead_demo(
  p_eveniment uuid,
  p_lead      uuid,
  p_prezenta  prezenta_lead
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if auth_role() not in ('owner', 'admin', 'manager', 'front_desk', 'teacher') then
    raise exception 'Acces interzis.';
  end if;

  -- Tiebreaker pe `created`: doua programari ale aceluiasi lead pe acelasi
  -- eveniment nu pot exista (index unic partial din faza 3), dar pana atunci
  -- ordonarea trebuie sa fie determinista.
  select id into v_id
    from programari_leads
   where lead = p_lead and eveniment_programat = p_eveniment
   order by created desc
   limit 1;

  if v_id is null then
    raise exception 'Lead-ul nu e programat la acest eveniment.';
  end if;

  update programari_leads set prezenta = p_prezenta, updated = now() where id = v_id;
  return v_id;
end;
$$;

create or replace function marcheaza_prezenta_lead_curs(
  p_lead     uuid,
  p_curs     uuid,
  p_data     date,
  p_prezenta prezenta_lead
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if auth_role() not in ('owner', 'admin', 'manager', 'front_desk', 'teacher') then
    raise exception 'Acces interzis.';
  end if;

  select id into v_id
    from programari_leads
   where lead = p_lead and cursul_programat = p_curs and data_programarii = p_data
   order by created desc
   limit 1;

  if v_id is null then
    raise exception 'Lead-ul nu e programat la aceasta grupa in ziua respectiva.';
  end if;

  update programari_leads set prezenta = p_prezenta, updated = now() where id = v_id;
  return v_id;
end;
$$;

revoke execute on function marcheaza_prezenta_lead_demo(uuid, uuid, prezenta_lead) from anon, public;
revoke execute on function marcheaza_prezenta_lead_curs(uuid, uuid, date, prezenta_lead) from anon, public;
grant  execute on function marcheaza_prezenta_lead_demo(uuid, uuid, prezenta_lead) to authenticated;
grant  execute on function marcheaza_prezenta_lead_curs(uuid, uuid, date, prezenta_lead) to authenticated;
