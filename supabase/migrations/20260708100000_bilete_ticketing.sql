-- Modul Ticketing spectacole (Plan A din analiza DanceStudio-Pro).
--
-- Context: azi „Bilet" = doar un rând `incasari` (o plată încasată la recepție), fără
-- bilet-per-persoană, fără cod, fără check-in la intrare. Vrem vânzare online în portalul
-- de membri (rol `parinte`) + validare la ușă. Punctul de plecare: un `spectacol` (Plan B)
-- se leagă opțional de un `evenimente` (spectacole.eveniment); biletele se vând pentru acel
-- eveniment (are deja `pret_bilet` + `capacitate`).
--
-- Reutilizăm WHOLESALE motorul Netopia: `netopia_orders` (hold→pay→confirm, idempotent,
-- semnătură IPN) + cele 2 edge functions. Singura primitivă nouă: rândul-per-bilet cu cod.
-- Discriminăm comanda prin `order_type = 'bilet'` (lângă 'abonament'/'rezervare').

-- ============================================================
-- 1) Tabel bilete — un rând per bilet vândut/rezervat.
-- ============================================================
create table bilete (
  id         uuid primary key default gen_random_uuid(),
  eveniment  uuid not null references evenimente(id) on delete cascade,
  -- Legătura spre comanda Netopia (plain text, fără FK: se stampilează în hold, ÎNAINTE
  -- ca rândul netopia_orders să existe — permite curățarea holdurilor orfane by order_ref).
  order_ref  text,
  client     uuid references clienti(id) on delete set null,
  portal_account_id uuid,
  pret       numeric not null default 0,
  -- Cod QR/scanabil — generat la confirmarea plății (null cât e doar 'rezervat').
  cod        text unique,
  status     text not null default 'rezervat'
    check (status in ('rezervat', 'platit', 'anulat', 'validat')),
  validat_at timestamptz,
  created    timestamptz not null default now()
);
create index idx_bilete_eveniment on bilete(eveniment);
create index idx_bilete_order_ref on bilete(order_ref);
create index idx_bilete_client    on bilete(client);

-- ============================================================
-- 2) Extinde netopia_orders pentru comenzile de tip bilet.
-- ============================================================
alter table netopia_orders
  drop constraint if exists netopia_orders_order_type_check;
alter table netopia_orders
  add constraint netopia_orders_order_type_check
    check (order_type in ('abonament', 'rezervare', 'bilet'));
alter table netopia_orders
  add column if not exists eveniment_id uuid references evenimente(id),
  add column if not exists nr_bilete    integer;

-- ============================================================
-- 3) HOLD — rezervă `p_qty` bilete (status 'rezervat', fără bani), scopat la familia
--    contului. Apelat cu JWT-ul părintelui din edge function. Blocare strictă la
--    capacitate cu FOR UPDATE pe eveniment (ca hold_loc_open). TTL lazy: holdurile
--    'rezervat' mai vechi de 30 min (checkout abandonat) se anulează la fiecare hold nou.
-- ============================================================
create or replace function hold_bilete(
  p_eveniment uuid,
  p_qty       integer,
  p_client    uuid,
  p_order_ref text
)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_cap    integer;
  v_status status_eveniment;
  v_pret   numeric;
  v_count  integer;
  i        integer;
begin
  -- authz: doar conturi parinte, doar pentru membrii propriei familii
  if not is_parinte() then
    raise exception 'forbidden';
  end if;
  if p_client not in (select client_member_ids()) then
    raise exception 'forbidden: clientul nu aparține familiei contului';
  end if;
  if p_qty is null or p_qty < 1 or p_qty > 10 then
    raise exception 'Număr de bilete invalid (1-10).';
  end if;

  -- eliberează holdurile expirate (checkout abandonat) înainte de a număra capacitatea
  update bilete set status = 'anulat'
   where eveniment = p_eveniment and status = 'rezervat'
     and created < now() - interval '30 minutes';

  -- blochează rândul evenimentului → serializează cumpărările concurente
  select e.capacitate, e.status, e.pret_bilet into v_cap, v_status, v_pret
  from evenimente e where e.id = p_eveniment for update;
  if not found then
    raise exception 'Evenimentul nu există.';
  end if;
  if v_status = 'Anulat' then
    raise exception 'Evenimentul este anulat.';
  end if;
  if v_pret is null or v_pret <= 0 then
    raise exception 'Evenimentul nu are un preț de bilet valid.';
  end if;

  -- capacitate strictă: numără biletele vii (rezervat + platit + validat)
  if v_cap is not null then
    select count(*) into v_count
    from bilete where eveniment = p_eveniment and status <> 'anulat';
    if v_count + p_qty > v_cap then
      raise exception 'Locuri insuficiente (% / % ocupate).', v_count, v_cap;
    end if;
  end if;

  for i in 1..p_qty loop
    insert into bilete (eveniment, order_ref, client, pret, status)
    values (p_eveniment, p_order_ref, p_client, v_pret, 'rezervat');
  end loop;

  return jsonb_build_object('amount', v_pret * p_qty, 'nr', p_qty);
end;
$$;

revoke all on function hold_bilete(uuid, integer, uuid, text) from public;
grant execute on function hold_bilete(uuid, integer, uuid, text) to authenticated;

-- ============================================================
-- 4) CONFIRM — ramură nouă 'bilet' în confirm_netopia_payment. Idempotent, service_role.
--    Ramurile 'rezervare'/'abonament' rămân identice cu 20260616120000.
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
            'Card', 'Bilet', 'Bilete online Netopia ' || p_order_ref);

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
-- 5) CANCEL — ramură bilet: eliberează biletele rezervate (nu cele plătite).
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

  if v_order.order_type = 'bilet' then
    update bilete set status = 'anulat'
    where order_ref = p_order_ref and status = 'rezervat';
  end if;
end;
$$;

revoke all on function cancel_netopia_order(text) from public, authenticated;
grant execute on function cancel_netopia_order(text) to service_role;

-- ============================================================
-- 6) VALIDARE la ușă — staff scanează codul. Idempotent-safe: refuză dubla-validare.
-- ============================================================
create or replace function valideaza_bilet(p_cod text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_bilet bilete%rowtype;
  v_nume  text;
  v_ev    text;
begin
  -- doar staff (orice rol non-parinte, autentificat); recepția validează la intrare
  if is_parinte() or auth_role() is null then
    raise exception 'forbidden';
  end if;

  select * into v_bilet from bilete where cod = p_cod for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'inexistent');
  end if;
  if v_bilet.status = 'anulat' then
    return jsonb_build_object('ok', false, 'reason', 'anulat');
  end if;
  if v_bilet.status = 'rezervat' then
    return jsonb_build_object('ok', false, 'reason', 'neplatit');
  end if;
  if v_bilet.status = 'validat' then
    return jsonb_build_object('ok', false, 'reason', 'deja_validat',
                             'validat_at', v_bilet.validat_at);
  end if;

  update bilete set status = 'validat', validat_at = now() where id = v_bilet.id;

  select nume_eveniment into v_ev from evenimente where id = v_bilet.eveniment;
  select trim(coalesce(nume, '') || ' ' || coalesce(prenume, '')) into v_nume
  from clienti where id = v_bilet.client;

  return jsonb_build_object('ok', true, 'eveniment', v_ev, 'client', v_nume, 'pret', v_bilet.pret);
end;
$$;

revoke all on function valideaza_bilet(text) from public;
grant execute on function valideaza_bilet(text) to authenticated;

-- ============================================================
-- 7) Biletele unui membru — citire pentru portal (rol parinte, scop familie).
-- ============================================================
create or replace function get_bilete_membru(p_client uuid)
returns table (
  id uuid, eveniment uuid, eveniment_nume text, data date, locatie text,
  cod text, pret numeric, status text, created timestamptz
)
language sql stable security definer set search_path = public as $$
  select b.id, b.eveniment, e.nume_eveniment, e.data, e.locatia,
         b.cod, b.pret, b.status, b.created
  from bilete b
  join evenimente e on e.id = b.eveniment
  where b.client = p_client
    and b.client in (select client_member_ids())
    and b.status in ('platit', 'validat')
  order by e.data desc nulls last, b.created desc;
$$;

grant execute on function get_bilete_membru(uuid) to authenticated;

-- ============================================================
-- 8) RLS — READ tot staff-ul; scrierile reale trec prin RPC-uri SECURITY DEFINER.
--    Gardul deny_parinte_direct blochează conturile de portal (portalul citește prin
--    get_bilete_membru / cumpără prin edge function).
-- ============================================================
alter table bilete enable row level security;

create policy bilete_select on bilete for select to authenticated using (true);
create policy bilete_write on bilete for all to authenticated
  using (auth_role() in ('owner', 'admin', 'manager'))
  with check (auth_role() in ('owner', 'admin', 'manager'));
create policy deny_parinte_direct on bilete as restrictive for all to authenticated
  using (auth_role() <> 'parinte') with check (auth_role() <> 'parinte');
