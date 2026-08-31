-- Ajustare la 20260831170000: pragul de intrare în vigoare al penalizării devine
-- SEZONUL înrolării, nu o dată calendaristică de scadență.
--
-- De ce: „scadența ≥ 2026-08-31" e ambiguu la margine (ziua adoptării regulii
-- coincide cu pragul, deci fereastra „scadent dar sub regulă" e vidă în ziua 1 și
-- nu poate fi verificată) și taie transversal prin sezoane. Pragul corect e cel
-- de business: regula se aplică de la sezonul 2026-2027 încolo. Ratele din vara
-- 2026 și din sezoanele vechi rămân definitiv neatinse, la fel ca înainte, iar
-- rândurile fără sezon (import v1) nu sunt penalizate niciodată.

create or replace function cancel_discount_familie_restant()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  -- Regula se aplică sezoanelor care încep de la această dată încolo.
  v_sezon_de_la constant date := date '2026-09-01';
begin
  with restante as (
    select e.id
    from enrollments e
    join sezoane sz on sz.id = e.sezon_id
    where e.tip_plata = 'Per luna'
      and e.activ and not e.reziliat
      and e.politica_discount > 0
      and e.data_incepere is not null
      and sz.data_incepere >= v_sezon_de_la
      and scadenta_rata(e.data_incepere, e.sezon_id) < current_date
      -- O rată creată DUPĂ propriul termen (înscriere târzie în lună) n-a avut
      -- ce să rateze — nu e penalizată.
      and e.created::date <= scadenta_rata(e.data_incepere, e.sezon_id)
      and coalesce(
            (select sum(i.suma) from incasari i where i.inregistrare = e.id), 0
          ) < coalesce(e.suma, 0)
  )
  update enrollments e
  set politica_discount = 0,
      suma = e.suma_baza,
      updated = now()
  from restante r
  where e.id = r.id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function cancel_discount_familie_restant() from anon, public;
grant execute on function cancel_discount_familie_restant() to authenticated;

create or replace function recalculate_pool_discount(p_client uuid)
returns void
language plpgsql
as $$
declare
  v_familia uuid;
  v_pool uuid[];
  v_month date;
  v_start_month date := date_trunc('month', current_date)::date;
  v_sezon_de_la constant date := date '2026-09-01';
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
    with eligibile as (
      select e.id, e.client, e.cursul, e.created, e.este_reinscriere,
        coalesce(e.suma_baza, 0) as baza,
        c.pret_lunar_promo, c.pret_anual,
        scadenta_rata(e.data_incepere, e.sezon_id) as scadenta,
        (sz.data_incepere >= v_sezon_de_la) as sezon_sub_regula
      from enrollments e
      left join cursuri c on c.id = e.cursul
      left join sezoane sz on sz.id = e.sezon_id
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
    ranked_within_course as (
      select e.id,
        e.baza,
        e.created,
        -- Rata normală (nepromo) a cursului, doar când rândul chiar stă pe
        -- prețul promo. NULL ⇒ nu e reînscriere pe promo ⇒ regula clasică.
        case
          when e.este_reinscriere
           and e.pret_lunar_promo is not null
           and e.pret_lunar_promo > 0
           and e.pret_anual is not null
           and e.pret_anual > 0
           and e.baza = e.pret_lunar_promo
          then round(e.pret_anual / 10.0)
        end as rata_normala,
        -- Termenul de plată a trecut ⇒ luna și-a pierdut reducerea de familie.
        -- Rândurile de aici au zero încasări, deci „scadent" ⇒ „neachitat".
        -- O rată creată după propriul termen n-a avut ce să rateze.
        (coalesce(e.sezon_sub_regula, false)
          and e.scadenta < current_date
          and e.created::date <= e.scadenta) as scadenta_depasita,
        row_number() over (
          partition by e.client, e.cursul
          order by e.baza desc, e.created asc
        ) as course_rk
      from eligibile e
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
          when r.scadenta_depasita then 0      -- rată scadentă neachitată → preț integral
          when r.course_rk > 1 then 0          -- dublură same-course → integral
          when p.rk = 1 then 0                 -- cel mai scump → integral
          when r.rata_normala is not null then -- promo vs −10%: cea mai bună, nu ambele
            greatest(
              0,
              r.baza - least(
                r.baza,
                r.rata_normala - round(r.rata_normala * 0.10)
              )
            )
          else round(r.baza * 0.10)            -- cross-sell/family −10%
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

revoke execute on function recalculate_pool_discount(uuid) from anon, public;
grant execute on function recalculate_pool_discount(uuid) to authenticated;
