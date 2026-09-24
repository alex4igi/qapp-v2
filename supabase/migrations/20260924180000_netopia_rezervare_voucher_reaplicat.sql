-- Rezervarea OPEN plătită online cu voucher își pierdea voucherul la confirmare.
--
-- 20260619150000 / 20260623100100 scriau pe înrolare prețul întreg (`suma_baza`, din hold),
-- suma plătită (`suma`), voucherul (declanșează decrementul global) și rândul din
-- `voucher_redemptions` (limita per client). 20260714170000 și 20260912120000 au rescris
-- funcția fără ramura asta: înrolarea ieșea cu suma_baza = suma redusă, fără voucher.
-- Corpul e identic cu 20260912120000, cu ramura REZERVARE refăcută.
-- Niciun ordin real nu a trecut cu voucher (verificat 2026-09-24), deci nu e nimic de reparat în date.

create or replace function confirm_netopia_payment(
  p_order_ref text,
  p_transaction_id text,
  p_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

    -- suma_baza = prețul întreg (pus pe hold), suma = ce s-a plătit (redus de voucher în edge).
    -- Voucherul pe înrolare declanșează decrementul contorului global.
    insert into enrollments (client, cursul, tip_plata, suma_baza, suma, voucher, data_incepere, data_final, activ)
    values (v_order.client_id, v_curs_id, 'Per sedinta', coalesce(v_rez.suma, v_order.amount),
            v_order.amount, v_order.voucher_id, v_data, null, true)
    returning id into v_enrollment;

    insert into incasari (inregistrare, client, data, suma, metoda, categorie, locatie, observatii)
    values (v_enrollment, v_order.client_id, current_date, v_order.amount, 'Online', 'Abonament',
            v_locatie, 'Rezervare online Netopia ' || p_order_ref)
    returning id into v_incasare;

    if v_order.voucher_id is not null then
      insert into voucher_redemptions (voucher, client, enrollment, incasare)
      values (v_order.voucher_id, v_order.client_id, v_enrollment, v_incasare);
    end if;

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

revoke execute on function confirm_netopia_payment(text, text, numeric) from anon, public, authenticated;
grant execute on function confirm_netopia_payment(text, text, numeric) to service_role;

-- Membru de trupă = plecarea reală e `data_reziliere`; `reziliat` e bifat și pe lunile
-- încheiate (vezi docs/grila-salarizare-instructori.md).
create or replace function client_in_trupa(p_client uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from enrollments e
    join cursuri c on c.id = e.cursul
    where e.client = p_client
      and e.activ = true
      and (e.data_reziliere is null or e.data_reziliere > current_date)
      and (e.data_final is null or e.data_final >= current_date)
      and c.nivelul = 'Trupa'
  );
$$;
