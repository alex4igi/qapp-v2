-- Fix cross-sell fals pe ACELAȘI curs (cazul Obreja/Ciornei, tranziția la
-- sezonul de vară): o a doua înrolare `Per luna` pe același (client, curs) în
-- aceeași lună NU e cross-sell, ci o dublură — nu trebuie să primească −10%.
--
-- 1) recalculate_pool_discount: la rankarea pe lună, deduplică la o singură
--    înrolare per (client, cursul) (cea mai scumpă / cea mai veche). Restul
--    duplicatelor same-course primesc politica_discount = 0 (preț integral).
-- 2) preview_pool_discount: primește cursul țintă și îl exclude din maximul
--    existent, ca preview-ul pe același curs să nu mai afișeze −10%.

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
      -- Politica OFF (voucher manual în pool pe luna asta). Reset pe TOȚI.
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

    -- Politica ON. Deduplică per (client, cursul): o singură înrolare
    -- reprezentativă intră în ranking; duplicatele same-course → preț integral.
    with ranked_within_course as (
      select e.id,
        coalesce(e.suma_baza, 0) as baza,
        e.created,
        row_number() over (
          partition by e.client, e.cursul
          order by coalesce(e.suma_baza, 0) desc, e.created asc
        ) as course_rk
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
    ),
    pool_rank as (
      select id,
        row_number() over (order by baza desc, created asc) as rk
      from ranked_within_course
      where course_rk = 1
    ),
    final as (
      select r.id, r.baza,
        case
          when r.course_rk > 1 then 0          -- dublură same-course → integral
          when p.rk = 1 then 0                  -- cel mai scump → integral
          else round(r.baza * 0.10)             -- cross-sell −10%
        end as disc
      from ranked_within_course r
      left join pool_rank p on p.id = r.id
    )
    update enrollments e
      set politica_discount = f.disc,
          suma = f.baza - f.disc
      from final f
      where e.id = f.id;
  end loop;
end;
$$;

-- preview_pool_discount capătă un parametru nou (cursul țintă) → drop + recreate
-- (schimbarea semnăturii ar crea un overload, nu un replace).
drop function if exists preview_pool_discount(uuid, tip_plata, numeric);

create or replace function preview_pool_discount(
  p_client uuid,
  p_tip_plata tip_plata,
  p_suma_baza numeric,
  p_curs uuid default null
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

  -- Cel mai scump abonament Per luna ELIGIBIL existent din pool, EXCLUZÂND
  -- cursul țintă (o a doua înrolare pe același curs = dublură, nu cross-sell).
  select max(coalesce(e.suma_baza, 0)) into v_max
  from enrollments e
  where e.client = any(v_pool)
    and e.tip_plata = 'Per luna'
    and e.activ and not e.reziliat
    and e.voucher is null
    and e.data_incepere >= v_start
    and (p_curs is null or e.cursul is distinct from p_curs)
    and not exists (
      select 1 from incasari i
      where i.inregistrare = e.id and i.suma is not null and i.suma > 0
    );

  if v_max is null or coalesce(p_suma_baza, 0) > v_max then
    return query select 0::numeric, coalesce(p_suma_baza, 0);
  else
    return query select
      round(coalesce(p_suma_baza, 0) * 0.10),
      coalesce(p_suma_baza, 0) - round(coalesce(p_suma_baza, 0) * 0.10);
  end if;
end;
$$;
