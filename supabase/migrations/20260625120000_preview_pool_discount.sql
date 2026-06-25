-- Preview read-only al discountului de politică (cross-sell/family) pentru o
-- înrolare PROSPECTIVĂ, înainte de insert. Oglindește motorul real
-- `recalculate_pool_discount` (vezi 20260518130000): politica −10% se aplică
-- EXCLUSIV pe `Per luna`; cel mai scump abonament eligibil din pool rămâne la
-- preț integral, restul primesc −10% pe suma_baza proprie.
-- `stable`, fără writes → safe de apelat la fiecare schimbare în formular.

create or replace function preview_pool_discount(
  p_client uuid,
  p_tip_plata tip_plata,
  p_suma_baza numeric
)
returns table (politica_discount numeric, suma_finala numeric)
language plpgsql
stable
as $$
declare
  v_familia uuid;
  v_pool uuid[];
  v_max numeric;
  v_start date := date_trunc('month', current_date)::date;
begin
  -- Per an / facultativ: politica −10% nu se aplică niciodată.
  if p_tip_plata is distinct from 'Per luna' then
    return query select 0::numeric, coalesce(p_suma_baza, 0);
    return;
  end if;

  select familia into v_familia from clienti where id = p_client;
  if v_familia is not null then
    select array_agg(id) into v_pool from clienti where familia = v_familia;
  else
    v_pool := array[p_client];
  end if;
  if v_pool is null then
    v_pool := array[p_client];
  end if;

  -- Cel mai scump abonament Per luna ELIGIBIL existent din pool
  -- (fără voucher manual, neîncasat, lună viitoare).
  select max(coalesce(e.suma_baza, 0)) into v_max
  from enrollments e
  where e.client = any(v_pool)
    and e.tip_plata = 'Per luna'
    and e.activ and not e.reziliat
    and e.voucher is null
    and e.data_incepere >= v_start
    and not exists (
      select 1 from incasari i
      where i.inregistrare = e.id and i.suma is not null and i.suma > 0
    );

  -- Noua înrolare devine „cea mai scumpă" (preț integral) dacă întrece maximul
  -- existent sau dacă nu există alt abonament eligibil în pool.
  if v_max is null or coalesce(p_suma_baza, 0) > v_max then
    return query select 0::numeric, coalesce(p_suma_baza, 0);
  else
    return query select
      round(coalesce(p_suma_baza, 0) * 0.10),
      coalesce(p_suma_baza, 0) - round(coalesce(p_suma_baza, 0) * 0.10);
  end if;
end;
$$;
