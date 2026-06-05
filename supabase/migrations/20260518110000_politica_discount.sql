-- Politică automată family + cross-sell (Etapa 4 vouchere)
--
-- Regula:
--   Pool = clientul + toți membrii familiei (clienti.familia).
--   Pe fiecare lună viitoare neîncasată, enrollments Per luna din pool primesc:
--     • cel mai scump (după suma_baza desc) → preț integral (politica_discount = 0)
--     • restul → -10% pe suma_baza
--   Dacă ORICARE enrollment din pool pe luna respectivă are voucher manual
--   (tip_plata = Per luna sau Per an), politica e dezactivată pe tot poolul
--   pe acea lună. Voucherele Per sedinta (BE10M / TRUPA50) NU afectează politica.

-- ============================================================
-- 1. Coloane noi: suma_baza + politica_discount
-- ============================================================
alter table enrollments
  add column if not exists suma_baza numeric,
  add column if not exists politica_discount numeric not null default 0;

-- Backfill: suma_baza = suma curent (presupunem că politica n-a rulat încă)
update enrollments
  set suma_baza = suma
  where suma_baza is null and suma is not null;

alter table enrollments
  add constraint enrollments_politica_discount_nonneg
    check (politica_discount >= 0);

-- ============================================================
-- 2. RPC: recalculate_pool_discount
-- ============================================================
create or replace function recalculate_pool_discount(p_client uuid)
returns void
language plpgsql
as $$
declare
  v_familia uuid;
  v_pool uuid[];
  v_month date;
  v_start_month date := date_trunc('month', current_date)::date;
begin
  -- Determină poolul (client + frați din aceeași familie)
  select familia into v_familia from clienti where id = p_client;
  if v_familia is not null then
    select array_agg(id) into v_pool from clienti where familia = v_familia;
  else
    v_pool := array[p_client];
  end if;

  if v_pool is null or array_length(v_pool, 1) = 0 then
    return;
  end if;

  -- Iterează prin lunile distincte din viitor în care există enrollments Per luna
  for v_month in
    select distinct date_trunc('month', e.data_incepere)::date as m
    from enrollments e
    where e.client = any(v_pool)
      and e.tip_plata = 'Per luna'
      and e.activ and not e.reziliat
      and e.data_incepere >= v_start_month
    order by m
  loop
    -- Verifică dacă există voucher manual în pool pe luna asta (Per luna sau Per an).
    -- Per an acoperă luna dacă data_incepere ≤ ultima zi a lunii ≤ data_final.
    if exists (
      select 1 from enrollments e
      where e.client = any(v_pool)
        and e.activ and not e.reziliat
        and e.voucher is not null
        and (
          (e.tip_plata = 'Per luna'
            and date_trunc('month', e.data_incepere)::date = v_month)
          or
          (e.tip_plata = 'Per an'
            and e.data_incepere <= (v_month + interval '1 month' - interval '1 day')::date
            and (e.data_final is null or e.data_final >= v_month))
        )
    ) then
      -- Politica OFF pentru luna asta. Resetează enrollments fără voucher manual.
      update enrollments
        set politica_discount = 0,
            suma = suma_baza
        where client = any(v_pool)
          and tip_plata = 'Per luna'
          and activ and not reziliat
          and voucher is null
          and date_trunc('month', data_incepere)::date = v_month
          and not exists (
            select 1 from incasari i
            where i.inregistrare = enrollments.id and i.suma is not null and i.suma > 0
          );
      continue;
    end if;

    -- Politica ON. Aplic regula: cel mai scump = integral, restul = -10%.
    with eligible as (
      select e.id,
        coalesce(e.suma_baza, 0) as baza,
        row_number() over (
          order by coalesce(e.suma_baza, 0) desc, e.created asc
        ) as rk
      from enrollments e
      where e.client = any(v_pool)
        and e.tip_plata = 'Per luna'
        and e.activ and not e.reziliat
        and e.voucher is null
        and date_trunc('month', e.data_incepere)::date = v_month
        and not exists (
          select 1 from incasari i
          where i.inregistrare = e.id and i.suma is not null and i.suma > 0
        )
    )
    update enrollments e
      set politica_discount = case when el.rk = 1 then 0
                                   else round(el.baza * 0.10) end,
          suma = case when el.rk = 1 then el.baza
                      else el.baza - round(el.baza * 0.10) end
      from eligible el
      where e.id = el.id;
  end loop;
end;
$$;

-- ============================================================
-- 3. Trigger: recalc automat la modificări structurale pe enrollments
-- ============================================================
create or replace function trg_enrollments_recalc_pool()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.client is not null then
      perform recalculate_pool_discount(old.client);
    end if;
    return old;
  end if;

  if new.client is not null then
    perform recalculate_pool_discount(new.client);
  end if;

  if tg_op = 'UPDATE'
     and old.client is not null
     and old.client is distinct from new.client then
    perform recalculate_pool_discount(old.client);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enrollments_recalc on enrollments;

-- Important: NU includem 'suma' și 'politica_discount' în lista coloanelor
-- monitorizate — astfel UPDATE-urile din recalculate_pool_discount NU
-- re-declanșează triggerul (evităm bucle).
create trigger trg_enrollments_recalc
  after insert or delete
     or update of voucher, reziliat, activ, suma_baza, client, data_incepere, tip_plata
  on enrollments
  for each row
  execute function trg_enrollments_recalc_pool();
