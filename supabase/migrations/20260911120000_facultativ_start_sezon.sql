-- Fix: abonamentul facultativ din luna de start a sezonului primea data_incepere =
-- ziua 1 (ex. 2026-09-01), înaintea startului de sezon (2026-09-12).
--
-- Simptom (raportat 11 sep 2026, „Alban Catrinel", K Teatru jr 7-10 INT): înrolarea
-- plătită nu apare în fișa clientului — fișa, familia și datoriile pe curs filtrează
-- `data_incepere` între startul și finalul sezonului — iar triggerul
-- `enrollment_marcheaza_activ` nu reactivează clientul (cere data ≥ start sezon).
--
-- Aceeași regulă ca în createInrolari (frontend): în luna de start a sezonului,
-- data_incepere = startul sezonului. Restul funcției e neschimbat față de 20260804120000.

create or replace function converteste_sedinte_in_abonament(
  p_client uuid,
  p_curs   uuid,
  p_luna   date,
  p_motiv  text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_luna_start date;
  v_luna_end   date;
  v_data_start date;
  v_sezon_start date;
  v_pret       numeric;
  v_sezon      uuid;
  v_ids        uuid[];
  v_dates      date[];
  v_platit     numeric;
  v_new_id     uuid;
  v_new_suma   numeric;
  v_motiv      text;
begin
  if auth_role() not in ('admin', 'owner', 'manager', 'front_desk') then
    raise exception 'Acces refuzat.';
  end if;

  if p_client is null or p_curs is null or p_luna is null then
    raise exception 'Client, curs și lună sunt obligatorii.';
  end if;

  v_luna_start := date_trunc('month', p_luna)::date;
  v_luna_end   := (v_luna_start + interval '1 month - 1 day')::date;
  v_motiv := coalesce(nullif(btrim(p_motiv), ''), 'Convertit din ședințe în abonament');

  select c.pret_lunar into v_pret from cursuri c where c.id = p_curs;
  if not found then
    raise exception 'Cursul nu există.';
  end if;
  if v_pret is null or v_pret <= 0 then
    raise exception 'Cursul nu are „Preț lunar" setat.';
  end if;

  -- Un singur abonament pe (client, curs, lună): altfel conversia repetată ar
  -- dubla luna. Nu e „already_converted" — abonamentul poate fi și manual.
  if exists (
    select 1 from enrollments e
    where e.client = p_client
      and e.cursul = p_curs
      and e.tip_plata = 'Per luna'
      and not e.reziliat
      and date_trunc('month', e.data_incepere)::date = v_luna_start
  ) then
    raise exception 'Există deja un abonament activ pe luna respectivă.';
  end if;

  select array_agg(e.id order by e.data_incepere),
         array_agg(e.data_incepere order by e.data_incepere),
         (array_agg(e.sezon_id order by e.sezon_id nulls last))[1]
    into v_ids, v_dates, v_sezon
  from enrollments e
  where e.client = p_client
    and e.cursul = p_curs
    and e.tip_plata = 'Per sedinta'
    and not e.reziliat
    and e.data_incepere >= v_luna_start
    and e.data_incepere <= v_luna_end;

  if v_ids is null or array_length(v_ids, 1) = 0 then
    raise exception 'Nicio ședință activă în luna respectivă.';
  end if;

  -- În luna de start a sezonului abonamentul pornește la startul sezonului, ca în
  -- createInrolari: ziua 1 cade înaintea sezonului și rândul dispare din fișa pe sezon.
  select s.data_incepere into v_sezon_start from sezoane s where s.id = v_sezon;
  v_data_start := case
    when v_sezon_start > v_luna_start and v_sezon_start <= v_luna_end then v_sezon_start
    else v_luna_start
  end;

  select coalesce(sum(i.suma), 0) into v_platit
  from incasari i where i.inregistrare = any(v_ids);

  -- (a) abonamentul lunii; triggerul de politică poate ajusta `suma` (family/cross-sell).
  --     `data_final = v_luna_end`: abonamentul acoperă EXACT luna convertită, ca
  --     orice rând lunar din createInrolari. NULL ar însemna „pe veci" (vezi antetul).
  insert into enrollments (
    client, cursul, tip_plata, suma, suma_baza,
    data_incepere, data_final, activ, sezon_id
  ) values (
    p_client, p_curs, 'Per luna', v_pret, v_pret,
    v_data_start, v_luna_end, true, v_sezon
  )
  returning id into v_new_id;

  -- (b) încasările ședințelor devin avans pe abonament.
  update incasari
    set inregistrare = v_new_id, updated = now()
  where inregistrare = any(v_ids);

  -- (c) prezențele urmează abonamentul (istoricul lunii rămâne pe un singur rând).
  update prezente
    set enrollment = v_new_id, updated = now()
  where enrollment = any(v_ids);

  -- (d) rezervările OPEN rămân active, dar gratuite (banii sunt pe abonament).
  update open_rezervari
    set suma = 0
  where enrollment = any(v_ids);

  -- (e) void curat al ședințelor → fără restanță fantomă.
  update enrollments
    set suma = 0,
        suma_baza = 0,
        reziliat = true,
        activ = false,
        motiv_reziliere = v_motiv,
        data_reziliere = now(),
        updated = now()
  where id = any(v_ids);

  -- suma finală după triggerul de politică (poate fi −10% pe al 2-lea abonament)
  select suma into v_new_suma from enrollments where id = v_new_id;

  return jsonb_build_object(
    'converted', true,
    'enrollment', v_new_id,
    'luna', v_luna_start,
    'sedinte', array_length(v_ids, 1),
    'dates', to_jsonb(v_dates),
    'pret', v_new_suma,
    'platit', v_platit,
    'de_incasat', greatest(coalesce(v_new_suma, 0) - v_platit, 0),
    'credit', greatest(v_platit - coalesce(v_new_suma, 0), 0)
  );
end;
$$;

grant execute on function converteste_sedinte_in_abonament(uuid, uuid, date, text) to authenticated;
revoke execute on function converteste_sedinte_in_abonament(uuid, uuid, date, text) from anon, public;
