-- Rundele de evaluare se nasc odată cu sezonul.
--
-- Motiv: dacă se creează abia când își aduce cineva aminte, nu mai încap în
-- planificarea sezonului — teacherii află târziu, iar contorul de 4 săptămâni n-are
-- de unde porni. Generate la clonarea sezonului, ele intră în calendar de la început
-- și rămân ciorne, deci pot fi mutate/editate oricând din tabul Runde.
--
-- Două runde pe sezonul principal: una la mijloc, una la final. Sezoanele `extra`
-- (tabere, module de vară) nu primesc nimic — sunt scurte, cu grupe facultative,
-- n-au ce progres să arate.

create or replace function genereaza_runde_sezon(p_sezon uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  LUNI text[] := array['ianuarie','februarie','martie','aprilie','mai','iunie',
                       'iulie','august','septembrie','octombrie','noiembrie','decembrie'];
  v_s        sezoane%rowtype;
  v_mijloc   date;
  v_final    date;
  v_puncte   date[];
  v_p        date;
  v_i        int := 0;
  v_n        int := 0;
  v_sesiune  uuid;
  v_eticheta text;
begin
  if auth.uid() is not null and auth_role() not in ('admin','owner','manager') then
    raise exception 'Acces refuzat: doar admin sau manager poate genera runde de evaluare.';
  end if;

  select * into v_s from sezoane where id = p_sezon;
  if not found then
    raise exception 'Sezonul nu există.';
  end if;

  -- Idempotent: dacă sezonul are deja runde, nu dublăm. Re-rularea e inofensivă.
  if exists (select 1 from sesiuni_evaluare where sezon_id = p_sezon) then
    return 0;
  end if;

  if v_s.tip <> 'principal' then
    return 0;
  end if;
  if v_s.data_incepere is null or v_s.data_final is null then
    return 0;
  end if;
  -- Sub două luni nu încape nici măcar contorul de 4 săptămâni al unei singure runde.
  if v_s.data_final - v_s.data_incepere < 60 then
    return 0;
  end if;

  -- Mijlocul sezonului, rotunjit la finalul lunii în care cade — o dată rotundă e
  -- mai ușor de ținut minte decât „a 151-a zi de sezon".
  v_mijloc := least(
    (date_trunc('month', v_s.data_incepere + ((v_s.data_final - v_s.data_incepere) / 2))
      + interval '1 month - 1 day')::date,
    v_s.data_final
  );
  v_final := v_s.data_final;
  v_puncte := array[v_mijloc, v_final];

  foreach v_p in array v_puncte loop
    v_i := v_i + 1;
    v_eticheta := LUNI[extract(month from v_p)::int] || ' ' || extract(year from v_p)::text;

    insert into sesiuni_evaluare (
      sezon_id, nume, data_limita_teacher, data_trimitere, data_inchidere,
      zile_avans, stare
    )
    values (
      p_sezon,
      case when v_i = 1 then 'Evaluare intermediară — ' else 'Evaluare final de sezon — ' end || v_eticheta,
      -- Termenul instructorilor nu poate cădea înaintea începutului de sezon.
      greatest(v_p - 7, v_s.data_incepere),
      v_p,
      v_p + 14,
      28,
      'ciorna'
    )
    returning id into v_sesiune;

    -- Grupele recurente ale sezonului. Facultativele (OPEN class) și one_time-urile
    -- n-au roster stabil peste sezon, deci n-au ce evalua.
    insert into sesiune_evaluare_grupe (sesiune_id, curs_id)
    select v_sesiune, c.id
    from cursuri c
    where c.sezon = p_sezon
      and coalesce(c.facultativ, false) = false
      and coalesce(c.one_time, false) = false
      and coalesce(c.suspendat, false) = false
    on conflict do nothing;

    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$$;

revoke execute on function genereaza_runde_sezon(uuid) from anon, public;
grant execute on function genereaza_runde_sezon(uuid) to authenticated;
