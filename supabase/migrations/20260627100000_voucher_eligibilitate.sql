-- Vouchere — ELIGIBILITATE pe condiție (generalizat), nu doar TRUPA50.
--
-- Context: azi validate_voucher_code() verifică cod/date/contor/limită-per-client +
-- legare pe client/curs/tip, dar NU verifică dacă persoana are dreptul la cod.
-- Codurile gen „TRUPA50" (doar membrii trupelor) merg pentru oricine.
--
-- Soluție reutilizabilă: o coloană `cerinta_eligibilitate` pe vouchere (null = oricine).
-- Azi suportă valoarea 'trupa'; viitor: extinzi check-ul (ex. 'familie_noua') + o ramură
-- în validate_voucher_code. Apartenența la trupă NU e un tabel — se deduce dintr-o
-- înrolare activă într-un curs cu nivelul = 'Trupa'.

-- ============================================================
-- 1. Coloana de eligibilitate (extensibilă prin check)
-- ============================================================
alter table vouchere add column if not exists cerinta_eligibilitate text;
alter table vouchere drop constraint if exists vouchere_cerinta_eligibilitate_valid;
alter table vouchere
  add constraint vouchere_cerinta_eligibilitate_valid
    check (cerinta_eligibilitate is null or cerinta_eligibilitate in ('trupa'));

comment on column vouchere.cerinta_eligibilitate is
  'Condiție de eligibilitate (null = oricine). Azi: ''trupa'' = doar membri ai unei trupe.';

-- ============================================================
-- 2. Helper: clientul e membru al unei trupe?
--    = are o înrolare activă, neziliată, într-un curs cu nivelul = 'Trupa'.
-- ============================================================
create or replace function client_in_trupa(p_client uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from enrollments e
    join cursuri c on c.id = e.cursul
    where e.client = p_client
      and e.activ = true
      and e.reziliat = false
      and c.nivelul = 'Trupa'
  );
$$;

grant execute on function client_in_trupa(uuid) to authenticated;

-- ============================================================
-- 3. validate_voucher_code() — adaugă verificarea de eligibilitate.
--    Identic cu 20260619140000, plus ramura `cerinta_eligibilitate`.
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

  -- NOU: eligibilitate pe condiție.
  if v.cerinta_eligibilitate = 'trupa' and not client_in_trupa(p_client) then
    return query select false, 'Doar membrii trupelor pot folosi acest voucher.', v.id, v.cod_voucher, v.tip, v.valoare; return;
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

-- ============================================================
-- 4. Marchează TRUPA50 ca necesitând apartenență la trupă.
-- ============================================================
update vouchere set cerinta_eligibilitate = 'trupa'
  where upper(cod_voucher) = 'TRUPA50';
