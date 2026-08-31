-- Reducerile nu se cumulează: preț PROMO de reînscriere vs politica −10%
-- (cross-sell/family) → se aplică UNA SINGURĂ, cea mai avantajoasă pentru client.
--
-- Cazul care a scos problema la iveală (Burada Amalia + Natalia, același curs,
-- aceeași familie): ambele bifate „preț de reînscriere" → `suma_baza` = 260
-- (pret_lunar_promo, față de 270 = pret_anual/10). Politica family rula peste
-- baza deja redusă și dădea sorei a doua încă −26 → 234, adică promo + frați
-- cumulate. Politica din CLAUDE.md e explicită: „Reduceri neacumulabile".
--
-- Regula nouă, pe rândurile de reînscriere care NU sunt „cea mai scumpă" din pool:
--   suma_finala = least(pret_promo, rata_normala − 10%)
--   politica_discount = suma_baza − suma_finala   (0 dacă promo e deja mai bun)
-- Invariantul `suma = suma_baza − politica_discount` rămâne valid; `suma_baza`
-- rămâne prețul promo, iar `politica_discount` devine surplusul peste promo.
-- Pentru Burada Natalia: least(260, 270−27) = 243 → politica_discount = 17.
--
-- Un rând de reînscriere e „pe preț promo" doar dacă `suma_baza` chiar egalează
-- `cursuri.pret_lunar_promo` — prima lună prorata (înscriere târzie) are o bază
-- calculată din ședințe, deci rămâne pe regula normală de −10%.

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
        -- Rata normală (nepromo) a cursului, doar când rândul chiar stă pe
        -- prețul promo. NULL ⇒ nu e reînscriere pe promo ⇒ regula clasică.
        case
          when e.este_reinscriere
           and c.pret_lunar_promo is not null
           and c.pret_lunar_promo > 0
           and c.pret_anual is not null
           and c.pret_anual > 0
           and coalesce(e.suma_baza, 0) = c.pret_lunar_promo
          then round(c.pret_anual / 10.0)
        end as rata_normala,
        row_number() over (
          partition by e.client, e.cursul
          order by coalesce(e.suma_baza, 0) desc, e.created asc
        ) as course_rk
      from enrollments e
      left join cursuri c on c.id = e.cursul
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
          when r.rata_normala is not null then  -- promo vs −10%: cea mai bună, nu ambele
            greatest(
              0,
              r.baza - least(
                r.baza,
                r.rata_normala - round(r.rata_normala * 0.10)
              )
            )
          else round(r.baza * 0.10)             -- cross-sell/family −10%
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

-- preview_pool_discount primește flagul de reînscriere ca să oglindească exact
-- motorul de mai sus (altfel formularul ar promite −10% peste promo).
drop function if exists preview_pool_discount(uuid, tip_plata, numeric, uuid);

create or replace function preview_pool_discount(
  p_client uuid,
  p_tip_plata tip_plata,
  p_suma_baza numeric,
  p_curs uuid default null,
  p_este_reinscriere boolean default false
)
returns table (politica_discount numeric, suma_finala numeric)
language plpgsql
stable
as $$
declare
  v_familia uuid;
  v_pool uuid[];
  v_max numeric;
  v_rata_normala numeric;
  v_baza numeric := coalesce(p_suma_baza, 0);
  v_final numeric;
  v_start date := date_trunc('month', current_date)::date;
begin
  if p_tip_plata is distinct from 'Per luna' then
    return query select 0::numeric, v_baza;
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

  if v_max is null or v_baza > v_max then
    return query select 0::numeric, v_baza;
    return;
  end if;

  if p_este_reinscriere and p_curs is not null then
    select round(c.pret_anual / 10.0) into v_rata_normala
    from cursuri c
    where c.id = p_curs
      and c.pret_lunar_promo is not null
      and c.pret_lunar_promo > 0
      and c.pret_anual is not null
      and c.pret_anual > 0
      and v_baza = c.pret_lunar_promo;
  end if;

  if v_rata_normala is not null then
    v_final := least(v_baza, v_rata_normala - round(v_rata_normala * 0.10));
    return query select greatest(0, v_baza - v_final), v_final;
  else
    return query select
      round(v_baza * 0.10),
      v_baza - round(v_baza * 0.10);
  end if;
end;
$$;

revoke execute on function preview_pool_discount(uuid, tip_plata, numeric, uuid, boolean) from anon, public;
revoke execute on function recalculate_pool_discount(uuid) from anon, public;
grant execute on function preview_pool_discount(uuid, tip_plata, numeric, uuid, boolean) to authenticated;
grant execute on function recalculate_pool_discount(uuid) to authenticated;
