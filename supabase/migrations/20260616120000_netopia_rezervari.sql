-- Portal membri — REZERVARE OPEN class cu plată online Netopia.
-- Refolosim infrastructura `netopia_orders` + cele 2 edge functions (un singur webhook,
-- o singură verificare de semnătură, aceeași idempotență). Discriminăm tipul comenzii
-- printr-o coloană `order_type`:
--   * 'abonament' → flux existent: fifo_plan = snapshot, rezervare_id = null.
--   * 'rezervare' → rezervare_id = holdul creat în avans, fifo_plan = '[]', amount = preț ședință.
-- Fluxul: hold_loc_open() creează un loc 'rezervat' (fără bani) → comanda Netopia →
-- confirm_netopia_payment() finalizează 'rezervat'→'platit' + enrollment + incasare la webhook.

-- ============================================================
-- 1) Extinde netopia_orders pentru comenzile de tip rezervare
-- ============================================================
alter table netopia_orders
  add column if not exists order_type text not null default 'abonament'
    check (order_type in ('abonament', 'rezervare')),
  add column if not exists rezervare_id uuid references open_rezervari(id);

-- ============================================================
-- 2) HOLD — rezervă un loc fără bani (status 'rezervat'), scopat la familia contului.
--    Apelat cu JWT-ul părintelui din edge function => auth_role()/auth.uid() funcționează.
--    Blocare strictă la capacitate cu FOR UPDATE pe sesiune (ca rezerva_loc_open).
-- ============================================================
create or replace function hold_loc_open(p_client uuid, p_sesiune uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_cap     integer;
  v_status  text;
  v_curs    uuid;
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
  select s.capacitate, s.status, s.curs into v_cap, v_status, v_curs
  from open_sesiuni s where s.id = p_sesiune for update;
  if not found then
    raise exception 'Sesiunea nu există.';
  end if;
  if v_status = 'anulata' then
    raise exception 'Sesiunea este anulată.';
  end if;

  -- preț din curs + validare facultativ (rezervările OPEN sunt doar pe cursuri facultative)
  select c.pret_sedinta into v_pret
  from cursuri c where c.id = v_curs and coalesce(c.facultativ, false);
  if not found then
    raise exception 'Curs invalid pentru rezervare.';
  end if;
  if v_pret is null or v_pret <= 0 then
    raise exception 'Sesiunea nu are un preț valid.';
  end if;

  -- capacitate strictă: numără holdurile vii (rezervat + platit)
  select count(*) into v_count
  from open_rezervari where sesiune = p_sesiune and status <> 'anulat';
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

revoke all on function hold_loc_open(uuid, uuid) from public;
grant execute on function hold_loc_open(uuid, uuid) to authenticated;

-- ============================================================
-- 3) CONFIRM — apelat DOAR de webhook (service_role). Idempotent.
--    Ramifică pe order_type; ramura 'abonament' rămâne identică cu versiunea precedentă.
-- ============================================================
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

    -- înrolare facultativă „Per ședință" (setează ȘI suma_baza — invariant discount)
    insert into enrollments (client, cursul, tip_plata, suma_baza, suma, data_incepere, data_final, activ)
    values (v_order.client_id, v_curs_id, 'Per sedinta', v_order.amount, v_order.amount, v_data, null, true)
    returning id into v_enrollment;

    insert into incasari (inregistrare, client, data, suma, metoda, categorie, locatie, observatii)
    values (v_enrollment, v_order.client_id, current_date, v_order.amount, 'Card', 'Abonament',
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

-- ============================================================
-- 4) CANCEL — apelat de webhook (service_role) la status terminal de eșec.
--    Anulează comanda și, dacă e rezervare, eliberează holdul (capacitatea).
-- ============================================================
create or replace function cancel_netopia_order(p_order_ref text)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_order netopia_orders%rowtype;
begin
  select * into v_order from netopia_orders where order_ref = p_order_ref for update;
  if not found or v_order.status = 'confirmed' then
    return; -- nu anula o comandă deja confirmată
  end if;

  update netopia_orders set status = 'canceled', updated = now() where id = v_order.id;

  if v_order.rezervare_id is not null then
    update open_rezervari
      set status = 'anulat', anulat_at = now(), anulat_motiv = 'plată eșuată/anulată'
    where id = v_order.rezervare_id and status <> 'platit';
  end if;
end;
$$;

revoke all on function cancel_netopia_order(text) from public, authenticated;
grant execute on function cancel_netopia_order(text) to service_role;
