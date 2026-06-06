-- Qapp v2 — RPC-uri rezervări OPEN class.
--
-- rezerva_loc_open: alocă atomic un loc (blocare strictă la capacitate). Tot ce
-- înseamnă scriere (enrollment + incasari + rezervare) se face AICI, într-o singură
-- tranzacție cu `SELECT ... FOR UPDATE` pe sesiune — un read `count < cap` din JS
-- NU e atomic și ar permite overbooking sub concurență.

create or replace function rezerva_loc_open(
  p_client        uuid,
  p_suma          numeric,
  p_metoda        metoda_plata,
  p_locatie       uuid,
  p_sesiune       uuid default null,            -- dacă null → creează sesiunea din (p_curs, p_data)
  p_curs          uuid default null,
  p_data          date default null,
  p_instructor    uuid default null,
  p_data_incasare date default current_date
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

  -- 4) numără rezervările vii și aplică limita strictă
  select count(*) into v_count
  from open_rezervari
  where sesiune = v_sesiune and status <> 'anulat';
  if v_count >= v_cap then
    raise exception 'Sesiune completă (% / %). Nu mai sunt locuri.', v_count, v_cap;
  end if;
  -- (dublarea aceluiași client e prinsă de uq_open_rez_client_active → 23505)

  -- 5) înrolare facultativă „Per ședință" datată la sesiune (oglindește buildFacultativPerSedinta)
  insert into enrollments (client, cursul, tip_plata, suma_baza, suma, data_incepere, data_final, activ)
  values (p_client, v_curs.id, 'Per sedinta', p_suma, p_suma, v_data, null, true)
  returning id into v_enrollment;

  -- 6) încasarea (categorie Abonament → intră normal în Financiar)
  insert into incasari (inregistrare, client, data, suma, metoda, categorie, locatie)
  values (v_enrollment, p_client, p_data_incasare, p_suma, p_metoda, 'Abonament', p_locatie)
  returning id into v_incasare;

  -- 7) rezervarea, legată de ambele
  insert into open_rezervari (sesiune, client, enrollment, incasare, status, suma)
  values (v_sesiune, p_client, v_enrollment, v_incasare, 'platit', p_suma)
  returning id into v_rezervare;

  return v_rezervare;
end;
$$;

grant execute on function rezerva_loc_open(uuid, numeric, metoda_plata, uuid, uuid, uuid, date, uuid, date)
  to authenticated;

-- anuleaza_rezervare_open: eliberează locul + dezactivează înrolarea. NU șterge
-- `incasari` — banii chiar au fost încasați; refund-ul e ajustare manuală a contabilității.
create or replace function anuleaza_rezervare_open(
  p_rezervare uuid,
  p_motiv     text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r open_rezervari%rowtype;
begin
  if auth_role() not in ('admin', 'owner', 'manager', 'front_desk') then
    raise exception 'Acces refuzat.';
  end if;

  select * into r from open_rezervari where id = p_rezervare for update;
  if not found then
    raise exception 'Rezervarea nu există.';
  end if;
  if r.status = 'anulat' then
    return;
  end if;

  update open_rezervari
  set status = 'anulat', anulat_at = now(), anulat_motiv = p_motiv
  where id = p_rezervare;

  -- scoate înrolarea din roster / datorii; incasari rămâne intact
  if r.enrollment is not null then
    update enrollments set activ = false where id = r.enrollment;
  end if;
end;
$$;

grant execute on function anuleaza_rezervare_open(uuid, text) to authenticated;
