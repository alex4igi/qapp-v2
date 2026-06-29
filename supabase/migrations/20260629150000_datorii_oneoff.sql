-- Datorii one-off (Bilet / Merch / Taxă): ledger de creanțe pentru vânzări care NU
-- sunt înrolări. Permite încasare parțială/0 la recepție, restul rămânând datorie
-- urmărită (plătibilă ulterior la studio sau integral din portal de către părinți).
--
-- Model: incasari = PLATA (imutabilă). datorii = CHARGE (cât datorează clientul).
-- rest = suma_datorata − sum(incasari.suma where datorie = id).  Vânzările achitate
-- integral NU creează datorie (rămân ca azi, doar incasari cu bilet/articol).
--
-- Tablele financiare (incasari/enrollments/clienti) nu au RLS — accesul staff e prin
-- sesiune authenticated, iar portalul DOAR prin RPC security-definer. datorii la fel.

create table if not exists datorii (
  id               uuid primary key default gen_random_uuid(),
  client           uuid not null references clienti(id) on delete cascade,
  categorie        categorie_incasare not null,
  descriere        text,
  suma_datorata    numeric not null check (suma_datorata > 0),
  bilet            uuid references evenimente(id) on delete set null,
  articol_inventar uuid references inventar(id) on delete set null,
  bucati           integer,
  voucher          uuid references vouchere(id) on delete set null,
  sezon            uuid references sezoane(id) on delete set null,
  locatie          uuid references locatii(id) on delete set null,
  created          timestamptz not null default now(),
  updated          timestamptz not null default now()
);
create index if not exists idx_datorii_client on datorii(client);

-- FK plății către datorie (oglindă a incasari.inregistrare pentru înrolări).
alter table incasari add column if not exists datorie uuid references datorii(id) on delete set null;
create index if not exists idx_incasari_datorie on incasari(datorie);

-- Restul per datorie (canonic, ca plati_inrolari pentru înrolări).
create or replace view datorii_rest as
select
  d.id,
  d.client,
  d.categorie,
  d.descriere,
  d.suma_datorata,
  d.bilet,
  d.articol_inventar,
  d.bucati,
  d.locatie,
  d.sezon,
  d.created,
  coalesce(sum(i.suma), 0)::numeric as platit,
  (d.suma_datorata - coalesce(sum(i.suma), 0))::numeric as rest,
  cl.nume,
  cl.prenume
from datorii d
left join incasari i on i.datorie = d.id
left join clienti cl on cl.id = d.client
group by d.id, cl.id;

-- ============================================================
-- Portal: datoriile one-off neachitate ale unui membru (rest > 0).
-- ============================================================
create or replace function get_datorii_client(p_client uuid)
returns table (
  datorie_id    uuid,
  categorie     categorie_incasare,
  descriere     text,
  suma_datorata numeric,
  platit        numeric,
  rest          numeric,
  created       timestamptz
)
language sql stable security definer set search_path = public as $$
  select dr.id, dr.categorie, dr.descriere, dr.suma_datorata, dr.platit, dr.rest, dr.created
  from datorii_rest dr
  where dr.client = p_client
    and dr.rest > 0
    and p_client in (select client_member_ids())
  order by dr.created asc;
$$;
grant execute on function get_datorii_client(uuid) to authenticated;

-- ============================================================
-- Plan FIFO portal — acum și cu datorii one-off (plată INTEGRALĂ a fiecărei datorii).
--   p_include_inrolari = false → doar datorii (părintele a ales doar one-off-uri).
--   p_datorii = lista de datorii selectate (full rest fiecare).
-- Dropăm semnătura veche (2 args) ca să nu rămână overload ambiguu pt PostgREST.
-- ============================================================
drop function if exists build_fifo_plan_membru(uuid, uuid);

create or replace function build_fifo_plan_membru(
  p_client uuid,
  p_pana_la uuid default null,
  p_datorii uuid[] default '{}',
  p_include_inrolari boolean default true
)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_enr jsonb := '[]'::jsonb;
  v_dat jsonb := '[]'::jsonb;
  v_enr_amt numeric := 0;
  v_dat_amt numeric := 0;
  v_cutoff_date date;
begin
  if p_client not in (select client_member_ids()) then
    raise exception 'forbidden: clientul nu aparține familiei contului';
  end if;

  if p_include_inrolari then
    if p_pana_la is not null then
      select t.data_incepere into v_cutoff_date
      from plati_inrolari t
      where t.id_enrollment = p_pana_la and t.id_cursant = p_client and t.rest > 0;
      if not found then
        raise exception 'Înrolarea selectată nu există sau e deja achitată.';
      end if;
    end if;

    select coalesce(jsonb_agg(jsonb_build_object('enrollment_id', t.id_enrollment, 'pay', t.rest)
                              order by t.data_incepere asc nulls last, t.id_enrollment), '[]'::jsonb),
           coalesce(sum(t.rest), 0)
      into v_enr, v_enr_amt
    from plati_inrolari t
    where t.id_cursant = p_client
      and t.rest > 0
      and (p_pana_la is null or t.data_incepere <= v_cutoff_date);
  end if;

  if p_datorii is not null and array_length(p_datorii, 1) is not null then
    select coalesce(jsonb_agg(jsonb_build_object('datorie_id', dr.id, 'pay', dr.rest)
                              order by dr.created asc), '[]'::jsonb),
           coalesce(sum(dr.rest), 0)
      into v_dat, v_dat_amt
    from datorii_rest dr
    where dr.client = p_client and dr.rest > 0 and dr.id = any(p_datorii);
  end if;

  return jsonb_build_object('amount', v_enr_amt + v_dat_amt, 'plan', v_enr || v_dat);
end;
$$;
grant execute on function build_fifo_plan_membru(uuid, uuid, uuid[], boolean) to authenticated;

-- ============================================================
-- Confirmare plată webhook — acum gestionează și item-urile datorie_id din plan.
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
  v_datorie uuid;
  v_categorie categorie_incasare;
  v_pay numeric;
  v_locatie uuid;
begin
  select * into v_order from netopia_orders where order_ref = p_order_ref for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'order_not_found');
  end if;

  if v_order.status = 'confirmed' or v_order.netopia_transaction_id is not null then
    return jsonb_build_object('ok', true, 'idempotent', true);
  end if;

  if abs(coalesce(p_amount, 0) - v_order.amount) > 0.5 then
    update netopia_orders set status = 'failed', updated = now() where id = v_order.id;
    return jsonb_build_object('ok', false, 'reason', 'amount_mismatch');
  end if;

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
      values (v_enrollment, v_order.client_id, current_date, v_pay, 'Card', 'Abonament',
              v_locatie, 'Plată online Netopia ' || p_order_ref);

    elsif v_item ? 'datorie_id' then
      v_datorie := (v_item->>'datorie_id')::uuid;
      select d.categorie, d.locatie into v_categorie, v_locatie
      from datorii d where d.id = v_datorie;

      insert into incasari (datorie, client, data, suma, metoda, categorie, locatie, observatii)
      values (v_datorie, v_order.client_id, current_date, v_pay, 'Card', coalesce(v_categorie, 'Taxa'),
              v_locatie, 'Plată online Netopia ' || p_order_ref);
    end if;
  end loop;

  update netopia_orders
    set status = 'confirmed', netopia_transaction_id = p_transaction_id, updated = now()
  where id = v_order.id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function confirm_netopia_payment(text, text, numeric) from public, authenticated;
grant execute on function confirm_netopia_payment(text, text, numeric) to service_role;
