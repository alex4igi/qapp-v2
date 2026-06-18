-- Voucher pe REZERVARE (OPEN/workshop/eveniment) — wiring în calea de plată Netopia.
-- Decizie user 2026-06-19: codurile se aplică DOAR pe rezervări (înrolare „Per sedinta"),
-- nu pe abonamentele lunare (acolo merg reducerile automate family/cross-sell).
--
-- Fluxul: edge `netopia-create-payment` validează codul (validate_voucher_code) ÎNAINTE de
-- a contacta Netopia, aplică discountul pe sumă și stochează `voucher_id` pe comandă. La
-- confirmare, confirm_netopia_payment înrolează cu suma_baza=preț întreg, suma=preț redus,
-- setează enrollments.voucher (triggerul existent decrementează contorul GLOBAL) și scrie
-- un rând în voucher_redemptions (pt limita PER CLIENT). Idempotent (un singur confirm/order).

alter table netopia_orders
  add column if not exists voucher_id uuid references vouchere(id);

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

    -- înrolare facultativă „Per ședință": suma_baza = preț întreg (din hold), suma = ce s-a
    -- plătit efectiv (v_order.amount, deja redus de voucher în edge). Setarea voucher-ului
    -- declanșează triggerul de decrement al contorului GLOBAL.
    insert into enrollments (client, cursul, tip_plata, suma_baza, suma, voucher, data_incepere, data_final, activ)
    values (v_order.client_id, v_curs_id, 'Per sedinta', coalesce(v_rez.suma, v_order.amount),
            v_order.amount, v_order.voucher_id, v_data, null, true)
    returning id into v_enrollment;

    insert into incasari (inregistrare, client, data, suma, metoda, categorie, locatie, observatii)
    values (v_enrollment, v_order.client_id, current_date, v_order.amount, 'Card', 'Abonament',
            v_locatie, 'Rezervare online Netopia ' || p_order_ref)
    returning id into v_incasare;

    -- Jurnal răscumpărare (pt limita per client). Doar dacă s-a folosit un cod.
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

  -- ----- Ramura ABONAMENT (FIFO): scrie încasările din snapshot (un rând per înrolare) -----
  for v_item in select * from jsonb_array_elements(v_order.fifo_plan)
  loop
    v_enrollment := (v_item->>'enrollment_id')::uuid;
    v_pay := (v_item->>'pay')::numeric;
    if v_pay is null or v_pay <= 0 then continue; end if;

    select c.locatie into v_locatie
    from enrollments e join cursuri c on c.id = e.cursul
    where e.id = v_enrollment;

    insert into incasari (inregistrare, client, data, suma, metoda, categorie, locatie, observatii)
    values (v_enrollment, v_order.client_id, current_date, v_pay, 'Card', 'Abonament',
            v_locatie, 'Plată online Netopia ' || p_order_ref);
  end loop;

  update netopia_orders
    set status = 'confirmed', netopia_transaction_id = p_transaction_id, updated = now()
  where id = v_order.id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function confirm_netopia_payment(text, text, numeric) from public, authenticated;
grant execute on function confirm_netopia_payment(text, text, numeric) to service_role;
