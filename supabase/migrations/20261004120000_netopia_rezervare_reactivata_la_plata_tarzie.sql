-- Plata reușită pe o rezervare deja anulată nu se mai pierde.
--
-- Cazul din 3/4 oct. 2026 (Alexandru Simiuc, QM-MUSWPJST-0462CE7B): prima încercare de card
-- a fost refuzată → IPN „eșuat" → cancel_netopia_order a anulat holdul. Omul a reîncercat pe
-- aceeași pagină Netopia, plata a trecut, iar confirm_netopia_payment a găsit rezervarea
-- 'anulat' și a marcat comanda 'failed': bani încasați, nimic în aplicație.
--
-- Acum, dacă holdul e anulat dar ședința e activă, mai are loc și clientul nu are deja altă
-- rezervare vie pe ea, confirmarea reactivează holdul și merge mai departe. Altfel rămâne
-- refuzul + notificarea către owner/admin, cu motivul exact.
--
-- Pornit din pg_get_functiondef LIVE (vezi regresia voucherului, 20260924180000).

create or replace function public.confirm_netopia_payment(p_order_ref text, p_transaction_id text, p_amount numeric)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  v_cap integer;
  v_ses_status text;
  v_count integer;
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
      -- Același lacăt și aceeași numărătoare ca hold_loc_open, ca să nu depășim capacitatea.
      select s.capacitate, s.status, s.curs, s.data::date into v_cap, v_ses_status, v_curs_id, v_data
      from open_sesiuni s where s.id = v_rez.sesiune for update;

      if exists (
        select 1 from open_rezervari r
        where r.sesiune = v_rez.sesiune and r.client = v_rez.client and r.status <> 'anulat'
      ) then
        update netopia_orders set status = 'failed', updated = now() where id = v_order.id;
        return jsonb_build_object('ok', false, 'reason', 'alta_rezervare_activa');
      end if;

      select count(*) into v_count from (
        select r.client from open_rezervari r
        where r.sesiune = v_rez.sesiune and r.status <> 'anulat'
        union
        select e.client from enrollments e
        where e.cursul = v_curs_id
          and e.client is not null
          and e.reziliat = false
          and e.tip_plata in ('Per luna', 'Per an')
          and e.data_incepere <= v_data
          and (e.data_final is null or e.data_final >= v_data)
      ) occupants;

      if v_ses_status is null or v_ses_status = 'anulata' or v_count >= v_cap then
        update netopia_orders set status = 'failed', updated = now() where id = v_order.id;
        return jsonb_build_object('ok', false, 'reason', 'hold_expired');
      end if;

      update open_rezervari
        set status = 'rezervat', anulat_at = null, anulat_motiv = null
      where id = v_rez.id;
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
$function$;

-- Notificarea spune acum de ce nu s-a putut reactiva locul.
create or replace function public.notifica_plata_online_problema(p_order_ref text, p_motiv text)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_order     netopia_orders%rowtype;
  v_client    text;
  v_recipient uuid;
  v_explicatie text;
  v_count     int := 0;
begin
  select * into v_order from netopia_orders where order_ref = p_order_ref;
  if not found then
    return 0;
  end if;

  -- IPN-ul e reîncercat de Netopia, iar reconcilierea trece din oră în oră: aceeași
  -- problemă pe aceeași comandă se anunță o singură dată.
  if exists (
    select 1 from notifications
    where kind = 'plata_online_problema'
      and payload->>'order_ref' = p_order_ref
      and payload->>'motiv' = p_motiv
  ) then
    return 0;
  end if;

  select trim(coalesce(c.prenume, '') || ' ' || coalesce(c.nume, '')) into v_client
  from clienti c where c.id = v_order.client_id;

  v_explicatie := case p_motiv
    when 'amount_mismatch' then 'Suma confirmată de Netopia diferă de suma comenzii.'
    when 'hold_expired'    then 'Rezervarea locului fusese anulată, iar între timp ședința s-a umplut sau a fost anulată.'
    when 'alta_rezervare_activa' then 'Rezervarea locului fusese anulată, iar clientul are deja altă rezervare pe aceeași ședință (posibilă plată dublă).'
    when 'hold_missing'    then 'Rezervarea locului nu mai există.'
    when 'tickets_missing' then 'Biletele rezervate nu mai există.'
    when 'order_not_found' then 'Comanda nu mai există în aplicație.'
    else 'Motiv: ' || coalesce(p_motiv, 'necunoscut') || '.'
  end;

  for v_recipient in
    select id from auth.users
    where raw_app_meta_data->>'role' in ('owner', 'admin')
  loop
    insert into notifications (
      recipient_user_id, kind, title, body, payload, requires_action, status
    ) values (
      v_recipient,
      'plata_online_problema',
      format('Plată online fără încasare: %s RON', trim(to_char(v_order.amount, 'FM999999990.00'))),
      format(
        '%s%s Banii pot fi la Netopia, dar în aplicație nu s-a înregistrat nimic. Verifică plata în panoul Netopia (comanda %s) și, dacă a intrat, înregistrează încasarea manual.',
        case when coalesce(v_client, '') <> '' then v_client || ' · ' else '' end,
        v_explicatie,
        p_order_ref
      ),
      jsonb_build_object(
        'order_ref', p_order_ref,
        'motiv', p_motiv,
        'amount', v_order.amount,
        'client_id', v_order.client_id,
        'order_type', v_order.order_type
      ),
      true,
      'open'
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;
