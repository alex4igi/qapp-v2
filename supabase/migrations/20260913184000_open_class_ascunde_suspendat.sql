-- O grupă suspendată nu mai apare și nu se mai vinde la rezervări OPEN.
--
-- `list_open_sesiuni_client` filtra pe `rezervari_online`, dar nu pe suspendare:
-- un open class oprit rămânea vizibil în portal, rezervabil și plătibil online.
-- La fel `hold_loc_open` (portal) și `rezerva_loc_open` (recepție).
--
-- Verificarea e pe DATA sesiunii, nu pe flagul „acum": o ședință dintr-o lună
-- dinaintea opririi rămâne validă și încasabilă retroactiv.

create or replace function list_open_sesiuni_client(p_locatie uuid default null)
returns table (
  sesiune_id uuid,
  curs_id uuid,
  curs_nume text,
  data date,
  locuri_ramase integer,
  capacitate integer,
  pret numeric,
  instructor_nume text
)
language sql stable security definer set search_path = public as $$
  select s.id, c.id, c.numele, s.data::date,
         (s.capacitate - occ.n)::integer,
         s.capacitate,
         c.pret_sedinta,
         coalesce(t.nume, s.instructor_manual)
  from open_sesiuni s
  join cursuri c on c.id = s.curs
    and coalesce(c.facultativ, false)
    and coalesce(c.rezervari_online, false)
    -- Grupa suspendată nu se mai vinde. Verificarea e pe DATA sesiunii, nu pe
    -- „acum": o sesiune dintr-o lună dinaintea opririi rămâne validă.
    and curs_activ_in_luna(c.id, s.data::date)
  left join teacheri t on t.id = s.instructor
  cross join lateral (
    select count(*) as n from (
      select r.client from open_rezervari r
      where r.sesiune = s.id and r.status <> 'anulat'
      union
      select e.client from enrollments e
      where e.cursul = c.id
        and e.client is not null
        and e.reziliat = false
        and e.tip_plata in ('Per luna', 'Per an')
        and e.data_incepere <= s.data::date
        and (e.data_final is null or e.data_final >= s.data::date)
    ) occupants
  ) occ
  where s.data >= current_date
    and s.status <> 'anulata'
    and (p_locatie is null or c.locatie = p_locatie)
    and (s.capacitate - occ.n) > 0
  order by s.data asc;
$$;

grant execute on function list_open_sesiuni_client(uuid) to authenticated;
revoke execute on function list_open_sesiuni_client(uuid) from anon, public;

create or replace function hold_loc_open(p_client uuid, p_sesiune uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_cap     integer;
  v_status  text;
  v_curs    uuid;
  v_data    date;
  v_count   integer;
  v_pret    numeric;
  v_rez     uuid;
begin
  -- authz: doar conturi parinte, doar pentru membrii propriei familii
  if not is_parinte() then
    raise exception 'forbidden';
  end if;
  if p_client not in (select client_member_ids()) then
    raise exception 'forbidden: clientul nu aparține familiei contului';
  end if;

  -- blochează rândul sesiunii → serializează rezervările concurente
  select s.capacitate, s.status, s.curs, s.data::date into v_cap, v_status, v_curs, v_data
  from open_sesiuni s where s.id = p_sesiune for update;
  if not found then
    raise exception 'Sesiunea nu există.';
  end if;
  if v_status = 'anulata' then
    raise exception 'Sesiunea este anulată.';
  end if;

  -- preț din curs + validare facultativ + bifa de rezervări online
  select c.pret_sedinta into v_pret
  from cursuri c
  where c.id = v_curs
    and coalesce(c.facultativ, false)
    and coalesce(c.rezervari_online, false);
  if not found then
    raise exception 'Cursul nu permite rezervări online.';
  end if;
  -- Grupa suspendată în luna sesiunii nu mai poate fi rezervată din portal.
  if not curs_activ_in_luna(v_curs, (select s.data::date from open_sesiuni s where s.id = p_sesiune)) then
    raise exception 'Grupa este suspendată în luna acestei sesiuni.';
  end if;
  if v_pret is null or v_pret <= 0 then
    raise exception 'Sesiunea nu are un preț valid.';
  end if;

  -- reutilizează un hold viu existent (retry după abandon la Netopia) → nu dubla (23505)
  select id, status into v_rez, v_status
  from open_rezervari
  where sesiune = p_sesiune and client = p_client and status <> 'anulat'
  limit 1;
  if found then
    if v_status = 'platit' then
      raise exception 'Ai deja o rezervare plătită pentru această sesiune.';
    end if;
    -- 'rezervat': locul e deja al lui → reia hold-ul, resetează fereastra de expirare
    update open_rezervari set created = now() where id = v_rez;
    return jsonb_build_object('rezervare_id', v_rez, 'amount', v_pret);
  end if;

  -- capacitate strictă: rezervări vii ∪ abonați activi (formula din list_open_sesiuni_client)
  select count(*) into v_count from (
    select r.client from open_rezervari r
    where r.sesiune = p_sesiune and r.status <> 'anulat'
    union
    select e.client from enrollments e
    where e.cursul = v_curs
      and e.client is not null
      and e.reziliat = false
      and e.tip_plata in ('Per luna', 'Per an')
      and e.data_incepere <= v_data
      and (e.data_final is null or e.data_final >= v_data)
  ) occupants;
  if v_count >= v_cap then
    raise exception 'Sesiune completă (% / %). Nu mai sunt locuri.', v_count, v_cap;
  end if;

  -- creează HOLD fără bani. uq_open_rez_client_active prinde dublarea (23505).
  insert into open_rezervari (sesiune, client, status, suma)
  values (p_sesiune, p_client, 'rezervat', v_pret)
  returning id into v_rez;

  return jsonb_build_object('rezervare_id', v_rez, 'amount', v_pret);
end;
$$;

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
  p_instructor_manual text default null
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
begin
  -- 0) authz
  if auth_role() not in ('admin', 'owner', 'manager', 'front_desk') then
    raise exception 'Acces refuzat.';
  end if;

  if v_incasat > v_pret + 0.001 then
    raise exception 'Suma încasată (%) depășește prețul (%).', v_incasat, v_pret;
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

  -- 5) înrolare facultativă „Per ședință" datată la sesiune; suma = PREȚUL (nu încasatul)
  insert into enrollments (client, cursul, tip_plata, suma_baza, suma, data_incepere, data_final, activ)
  values (p_client, v_curs.id, 'Per sedinta', v_pret, v_pret, v_data, null, true)
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

  -- 7) rezervarea, legată de înrolare + încasarea principală (null dacă 0); suma = prețul
  insert into open_rezervari (sesiune, client, enrollment, incasare, status, suma)
  values (v_sesiune, p_client, v_enrollment, v_incasare, 'platit', v_pret)
  returning id into v_rezervare;

  return v_rezervare;
end;
$$;

grant execute on function hold_loc_open(uuid, uuid) to authenticated;
revoke execute on function hold_loc_open(uuid, uuid) from anon, public;

grant execute on function rezerva_loc_open(uuid, numeric, metoda_plata, uuid, uuid, uuid, date, uuid, date, boolean, metoda_plata, numeric, numeric, text)
  to authenticated;
revoke execute on function rezerva_loc_open(uuid, numeric, metoda_plata, uuid, uuid, uuid, date, uuid, date, boolean, metoda_plata, numeric, numeric, text)
  from anon, public;
