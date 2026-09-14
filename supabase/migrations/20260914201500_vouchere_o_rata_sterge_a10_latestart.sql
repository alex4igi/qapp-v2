-- Vouchere: o singură rată + A10/LATESTART șterse (decizii Alex 2026-09-14).
--
-- 1. Un voucher manual pe abonamentul lunar (P50, P100, RE10/20/50) e o reducere pe O rată,
--    nu pe tot sezonul — pentru tot sezonul se aplică automat reducerile de campanie
--    (preț de reînscriere, family/cross-sell). Istoricul v1 o confirmă: P50/P100/RE50 stau
--    pe ~1 rată per serie, aproape mereu prima lună. `createInrolari` scrie însă toate cele
--    10 rate într-un singur insert și punea voucherul pe fiecare → gard pe instrucțiune.
--    O a doua aplicare, separată, pe altă lună rămâne posibilă.
--
-- 2. A10 (plata integrală merge pe −5% din contract) și LATESTART (prorata e automată)
--    se șterg de tot. FK-urile sunt `on delete set null`: cele 12 înrolări vechi cu
--    LATESTART (2025-2026) își păstrează sumele, pierd doar eticheta.

-- ============================================================
-- 1. O singură rată lunară per aplicare
-- ============================================================
create or replace function trg_enrollments_voucher_o_rata()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_cod text;
begin
  if tg_op = 'INSERT' then
    select v.cod_voucher into v_cod
    from new_rows n
    join vouchere v on v.id = n.voucher
    where n.tip_plata = 'Per luna'
    group by v.cod_voucher, n.client, n.cursul
    having count(*) > 1
    limit 1;
  else
    select v.cod_voucher into v_cod
    from new_rows n
    join old_rows o on o.id = n.id
    join vouchere v on v.id = n.voucher
    where n.tip_plata = 'Per luna'
      and n.voucher is distinct from o.voucher
    group by v.cod_voucher, n.client, n.cursul
    having count(*) > 1
    limit 1;
  end if;

  if v_cod is not null then
    raise exception 'Voucherul % se aplică pe o singură rată lunară, nu pe toate.', v_cod;
  end if;
  return null;
end;
$$;

revoke execute on function trg_enrollments_voucher_o_rata() from anon, public, authenticated;

drop trigger if exists trg_enrollments_voucher_o_rata_ins on enrollments;
create trigger trg_enrollments_voucher_o_rata_ins
  after insert on enrollments
  referencing new table as new_rows
  for each statement execute function trg_enrollments_voucher_o_rata();

drop trigger if exists trg_enrollments_voucher_o_rata_upd on enrollments;
create trigger trg_enrollments_voucher_o_rata_upd
  after update on enrollments
  referencing old table as old_rows new table as new_rows
  for each statement execute function trg_enrollments_voucher_o_rata();

-- ============================================================
-- 2. A10 și LATESTART — șterse
-- ============================================================
delete from vouchere where upper(cod_voucher) in ('A10', 'LATESTART');
