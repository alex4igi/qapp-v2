-- Vouchere ACTIVATE + condiții verificate în DB, pe toate căile (decizie Alex 2026-09-14).
--
-- Context: cele 9 vouchere din importul v1 aveau `numar_utilizari = 0`, deci erau
-- „epuizate" și nu apăreau nicăieri. În plus, la recepție nimic nu verifica voucherul:
-- `createInrolari` scrie direct în `enrollments`, iar fluxul OPEN nu primea voucher deloc.
--
-- Decizii:
--   • Active: P50, P100, RE10, RE20, RE50, RE10M, TRUPA50.
--   • Închise: A10 (plata integrală merge pe −5% din contract), P10 (reducerea de
--     familie e automată), LATESTART (prorata e automată; valoare 0).
--   • Voucherul NU se combină cu prețul de reînscriere (reducerile nu se cumulează).
--   • Condițiile (azi: TRUPA50 = doar membrii trupelor) se verifică în DB.
--
-- Regula stă într-un singur loc: `_voucher_motiv_invalid`. O folosesc validate_voucher_code
-- (portal), list_vouchere_aplicabile (formularele de la recepție), rezerva_loc_open și
-- triggerele pe enrollments / incasari (gardul pentru orice insert direct).

-- ============================================================
-- 1. Stare explicită activ/închis (în loc de „0 utilizări")
-- ============================================================
alter table vouchere add column if not exists activ boolean not null default true;

comment on column vouchere.activ is
  'Voucher disponibil la recepție și în portal. false = închis (nu apare, nu se poate aplica).';

update vouchere set numar_utilizari = null
  where upper(cod_voucher) in ('A10','LATESTART','P10','P100','P50','RE10','RE10M','RE20','RE50')
    and numar_utilizari = 0;

update vouchere set activ = false
  where upper(cod_voucher) in ('A10','P10','LATESTART');

-- ============================================================
-- 2. client_in_trupa: doar trupa din sezonul curent, nu rânduri vechi rămase active
-- ============================================================
create or replace function client_in_trupa(p_client uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from enrollments e
    join cursuri c on c.id = e.cursul
    where e.client = p_client
      and e.activ = true
      and e.reziliat = false
      and (e.data_final is null or e.data_final >= current_date)
      and c.nivelul = 'Trupa'
  );
$$;

-- ============================================================
-- 3. Verdictul unic: null = voucherul se poate aplica; altfel motivul
-- ============================================================
create or replace function _voucher_motiv_invalid(
  p_voucher uuid,
  p_client  uuid,
  p_curs    uuid default null,
  p_tip     tip_plata default null
)
returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v vouchere%rowtype;
  v_folosit integer;
begin
  select * into v from vouchere where id = p_voucher;
  if not found then
    return 'Voucher inexistent.';
  end if;
  if not v.activ then
    return 'Voucherul nu este activ.';
  end if;
  if v.data_inceperii is not null and v.data_inceperii > current_date then
    return 'Voucherul nu e încă valabil.';
  end if;
  if v.data_expirarii is not null and v.data_expirarii < current_date then
    return 'Voucherul a expirat.';
  end if;
  if v.numar_utilizari is not null and v.numar_utilizari <= 0 then
    return 'Voucherul nu mai are utilizări disponibile.';
  end if;
  if v.client is not null and v.client is distinct from p_client then
    return 'Voucherul e emis pentru alt client.';
  end if;
  if v.curs is not null and p_curs is not null and v.curs <> p_curs then
    return 'Voucherul nu se aplică pe acest curs.';
  end if;
  if v.tip_enrollment is not null and p_tip is not null and v.tip_enrollment <> p_tip then
    return 'Voucherul se aplică doar pe plata „' || v.tip_enrollment || '".';
  end if;
  if v.cerinta_eligibilitate = 'trupa' and not client_in_trupa(p_client) then
    return 'Doar membrii trupelor pot folosi acest voucher.';
  end if;
  if v.limita_per_client is not null then
    select count(*) into v_folosit
      from voucher_redemptions r where r.voucher = v.id and r.client = p_client;
    if v_folosit >= v.limita_per_client then
      return 'Clientul a atins limita de utilizări pentru acest cod.';
    end if;
  end if;
  return null;
end;
$$;

revoke execute on function _voucher_motiv_invalid(uuid, uuid, uuid, tip_plata) from anon, public, authenticated;

-- ============================================================
-- 4. validate_voucher_code (portal) — același contract, verdictul din helper
-- ============================================================
create or replace function validate_voucher_code(
  p_cod text,
  p_client uuid,
  p_curs uuid default null,
  p_tip tip_plata default null
)
returns table (
  valid boolean,
  reason text,
  voucher_id uuid,
  cod text,
  tip tip_voucher,
  valoare numeric
)
language plpgsql stable security definer set search_path = public as $$
declare
  v vouchere%rowtype;
  v_motiv text;
begin
  -- Portal: un cont parinte poate valida doar pentru membrii familiei sale.
  if is_parinte() and (p_client is null or p_client not in (select client_member_ids())) then
    return query select false, 'Membru invalid.', null::uuid, null::text, null::tip_voucher, null::numeric;
    return;
  end if;

  select * into v from vouchere where upper(cod_voucher) = upper(btrim(p_cod)) limit 1;
  if not found then
    return query select false, 'Cod inexistent.', null::uuid, null::text, null::tip_voucher, null::numeric;
    return;
  end if;

  v_motiv := _voucher_motiv_invalid(v.id, p_client, p_curs, p_tip);
  return query select v_motiv is null, v_motiv, v.id, v.cod_voucher, v.tip, v.valoare;
end;
$$;

revoke execute on function validate_voucher_code(text, uuid, uuid, tip_plata) from anon, public;
grant execute on function validate_voucher_code(text, uuid, uuid, tip_plata) to authenticated;

-- ============================================================
-- 5. list_vouchere_aplicabile — ce vede recepția în dropdown, cu verdict per voucher
-- ============================================================
create or replace function list_vouchere_aplicabile(
  p_client uuid,
  p_curs   uuid default null,
  p_tip    tip_plata default null
)
returns table (
  id uuid,
  cod_voucher text,
  descriere text,
  tip tip_voucher,
  valoare numeric,
  valid boolean,
  motiv text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth_role() not in ('owner', 'admin', 'manager', 'front_desk') then
    raise exception 'Acces refuzat.';
  end if;

  return query
  select v.id, v.cod_voucher, v.descriere, v.tip, v.valoare,
         m.motiv is null, m.motiv
  from vouchere v
  cross join lateral (select _voucher_motiv_invalid(v.id, p_client, p_curs, p_tip) as motiv) m
  where v.activ
    and (v.tip_enrollment is null or p_tip is null or v.tip_enrollment = p_tip)
    and (v.curs is null or p_curs is null or v.curs = p_curs)
    and (v.client is null or v.client = p_client)
  order by v.cod_voucher;
end;
$$;

revoke execute on function list_vouchere_aplicabile(uuid, uuid, tip_plata) from anon, public;
grant execute on function list_vouchere_aplicabile(uuid, uuid, tip_plata) to authenticated;

-- ============================================================
-- 6. Gard pe enrollments: orice voucher pus pe o înrolare e verificat
-- ============================================================
create or replace function trg_enrollment_voucher_valid()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_motiv text;
begin
  if new.voucher is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.voucher is not distinct from old.voucher
     and new.este_reinscriere is not distinct from old.este_reinscriere then
    return new;
  end if;

  if coalesce(new.este_reinscriere, false) then
    raise exception 'Voucherul nu se combină cu prețul de reînscriere — reducerile nu se cumulează.';
  end if;

  -- Plata online a fost validată la crearea comenzii (netopia-create-payment). Confirmarea
  -- vine din webhook DUPĂ ce banii au intrat — un refuz aici ar lăsa plata fără înrolare.
  if auth.role() = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' or new.voucher is distinct from old.voucher then
    v_motiv := _voucher_motiv_invalid(new.voucher, new.client, new.cursul, new.tip_plata);
    if v_motiv is not null then
      raise exception '%', v_motiv;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function trg_enrollment_voucher_valid() from anon, public, authenticated;

drop trigger if exists trg_enrollment_voucher_valid on enrollments;
create trigger trg_enrollment_voucher_valid
  before insert or update of voucher, este_reinscriere on enrollments
  for each row execute function trg_enrollment_voucher_valid();

-- ============================================================
-- 7. Gard pe incasari: plățile simple (bilet/merch/taxe) primesc doar vouchere
--    fără legătură cu o înrolare. Toate voucherele de azi sunt pe înrolări.
-- ============================================================
create or replace function trg_incasare_voucher_valid()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_tip_enrollment tip_plata;
  v_cerinta text;
  v_motiv text;
begin
  if new.voucher is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.voucher is not distinct from old.voucher then
    return new;
  end if;
  if auth.role() = 'service_role' then
    return new;
  end if;

  select tip_enrollment, cerinta_eligibilitate into v_tip_enrollment, v_cerinta
    from vouchere where id = new.voucher;
  if v_tip_enrollment is not null then
    raise exception 'Voucherul se aplică doar la înrolări („%"), nu pe o plată simplă.', v_tip_enrollment;
  end if;

  v_motiv := _voucher_motiv_invalid(new.voucher, new.client, null, null);
  if v_motiv is not null then
    raise exception '%', v_motiv;
  end if;
  return new;
end;
$$;

revoke execute on function trg_incasare_voucher_valid() from anon, public, authenticated;

drop trigger if exists trg_incasare_voucher_valid on incasari;
create trigger trg_incasare_voucher_valid
  before insert or update of voucher on incasari
  for each row execute function trg_incasare_voucher_valid();

-- ============================================================
-- 8. rezerva_loc_open (recepție, OPEN) — primește voucher
--    Identic cu 20260913184000, plus p_voucher: prețul datorat = preț − voucher.
-- ============================================================
drop function if exists rezerva_loc_open(uuid, numeric, metoda_plata, uuid, uuid, uuid, date, uuid, date, boolean, metoda_plata, numeric, numeric, text);

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
      when 'Procent' then greatest(0, round(v_pret * (100 - v_voucher.valoare)) / 100)
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
