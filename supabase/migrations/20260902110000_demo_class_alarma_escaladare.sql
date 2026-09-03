-- Regula s-a schimbat: la o clasa demo plina nimeni nu mai e refuzat — se
-- suprarezerva, cu avertizare in UI. Consecinta pe alarma: un singur semnal la
-- exact plin nu mai e destul, pentru ca inscrierile continua peste el si o clasa
-- ajunsa la 25/12 nu s-ar mai anunta niciodata.
--
-- Se notifica la praguri: exact plin (peste = 0), apoi la fiecare +5. Dedup pe
-- (eveniment, prag), nu pe eveniment — asa escaladarea trece, dar o inscriere
-- anulata si refacuta pe acelasi prag nu re-notifica.

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
  v_ocupat    int;
  v_peste     int;
  v_titlu     text;
  v_corp      text;
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

  v_ocupat := locuri_ocupate_eveniment(p_eveniment);
  v_peste  := v_ocupat - e.capacitate;

  -- Sub capacitate nu e nimic de anuntat; peste, doar la pragurile 0, +5, +10…
  if v_peste < 0 or (v_peste <> 0 and v_peste % 5 <> 0) then
    return 0;
  end if;

  if exists (
    select 1 from notifications
     where kind = 'demo_class_full'
       and payload->>'eveniment_id' = p_eveniment::text
       and coalesce((payload->>'peste')::int, 0) = v_peste
  ) then
    return 0;
  end if;

  -- `evenimente.ora` e text liber („18:00"), nu `time` — se taie, nu se formateaza.
  v_cand := coalesce(
    to_char(e.data, 'DD.MM.YYYY') || coalesce(' ' || left(e.ora, 5), ''),
    'fără dată'
  );

  if v_peste = 0 then
    v_titlu := format('Clasă demo completă: %s', e.nume_eveniment);
    v_corp := format(
      '%s%s · %s. Înscrierile continuă peste capacitate — programează o clasă demo nouă.',
      v_cand,
      coalesce(' · ' || nullif(e.locatia, ''), ''),
      case when e.capacitate = 1
           then 'singurul loc e ocupat'
           else format('toate cele %s locuri sunt ocupate', e.capacitate) end
    );
  else
    v_titlu := format('Clasă demo suprarezervată: %s (+%s)', e.nume_eveniment, v_peste);
    v_corp := format(
      '%s%s · %s înscriși la %s locuri. Sala și teacherul nu mai fac față — programează o clasă demo nouă.',
      v_cand,
      coalesce(' · ' || nullif(e.locatia, ''), ''),
      v_ocupat,
      e.capacitate
    );
  end if;

  for v_recipient in
    select id from auth.users
     where raw_app_meta_data->>'role' in ('owner', 'admin', 'manager')
  loop
    insert into notifications (
      recipient_user_id, kind, title, body, payload, requires_action, status
    ) values (
      v_recipient,
      'demo_class_full',
      v_titlu,
      v_corp,
      jsonb_build_object(
        'eveniment_id', e.id,
        'nume', e.nume_eveniment,
        'data', e.data,
        'capacitate', e.capacitate,
        'ocupat', v_ocupat,
        'peste', v_peste,
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
