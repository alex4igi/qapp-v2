-- Portal membri — RPC pentru plata online Netopia.
--   build_fifo_plan_membru  → calculează restanța FIFO a unui membru (sursa de adevăr a sumei)
--   confirm_netopia_payment → scrie `incasari` idempotent la confirmarea webhook-ului
-- Logica FIFO replică registerPlataFifo (src/features/plati/api/incasari.ts): distribuie
-- suma peste înrolări vechi→nou. Aici plătim restul INTEGRAL al fiecărei înrolări cu rest > 0.

-- ============================================================
-- 1) Planul FIFO al unui membru — apelat cu JWT-ul părintelui (auth.uid() => izolare familie)
-- ============================================================
create or replace function build_fifo_plan_membru(p_client uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_plan jsonb;
  v_amount numeric;
begin
  if p_client not in (select client_member_ids()) then
    raise exception 'forbidden: clientul nu aparține familiei contului';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('enrollment_id', t.id_enrollment, 'pay', t.rest)
                            order by t.data_incepere asc nulls last, t.id_enrollment), '[]'::jsonb),
         coalesce(sum(t.rest), 0)
    into v_plan, v_amount
  from plati_inrolari t
  where t.id_cursant = p_client and t.rest > 0;

  return jsonb_build_object('amount', v_amount, 'plan', v_plan);
end;
$$;

grant execute on function build_fifo_plan_membru(uuid) to authenticated;

-- ============================================================
-- 2) Confirmarea plății — apelat DOAR de webhook (service_role). Idempotent.
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
  v_pay numeric;
  v_locatie uuid;
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

  -- Scrie încasările din snapshot-ul FIFO (un rând per înrolare).
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
