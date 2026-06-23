-- Open class — plată împărțită Cash + Card pe rezervare.
--
-- Adăugăm două argumente noi cu DEFAULT (p_metoda2, p_suma2). Apelurile existente
-- (10 argumente) rămân valide. Când p_suma2 > 0 se creează o A DOUA încasare pentru
-- aceeași înrolare, cu p_metoda2 → în Financiar suma pe metodă iese corect.
-- Totalul (înrolare + rezervare) = p_suma + coalesce(p_suma2, 0).
--
-- Dropăm întâi semnătura veche (10 args) ca să nu rămână overload ambiguu pentru PostgREST.

drop function if exists rezerva_loc_open(uuid, numeric, metoda_plata, uuid, uuid, uuid, date, uuid, date, boolean);

create or replace function rezerva_loc_open(
  p_client          uuid,
  p_suma            numeric,
  p_metoda          metoda_plata,
  p_locatie         uuid,
  p_sesiune         uuid default null,
  p_curs            uuid default null,
  p_data            date default null,
  p_instructor      uuid default null,
  p_data_incasare   date default current_date,
  p_permite_overbook boolean default false,
  p_metoda2         metoda_plata default null,
  p_suma2           numeric default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sesiune    uuid := p_sesiune;
  v_curs       cursuri%rowtype;
  v_cap        integer;
  v_status     text;
  v_data       date;
  v_count      integer;
  v_enrollment uuid;
  v_incasare   uuid;
  v_rezervare  uuid;
  v_total      numeric := p_suma + coalesce(p_suma2, 0);
begin
  -- 0) authz
  if auth_role() not in ('admin', 'owner', 'manager', 'front_desk') then
    raise exception 'Acces refuzat.';
  end if;

  -- 1) rezolvă cursul (din sesiunea existentă sau din parametri) + validează facultativ
  select c.* into v_curs
  from cursuri c
  where c.id = coalesce(p_curs, (select s.curs from open_sesiuni s where s.id = p_sesiune));
  if not found then
    raise exception 'Cursul nu există.';
  end if;
  if not coalesce(v_curs.facultativ, false) then
    raise exception 'Cursul nu este facultativ — rezervările OPEN sunt doar pe cursuri facultative.';
  end if;

  -- 2) rezolvă / creează sesiunea
  if v_sesiune is null then
    if p_curs is null or p_data is null then
      raise exception 'Lipsește cursul sau data sesiunii.';
    end if;
    if p_data < current_date then
      raise exception 'Sesiunea nu poate fi în trecut.';
    end if;
    insert into open_sesiuni (curs, data, capacitate, instructor)
    values (p_curs, p_data, coalesce(v_curs.capacitate_maxima, 35), p_instructor)
    on conflict (curs, data) do update
      set instructor = coalesce(excluded.instructor, open_sesiuni.instructor)
    returning id into v_sesiune;
  end if;

  -- 3) blochează rândul sesiunii → serializează rezervările concurente pe ea
  select capacitate, status, data
    into v_cap, v_status, v_data
  from open_sesiuni
  where id = v_sesiune
  for update;
  if not found then
    raise exception 'Sesiunea nu există.';
  end if;
  if v_status = 'anulata' then
    raise exception 'Sesiunea este anulată.';
  end if;

  -- 4) numără rezervările vii și aplică limita strictă — DOAR dacă nu e overbook permis
  if not coalesce(p_permite_overbook, false) then
    select count(*) into v_count
    from open_rezervari
    where sesiune = v_sesiune and status <> 'anulat';
    if v_count >= v_cap then
      raise exception 'Sesiune completă (% / %). Nu mai sunt locuri.', v_count, v_cap;
    end if;
  end if;
  -- (dublarea aceluiași client e prinsă de uq_open_rez_client_active → 23505)

  -- 5) înrolare facultativă „Per ședință" datată la sesiune (oglindește buildFacultativPerSedinta)
  insert into enrollments (client, cursul, tip_plata, suma_baza, suma, data_incepere, data_final, activ)
  values (p_client, v_curs.id, 'Per sedinta', v_total, v_total, v_data, null, true)
  returning id into v_enrollment;

  -- 6) încasarea principală (categorie Abonament → intră normal în Financiar)
  insert into incasari (inregistrare, client, data, suma, metoda, categorie, locatie)
  values (v_enrollment, p_client, p_data_incasare, p_suma, p_metoda, 'Abonament', p_locatie)
  returning id into v_incasare;

  -- 6b) a doua încasare pentru plata mixtă (Cash + Card)
  if p_suma2 is not null and p_suma2 > 0 then
    insert into incasari (inregistrare, client, data, suma, metoda, categorie, locatie)
    values (v_enrollment, p_client, p_data_incasare, p_suma2, coalesce(p_metoda2, p_metoda), 'Abonament', p_locatie);
  end if;

  -- 7) rezervarea, legată de înrolare + încasarea principală; suma = totalul plătit
  insert into open_rezervari (sesiune, client, enrollment, incasare, status, suma)
  values (v_sesiune, p_client, v_enrollment, v_incasare, 'platit', v_total)
  returning id into v_rezervare;

  return v_rezervare;
end;
$$;

grant execute on function rezerva_loc_open(uuid, numeric, metoda_plata, uuid, uuid, uuid, date, uuid, date, boolean, metoda_plata, numeric)
  to authenticated;
