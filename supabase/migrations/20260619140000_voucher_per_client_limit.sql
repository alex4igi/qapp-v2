-- Vouchere — limită de utilizări PER CLIENT + jurnal de răscumpărări.
--
-- Context: azi `vouchere.numar_utilizari` e un contor GLOBAL, decrementat de
-- triggerul trg_voucher_decrement la crearea unei înrolări cu voucher. Nu există
-- evidență a CINE a folosit un cod, deci nu se poate impune „max N per client".
--
-- Adăugăm:
--   1. vouchere.limita_per_client — câte răscumpărări permite codul / client (null = nelimitat)
--   2. voucher_redemptions — jurnal (un rând per răscumpărare reușită)
--   3. validate_voucher_code() — RPC reutilizabil (staff + portal) care verifică tot
--      (date, contor global, limită/client, restricții curs/tip/client-binding).
--
-- ⚠️ Înscrierea efectivă în voucher_redemptions (la plata online din portal) se face
-- în pasul următor, în netopia-webhook (idempotent). Aici doar fundația + contractul
-- de validare. Pentru parinte, validarea e scopată la membrii familiei.

-- ============================================================
-- 1. Limită per client
-- ============================================================
alter table vouchere add column if not exists limita_per_client integer;
alter table vouchere
  add constraint vouchere_limita_per_client_pozitiv
    check (limita_per_client is null or limita_per_client >= 1);

-- ============================================================
-- 2. Jurnal de răscumpărări
-- ============================================================
create table if not exists voucher_redemptions (
  id          uuid primary key default gen_random_uuid(),
  voucher     uuid not null references vouchere(id) on delete cascade,
  client      uuid not null references clienti(id) on delete cascade,
  enrollment  uuid references enrollments(id) on delete set null,
  incasare    uuid references incasari(id) on delete set null,
  created     timestamptz not null default now()
);
create index if not exists voucher_redemptions_voucher_idx on voucher_redemptions (voucher);
create index if not exists voucher_redemptions_client_idx on voucher_redemptions (voucher, client);

alter table voucher_redemptions enable row level security;
drop policy if exists voucher_redemptions_select_all on voucher_redemptions;
create policy voucher_redemptions_select_all on voucher_redemptions
  for select to authenticated using (true);
drop policy if exists voucher_redemptions_write_all on voucher_redemptions;
create policy voucher_redemptions_write_all on voucher_redemptions
  for all to authenticated using (true) with check (true);
-- Gard parinte (tabel nou, ulterior loop-ului din 20260619120000): fără acces direct.
drop policy if exists deny_parinte_direct on voucher_redemptions;
create policy deny_parinte_direct on voucher_redemptions as restrictive for all to authenticated
  using (auth_role() <> 'parinte') with check (auth_role() <> 'parinte');

-- ============================================================
-- 3. RPC validare cod (staff + portal)
--    Întoarce un singur rând cu verdictul + datele necesare pentru afișarea
--    reducerii în UI (tip + valoare). NU modifică nimic (read-only).
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
  today date := current_date;
  used_by_client integer;
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

  if v.data_inceperii is not null and v.data_inceperii > today then
    return query select false, 'Voucherul nu e încă valabil.', v.id, v.cod_voucher, v.tip, v.valoare; return;
  end if;
  if v.data_expirarii is not null and v.data_expirarii < today then
    return query select false, 'Voucherul a expirat.', v.id, v.cod_voucher, v.tip, v.valoare; return;
  end if;
  if v.numar_utilizari is not null and v.numar_utilizari <= 0 then
    return query select false, 'Voucherul nu mai are utilizări disponibile.', v.id, v.cod_voucher, v.tip, v.valoare; return;
  end if;
  if v.client is not null and v.client <> p_client then
    return query select false, 'Voucherul e emis pentru alt client.', v.id, v.cod_voucher, v.tip, v.valoare; return;
  end if;
  if v.curs is not null and p_curs is not null and v.curs <> p_curs then
    return query select false, 'Voucherul nu se aplică pe acest curs.', v.id, v.cod_voucher, v.tip, v.valoare; return;
  end if;
  if v.tip_enrollment is not null and p_tip is not null and v.tip_enrollment <> p_tip then
    return query select false, 'Voucherul nu se aplică pe acest tip de plată.', v.id, v.cod_voucher, v.tip, v.valoare; return;
  end if;

  if v.limita_per_client is not null then
    select count(*) into used_by_client
      from voucher_redemptions r where r.voucher = v.id and r.client = p_client;
    if used_by_client >= v.limita_per_client then
      return query select false, 'Ai atins limita de utilizări pentru acest cod.', v.id, v.cod_voucher, v.tip, v.valoare; return;
    end if;
  end if;

  return query select true, null::text, v.id, v.cod_voucher, v.tip, v.valoare;
end;
$$;

grant execute on function validate_voucher_code(text, uuid, uuid, tip_plata) to authenticated;
