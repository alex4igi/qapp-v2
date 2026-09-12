-- Plata integrală a sezonului, −5% (contract educațional, Anexa 1 „Modalitate plată":
-- „Integrală pentru tot sezonul — 5% — scadent 30.09").
--
-- Reducerile NU se cumulează (tot Anexa 1): pe fiecare rată se aplică UNA singură,
-- cea mai avantajoasă pentru client. O rată care are deja −10% de familie rămâne la
-- −10%; una pe preț de reînscriere primește 5% doar dacă iese mai bine decât promo-ul.
-- Formula e aceeași cu cea din motorul de reduceri (recalculate_pool_discount):
--     suma_nouă = least(suma_curentă, preț_listă − 5%)
-- Cei 5% se calculează pe valoarea contractului, nu rată cu rată: diferența de
-- rotunjire (10 × round(290×5%) = 150 vs round(2900×5%) = 145) se corectează pe prima
-- rată, ca totalul plătit să fie exact 95% din contract.
--
-- Discountul se materializează DOAR la confirmarea plății (webhook Netopia). Până
-- atunci rândurile rămân la prețul lor — un intent abandonat nu lasă reduceri în urmă.

-- ── 1. Termenul din contract, pe sezon (nu hardcodat: se setează la crearea sezonului)
alter table sezoane add column if not exists scadenta_plata_integrala date;
comment on column sezoane.scadenta_plata_integrala is
  'Termenul până la care plata integrală a sezonului beneficiază de −5% (Anexa 1 din contract). NULL = oferta nu se aplică pe acest sezon.';

update sezoane
  set scadenta_plata_integrala = date '2026-09-30'
  where numele_sezonului = 'Sezon 2026-2027'
    and scadenta_plata_integrala is null;

-- ── 2. Urma reducerii pe rândul de înrolare
alter table enrollments add column if not exists discount_integral numeric not null default 0;
comment on column enrollments.discount_integral is
  'Reducerea pentru plata integrală a sezonului (−5%, Anexa 1). Se scrie doar la confirmarea plății: suma = suma_baza − politica_discount − discount_integral. Motorul de reduceri nu atinge rândurile cu încasări, deci nu o suprascrie.';

-- ── 3. Marcajul pe comandă (webhook-ul trebuie să știe că rescrie prețurile)
alter table netopia_orders add column if not exists plata_integrala boolean not null default false;

-- ── 4. Planul de plată integrală: eligibilitate + prețuri, într-un singur loc.
-- Îl folosesc și portalul (ca să afișeze oferta) și netopia-create-payment (ca sursă
-- a sumei). Clientul NU trimite suma niciodată.
create or replace function plan_plata_integrala_sezon(p_client uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sezon        sezoane%rowtype;
  v_nr           integer := 0;
  v_platit       numeric := 0;
  v_total_curent numeric := 0;
  v_total_lista  numeric := 0;
  v_disc_target  numeric := 0;
  v_disc_sum     numeric := 0;
  v_diff         numeric;
  v_rate         jsonb := '[]'::jsonb;
  v_out          jsonb := '[]'::jsonb;
  v_total_plata  numeric := 0;
  v_pay          numeric;
  v_idx          integer := -1;
  v_i            integer := 0;
  r              record;
begin
  if p_client not in (select client_member_ids()) then
    raise exception 'forbidden: clientul nu aparține familiei contului';
  end if;

  select * into v_sezon
  from sezoane
  where activ
  order by data_incepere desc nulls last
  limit 1;
  if not found then
    return jsonb_build_object('eligibil', false, 'motiv', 'Nu există un sezon activ.');
  end if;

  -- Contractul membrului pe sezonul activ: doar abonamentele recurente (facultativele
  -- se plătesc lună de lună, nu fac obiectul contractului pe sezon).
  with rate as (
    select e.id,
           e.data_incepere,
           coalesce(e.suma, e.suma_baza, 0)::numeric as suma_curenta,
           coalesce(
             case
               when e.este_reinscriere
                and c.pret_lunar_promo is not null and c.pret_lunar_promo > 0
                and c.pret_anual is not null and c.pret_anual > 0
                and coalesce(e.suma_baza, 0) = c.pret_lunar_promo
               then round(c.pret_anual / 10.0)
             end,
             coalesce(e.suma_baza, 0)
           )::numeric as pret_lista,
           (select coalesce(sum(i.suma), 0) from incasari i where i.inregistrare = e.id) as platit
    from enrollments e
    join cursuri c on c.id = e.cursul
    where e.client = p_client
      and e.activ and not e.reziliat
      and e.tip_plata in ('Per luna', 'Per an')
      and not c.facultativ
      and coalesce(e.sezon_id, c.sezon) = v_sezon.id
  )
  select count(*),
         coalesce(sum(platit), 0),
         coalesce(sum(suma_curenta), 0),
         coalesce(jsonb_agg(jsonb_build_object(
           'enrollment_id', id,
           'suma_curenta', suma_curenta,
           'pret_lista', pret_lista
         ) order by data_incepere asc nulls last, id), '[]'::jsonb)
    into v_nr, v_platit, v_total_curent, v_rate
  from rate;

  if v_sezon.scadenta_plata_integrala is null then
    return jsonb_build_object('eligibil', false, 'motiv', 'Sezonul nu are termen pentru plata integrală.');
  end if;
  if current_date > v_sezon.scadenta_plata_integrala then
    return jsonb_build_object('eligibil', false,
      'motiv', 'Termenul pentru plata integrală cu reducere a trecut (' ||
               to_char(v_sezon.scadenta_plata_integrala, 'DD.MM.YYYY') || ').');
  end if;
  if v_nr < 2 then
    return jsonb_build_object('eligibil', false, 'motiv', 'Nu există un contract pe sezon pentru acest membru.');
  end if;
  if v_platit > 0 then
    return jsonb_build_object('eligibil', false,
      'motiv', 'Reducerea de 5% se acordă doar dacă sezonul se achită integral, dintr-o singură plată.');
  end if;

  -- 5% pe valoarea contractului — dar numai peste ratele pe care reducerea chiar se
  -- aplică (cele care au deja −10% rămân la −10%: reducerile nu se cumulează).
  select coalesce(sum((x->>'pret_lista')::numeric), 0)
    into v_total_lista
  from jsonb_array_elements(v_rate) x
  where (x->>'pret_lista')::numeric - round((x->>'pret_lista')::numeric * 0.05)
        < (x->>'suma_curenta')::numeric;
  v_disc_target := round(v_total_lista * 0.05);

  for r in
    select (x->>'enrollment_id')::uuid as id,
           (x->>'suma_curenta')::numeric as suma_curenta,
           (x->>'pret_lista')::numeric as pret_lista
    from jsonb_array_elements(v_rate) x
  loop
    v_pay := least(r.suma_curenta, r.pret_lista - round(r.pret_lista * 0.05));
    if v_pay >= r.suma_curenta then
      v_pay := r.suma_curenta;               -- are deja o reducere mai bună
    else
      v_disc_sum := v_disc_sum + (r.suma_curenta - v_pay);
      if v_idx < 0 then v_idx := v_i; end if;
    end if;
    v_out := v_out || jsonb_build_object('enrollment_id', r.id, 'pay', v_pay);
    v_i := v_i + 1;
  end loop;

  -- Corecția de rotunjire: discountul total trebuie să fie exact 5% din contract.
  v_diff := v_disc_target - v_disc_sum;
  if v_idx >= 0 and v_diff <> 0 then
    v_pay := (v_out -> v_idx ->> 'pay')::numeric - v_diff;
    v_out := jsonb_set(v_out, array[v_idx::text, 'pay'], to_jsonb(v_pay));
  end if;

  select coalesce(sum((x->>'pay')::numeric), 0) into v_total_plata
  from jsonb_array_elements(v_out) x;

  return jsonb_build_object(
    'eligibil', true,
    'sezon_id', v_sezon.id,
    'sezon_nume', v_sezon.numele_sezonului,
    'scadenta', v_sezon.scadenta_plata_integrala,
    'luni', v_nr,
    'total_curent', v_total_curent,
    'total_plata', v_total_plata,
    'discount', v_total_curent - v_total_plata,
    'amount', v_total_plata,
    'plan', v_out
  );
end;
$$;

revoke execute on function plan_plata_integrala_sezon(uuid) from anon, public;
grant execute on function plan_plata_integrala_sezon(uuid) to authenticated;

-- ── 5. Confirmarea plății: ramura de plată integrală + REPARAREA datoriilor one-off.
-- Bug reparat aici: ramura `datorie_id` (introdusă în 20260629150000) s-a pierdut la
-- 20260708100000 (bilete), care a redefinit funcția fără ea; 20260714170000 a copiat
-- corpul rupt mai departe. Efect: o datorie one-off plătită din portal se înregistra ca
-- încasare fără `inregistrare` și fără `datorie` — banii rămâneau suspendați, iar
-- datoria deschisă. Niciun ordin real nu a trecut încă pe ramura asta (verificat).
create or replace function confirm_netopia_payment(
  p_order_ref text,
  p_transaction_id text,
  p_amount numeric
)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_order netopia_orders%rowtype;
  v_item jsonb;
  v_enrollment uuid;
  v_incasare uuid;
  v_pay numeric;
  v_locatie uuid;
  v_rez open_rezervari%rowtype;
  v_curs_id uuid;
  v_data date;
  v_eveniment uuid;
  v_bilet record;
  v_seq integer;
  v_datorie uuid;
  v_categorie text;
begin
  select * into v_order from netopia_orders where order_ref = p_order_ref for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'order_not_found');
  end if;

  -- Idempotență: aceeași comandă/tranzacție procesată deja => no-op.
  if v_order.status = 'confirmed' or v_order.netopia_transaction_id is not null then
    return jsonb_build_object('ok', true, 'idempotent', true);
  end if;

  -- Suma confirmată trebuie să corespundă intentului (toleranță de bani).
  if abs(coalesce(p_amount, 0) - v_order.amount) > 0.5 then
    update netopia_orders set status = 'failed', updated = now() where id = v_order.id;
    return jsonb_build_object('ok', false, 'reason', 'amount_mismatch');
  end if;

  -- ----- Ramura BILET: finalizează biletele rezervate + generează coduri -----
  if v_order.order_type = 'bilet' then
    perform 1 from bilete where order_ref = p_order_ref and status = 'rezervat' for update;
    select eveniment into v_eveniment
      from bilete where order_ref = p_order_ref and status = 'rezervat' limit 1;
    if v_eveniment is null then
      update netopia_orders set status = 'failed', updated = now() where id = v_order.id;
      return jsonb_build_object('ok', false, 'reason', 'tickets_missing');
    end if;

    v_seq := 0;
    for v_bilet in
      select id from bilete
      where order_ref = p_order_ref and status = 'rezervat'
      order by created, id
    loop
      v_seq := v_seq + 1;
      update bilete
        set status = 'platit', cod = p_order_ref || '-' || lpad(v_seq::text, 3, '0')
      where id = v_bilet.id;
    end loop;

    insert into incasari (bilet, client, data, suma, bucati, metoda, categorie, observatii)
    values (v_eveniment, v_order.client_id, current_date, v_order.amount, v_order.nr_bilete,
            'Online', 'Bilet', 'Bilete online Netopia ' || p_order_ref);

    update netopia_orders
      set status = 'confirmed', netopia_transaction_id = p_transaction_id, updated = now()
    where id = v_order.id;

    return jsonb_build_object('ok', true, 'nr', v_seq);
  end if;

  -- ----- Ramura REZERVARE: finalizează holdul -----
  if v_order.order_type = 'rezervare' then
    select * into v_rez from open_rezervari where id = v_order.rezervare_id for update;
    if not found then
      update netopia_orders set status = 'failed', updated = now() where id = v_order.id;
      return jsonb_build_object('ok', false, 'reason', 'hold_missing');
    end if;
    if v_rez.status = 'anulat' then
      update netopia_orders set status = 'failed', updated = now() where id = v_order.id;
      return jsonb_build_object('ok', false, 'reason', 'hold_expired');
    end if;

    select s.curs, s.data::date into v_curs_id, v_data
    from open_sesiuni s where s.id = v_rez.sesiune;
    select c.locatie into v_locatie from cursuri c where c.id = v_curs_id;

    insert into enrollments (client, cursul, tip_plata, suma_baza, suma, data_incepere, data_final, activ)
    values (v_order.client_id, v_curs_id, 'Per sedinta', v_order.amount, v_order.amount, v_data, null, true)
    returning id into v_enrollment;

    insert into incasari (inregistrare, client, data, suma, metoda, categorie, locatie, observatii)
    values (v_enrollment, v_order.client_id, current_date, v_order.amount, 'Online', 'Abonament',
            v_locatie, 'Rezervare online Netopia ' || p_order_ref)
    returning id into v_incasare;

    update open_rezervari
      set status = 'platit', enrollment = v_enrollment, incasare = v_incasare
    where id = v_rez.id;

    update netopia_orders
      set status = 'confirmed', netopia_transaction_id = p_transaction_id, updated = now()
    where id = v_order.id;

    return jsonb_build_object('ok', true);
  end if;

  -- ----- Ramura ABONAMENT (FIFO / plată integrală): încasările din snapshot -----
  for v_item in select * from jsonb_array_elements(v_order.fifo_plan)
  loop
    v_pay := (v_item->>'pay')::numeric;
    if v_pay is null or v_pay <= 0 then continue; end if;

    if v_item ? 'enrollment_id' then
      v_enrollment := (v_item->>'enrollment_id')::uuid;
      select c.locatie into v_locatie
      from enrollments e join cursuri c on c.id = e.cursul
      where e.id = v_enrollment;

      insert into incasari (inregistrare, client, data, suma, metoda, categorie, locatie, observatii)
      values (v_enrollment, v_order.client_id, current_date, v_pay, 'Online', 'Abonament',
              v_locatie, case when v_order.plata_integrala
                              then 'Plată integrală sezon (−5%) Netopia ' || p_order_ref
                              else 'Plată online Netopia ' || p_order_ref end);

      -- Plata integrală: prețul rândului devine cel din ofertă (rest 0). Se face DUPĂ
      -- încasare — o dată ce rândul are bani pe el, motorul de reduceri nu-l mai atinge,
      -- deci nu poate rescrie `suma` înapoi la preț întreg.
      if v_order.plata_integrala then
        update enrollments e
          set suma = v_pay,
              discount_integral = greatest(
                0, coalesce(e.suma_baza, 0) - coalesce(e.politica_discount, 0) - v_pay)
        where e.id = v_enrollment;
      end if;

    elsif v_item ? 'datorie_id' then
      v_datorie := (v_item->>'datorie_id')::uuid;
      select d.categorie, d.locatie into v_categorie, v_locatie
      from datorii d where d.id = v_datorie;

      insert into incasari (datorie, client, data, suma, metoda, categorie, locatie, observatii)
      values (v_datorie, v_order.client_id, current_date, v_pay, 'Online', coalesce(v_categorie, 'Taxa'),
              v_locatie, 'Plată online Netopia ' || p_order_ref);
    end if;
  end loop;

  update netopia_orders
    set status = 'confirmed', netopia_transaction_id = p_transaction_id, updated = now()
  where id = v_order.id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function confirm_netopia_payment(text, text, numeric) from public, authenticated, anon;
grant execute on function confirm_netopia_payment(text, text, numeric) to service_role;
