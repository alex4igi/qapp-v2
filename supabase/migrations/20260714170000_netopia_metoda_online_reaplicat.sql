-- Plățile online Netopia se înregistrează cu metoda 'Online', nu 'Card'.
-- Regresie: 20260623100100 pusese deja 'Online', dar redefinirile ulterioare ale
-- confirm_netopia_payment (20260629150000 datorii, 20260708100000 bilete) au
-- reintrodus 'Card'. Reaplicăm 'Online' pe versiunea activă (din 20260708100000),
-- pe toate cele 3 ramuri: bilet, rezervare, abonament (FIFO).
-- Corp copiat 1:1 din 20260708100000, singura schimbare: 'Card' → 'Online'.

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
    -- blochează biletele acestei comenzi (holdurile create la hold_bilete)
    perform 1 from bilete where order_ref = p_order_ref and status = 'rezervat' for update;
    select eveniment into v_eveniment
      from bilete where order_ref = p_order_ref and status = 'rezervat' limit 1;
    if v_eveniment is null then
      update netopia_orders set status = 'failed', updated = now() where id = v_order.id;
      return jsonb_build_object('ok', false, 'reason', 'tickets_missing');
    end if;

    -- flip 'rezervat'→'platit' cu cod scanabil unic per comandă (order_ref-NNN)
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

    -- o singură încasare pentru comandă: bilet=eveniment, bucati=nr, categorie='Bilet'
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
    values (v_enrollment, v_order.client_id, current_date, v_pay, 'Online', 'Abonament',
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

-- Corectează retroactiv încasările lui Stefan Loghin (confirmate manual cu 'Card').
update incasari
set metoda = 'Online'
where observatii = 'Plată online Netopia QM-MRKUP8S8-15810A36'
  and metoda = 'Card';
