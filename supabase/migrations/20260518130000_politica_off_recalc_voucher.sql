-- Fix: când politica e OFF (există voucher manual în pool pe luna X),
-- branch-ul curent reseta `suma = suma_baza` doar pentru enrollments fără
-- voucher. Enrollments CU voucher rămâneau cu valoarea veche (din ultima
-- rulare a politicii), ceea ce devenea greșit dacă userul tocmai adăuga
-- un voucher pe un enrollment care fusese sub politică.
--
-- Soluție: în branch-ul OFF, reset politica_discount = 0 pentru TOATE
-- enrollments din pool pe luna respectivă (Per luna), și recalculează
-- `suma` în funcție de voucher (Procent / Valoare / nimic).

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
  select familia into v_familia from clienti where id = p_client;
  if v_familia is not null then
    select array_agg(id) into v_pool from clienti where familia = v_familia;
  else
    v_pool := array[p_client];
  end if;

  if v_pool is null or array_length(v_pool, 1) = 0 then
    return;
  end if;

  for v_month in
    select distinct date_trunc('month', e.data_incepere)::date as m
    from enrollments e
    where e.client = any(v_pool)
      and e.tip_plata = 'Per luna'
      and e.activ and not e.reziliat
      and e.data_incepere >= v_start_month
    order by m
  loop
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
      -- Politica OFF. Reset politica_discount pe TOȚI și recalculează suma
      -- în funcție de voucher (Procent / Valoare / fără).
      update enrollments e
        set politica_discount = 0,
            suma = case
              when e.voucher is null then e.suma_baza
              else (
                select case
                  when v.tip = 'Procent'
                    then greatest(0, round(e.suma_baza * (1 - v.valoare / 100.0)))
                  when v.tip = 'Valoare'
                    then greatest(0, e.suma_baza - v.valoare)
                  else e.suma_baza
                end
                from vouchere v where v.id = e.voucher
              )
            end
        where e.client = any(v_pool)
          and e.tip_plata = 'Per luna'
          and e.activ and not e.reziliat
          and date_trunc('month', e.data_incepere)::date = v_month
          and not exists (
            select 1 from incasari i
            where i.inregistrare = e.id and i.suma is not null and i.suma > 0
          );
      continue;
    end if;

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
