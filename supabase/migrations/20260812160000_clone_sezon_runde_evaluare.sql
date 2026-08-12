-- clone_sezon generează și rundele de evaluare ale sezonului nou.
--
-- Copie a versiunii din 20260623330000 (manager write) cu o singură adăugire:
-- apelul `genereaza_runde_sezon` înainte de return. Restul corpului e neschimbat —
-- îl repetăm pentru că Postgres n-are „alter function ... add statement".

create or replace function clone_sezon(
  p_sezon_sursa uuid,
  p_nume text,
  p_tip text,
  p_data_incepere date,
  p_data_final date,
  p_cursuri jsonb default '[]'::jsonb,
  p_vacante jsonb default '[]'::jsonb,
  p_scadenta_prima_rata date default null,
  p_scadenta_ultima_rata date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_sezon uuid;
  v_item jsonb;
  v_ov jsonb;
  v_sursa cursuri%rowtype;
begin
  if auth_role() not in ('admin', 'owner', 'manager') then
    raise exception 'Acces refuzat: doar admin sau manager poate crea sezoane.';
  end if;

  if p_tip not in ('principal','extra') then
    raise exception 'Tipul sezonului trebuie să fie principal sau extra.';
  end if;

  if p_data_incepere is null or p_data_final is null then
    raise exception 'Datele de început și final ale sezonului sunt obligatorii.';
  end if;

  if p_data_final < p_data_incepere then
    raise exception 'data_final nu poate fi înainte de data_incepere.';
  end if;

  insert into sezoane (
    numele_sezonului, tip, data_incepere, data_final, stare,
    scadenta_prima_rata, scadenta_ultima_rata
  )
  values (
    trim(p_nume), p_tip, p_data_incepere, p_data_final, 'planificat',
    p_scadenta_prima_rata, p_scadenta_ultima_rata
  )
  returning id into v_new_sezon;

  for v_item in select * from jsonb_array_elements(coalesce(p_cursuri, '[]'::jsonb))
  loop
    select * into v_sursa from cursuri where id = (v_item->>'sursa_id')::uuid;
    if not found then
      continue;
    end if;
    v_ov := coalesce(v_item->'overrides', '{}'::jsonb);

    insert into cursuri (
      numele, stil, nivelul, varsta, teacher, sala, sezon,
      facultativ, pret_anual, pret_lunar, pret_sedinta, pret_lunar_promo,
      capacitate_maxima, participari_eveniment, zile, ora, durata_cursului,
      one_time, suspendat, cursul_original
    ) values (
      coalesce(nullif(v_ov->>'numele',''), v_sursa.numele),
      coalesce(nullif(v_ov->>'stil',''), v_sursa.stil),
      coalesce(nullif(v_ov->>'nivelul','')::nivel_curs, v_sursa.nivelul),
      coalesce(nullif(v_ov->>'varsta','')::varsta_curs, v_sursa.varsta),
      coalesce(nullif(v_ov->>'teacher','')::uuid, v_sursa.teacher),
      coalesce(nullif(v_ov->>'sala','')::uuid, v_sursa.sala),
      v_new_sezon,
      case
        when p_tip = 'extra' then true
        when v_ov ? 'facultativ' then (v_ov->>'facultativ')::boolean
        else v_sursa.facultativ
      end,
      coalesce(nullif(v_ov->>'pret_anual','')::numeric, v_sursa.pret_anual),
      coalesce(nullif(v_ov->>'pret_lunar','')::numeric, v_sursa.pret_lunar),
      coalesce(nullif(v_ov->>'pret_sedinta','')::numeric, v_sursa.pret_sedinta),
      coalesce(nullif(v_ov->>'pret_lunar_promo','')::numeric, v_sursa.pret_lunar_promo),
      coalesce(nullif(v_ov->>'capacitate_maxima','')::int, v_sursa.capacitate_maxima),
      v_sursa.participari_eveniment,
      v_sursa.zile,  -- zile e zi_saptamana[], nu se editează prin override
      coalesce(nullif(v_ov->>'ora',''), v_sursa.ora),
      coalesce(nullif(v_ov->>'durata_cursului','')::numeric, v_sursa.durata_cursului),
      v_sursa.one_time,
      false,
      v_sursa.id
    );
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_vacante, '[]'::jsonb))
  loop
    insert into vacante (sezon_id, nume, data_incepere, data_final)
    values (
      v_new_sezon,
      trim(v_item->>'nume'),
      (v_item->>'data_incepere')::date,
      (v_item->>'data_final')::date
    );
  end loop;

  -- Rundele de evaluare intră în calendar odată cu sezonul, ca ciorne. Cursurile
  -- clonate mai sus sunt deja în DB, deci se atașează corect la grupe.
  perform genereaza_runde_sezon(v_new_sezon);

  return v_new_sezon;
end;
$$;

grant execute on function clone_sezon(uuid, text, text, date, date, jsonb, jsonb, date, date) to authenticated;
revoke execute on function clone_sezon(uuid, text, text, date, date, jsonb, jsonb, date, date) from anon, public;
