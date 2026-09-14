-- rezerva_loc_open: reducerea procentuală se rotunjea ca `round(x) / 100`, iar numeric-ul
-- păstra scala împărțirii („40.0000000000000000" în enrollments.suma / open_rezervari.suma).
-- Aceeași valoare, doar cu 2 zecimale. Restul funcției e identic cu 20260914170000.

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
  p_suma2           numeric default null,
  p_pret            numeric default null,
  p_instructor_manual text default null,
  p_voucher         uuid default null
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
  v_incasat    numeric := coalesce(p_suma, 0) + coalesce(p_suma2, 0);
  v_pret       numeric := coalesce(p_pret, coalesce(p_suma, 0) + coalesce(p_suma2, 0));
  v_datorat    numeric;
  v_voucher    vouchere%rowtype;
  v_motiv      text;
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
  -- Aceeași regulă ca pe portal, dar tot pe DATA sesiunii: recepția poate încasa
  -- retroactiv o ședință ținută înainte de suspendare, nu una din lunile de pauză.
  if not curs_activ_in_luna(
       v_curs.id,
       coalesce(p_data, (select s.data::date from open_sesiuni s where s.id = p_sesiune))
     ) then
    raise exception 'Grupa este suspendată în luna acestei sesiuni.';
  end if;

  -- 1b) voucher: verificat înainte de orice scriere; reducerea se calculează aici, nu în UI.
  --     Rotunjire identică cu netopia-create-payment (portal).
  v_datorat := v_pret;
  if p_voucher is not null then
    v_motiv := _voucher_motiv_invalid(p_voucher, p_client, v_curs.id, 'Per sedinta');
    if v_motiv is not null then
      raise exception '%', v_motiv;
    end if;
    select * into v_voucher from vouchere where id = p_voucher;
    v_datorat := case v_voucher.tip
      when 'Procent' then greatest(0, round(v_pret * (100 - v_voucher.valoare) / 100, 2))
      when 'Valoare' then greatest(0, v_pret - v_voucher.valoare)
      else v_pret
    end;
  end if;

  if v_incasat > v_datorat + 0.001 then
    raise exception 'Suma încasată (%) depășește prețul (%).', v_incasat, v_datorat;
  end if;

  -- 2) rezolvă / creează sesiunea
  if v_sesiune is null then
    if p_curs is null or p_data is null then
      raise exception 'Lipsește cursul sau data sesiunii.';
    end if;
    if p_data < current_date then
      raise exception 'Sesiunea nu poate fi în trecut.';
    end if;
    insert into open_sesiuni (curs, data, capacitate, instructor, instructor_manual)
    values (p_curs, p_data, coalesce(v_curs.capacitate_maxima, 35), p_instructor,
            nullif(btrim(p_instructor_manual), ''))
    on conflict (curs, data) do update
      set instructor = coalesce(excluded.instructor, open_sesiuni.instructor),
          instructor_manual = coalesce(excluded.instructor_manual, open_sesiuni.instructor_manual)
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

  -- 5) înrolare facultativă „Per ședință" datată la sesiune; suma_baza = prețul,
  --    suma = prețul după voucher (cât datorează; restul neîncasat devine restanță)
  insert into enrollments (client, cursul, tip_plata, suma_baza, suma, voucher, data_incepere, data_final, activ)
  values (p_client, v_curs.id, 'Per sedinta', v_pret, v_datorat, p_voucher, v_data, null, true)
  returning id into v_enrollment;

  -- 6) încasarea principală (doar dacă s-a încasat ceva acum) → categorie Abonament
  if coalesce(p_suma, 0) > 0 then
    insert into incasari (inregistrare, client, data, suma, metoda, categorie, locatie)
    values (v_enrollment, p_client, p_data_incasare, p_suma, p_metoda, 'Abonament', p_locatie)
    returning id into v_incasare;
  end if;

  -- 6b) a doua încasare pentru plata mixtă (Cash + Card)
  if p_suma2 is not null and p_suma2 > 0 then
    insert into incasari (inregistrare, client, data, suma, metoda, categorie, locatie)
    values (v_enrollment, p_client, p_data_incasare, p_suma2, coalesce(p_metoda2, p_metoda), 'Abonament', p_locatie);
  end if;

  -- 6c) jurnal de răscumpărare (limita per client), ca la plata online
  if p_voucher is not null then
    insert into voucher_redemptions (voucher, client, enrollment, incasare)
    values (p_voucher, p_client, v_enrollment, v_incasare);
  end if;

  -- 7) rezervarea, legată de înrolare + încasarea principală (null dacă 0); suma = datorat
  insert into open_rezervari (sesiune, client, enrollment, incasare, status, suma)
  values (v_sesiune, p_client, v_enrollment, v_incasare, 'platit', v_datorat)
  returning id into v_rezervare;

  return v_rezervare;
end;
$$;

grant execute on function rezerva_loc_open(uuid, numeric, metoda_plata, uuid, uuid, uuid, date, uuid, date, boolean, metoda_plata, numeric, numeric, text, uuid)
  to authenticated;
revoke execute on function rezerva_loc_open(uuid, numeric, metoda_plata, uuid, uuid, uuid, date, uuid, date, boolean, metoda_plata, numeric, numeric, text, uuid)
  from anon, public;
