-- „Cel mai scump abonament din pool" se judecă după PREȚUL DE LISTĂ, nu după
-- prețul promo. Înainte, un rând pe promo (170, listă 180) pierdea în fața
-- fratelui fără promo de pe același curs (180): fratele devenea „cel mai scump"
-- → integral, iar copilul pe promo primea −10% calculat din 180 (162). Familia
-- plătea 180 + 162 = 342 în loc de 170 + 162 = 332. Promo-ul e o reducere, nu
-- prețul abonamentului.
--
-- La egalitate de preț de listă, rândul pe promo ocupă locul „integral" — își
-- păstrează promo-ul, iar −10% merge la frate. E varianta cea mai avantajoasă
-- pentru client și tot o singură reducere pe rând (reguli neacumulabile).
--
-- preview_pool_discount oglindește aceeași ordine și exclude din pool doar
-- dublura ACELUIAȘI client pe cursul țintă. Înainte excludea orice rând din
-- familie de pe cursul țintă, deci un frate pe același curs nu era văzut și
-- formularul arăta „fără reducere", deși motorul (care partiționează pe
-- (client, cursul)) îl trata ca family legitim.

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
      select e.id, e.client, e.cursul, e.created,
        coalesce(e.suma_baza, 0) as baza,
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
        e.rata_normala,
        coalesce(e.rata_normala, e.baza) as pret_lista,
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
        -- La egalitate de preț de listă câștigă baza mai mică (rândul pe
        -- promo): rămâne integral, deci își păstrează promo-ul.
        row_number() over (order by pret_lista desc, baza asc, created asc) as rk
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
  v_max_lista numeric;
  v_min_baza_la_max numeric;
  v_rata_normala numeric;
  v_baza numeric := coalesce(p_suma_baza, 0);
  v_lista numeric;
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
  v_lista := coalesce(v_rata_normala, v_baza);

  -- Cel mai mare preț de listă dintre abonamentele Per luna ELIGIBILE existente
  -- din pool (+ cea mai mică bază la acel preț, pentru departajare). Se exclude
  -- doar dublura aceluiași client pe cursul țintă.
  with existente as (
    select coalesce(e.suma_baza, 0) as baza,
      coalesce(
        case
          when e.este_reinscriere
           and c.pret_lunar_promo is not null
           and c.pret_lunar_promo > 0
           and c.pret_anual is not null
           and c.pret_anual > 0
           and coalesce(e.suma_baza, 0) = c.pret_lunar_promo
          then round(c.pret_anual / 10.0)
        end,
        coalesce(e.suma_baza, 0)
      ) as lista
    from enrollments e
    left join cursuri c on c.id = e.cursul
    where e.client = any(v_pool)
      and e.tip_plata = 'Per luna'
      and e.activ and not e.reziliat
      and e.voucher is null
      and e.data_incepere >= v_start
      and (p_curs is null or e.client <> p_client or e.cursul is distinct from p_curs)
      and not exists (
        select 1 from incasari i
        where i.inregistrare = e.id and i.suma is not null and i.suma > 0
      )
  )
  select x.lista, x.min_baza into v_max_lista, v_min_baza_la_max
  from (select lista, min(baza) as min_baza from existente group by lista) x
  order by x.lista desc
  limit 1;

  -- Rândul nou rămâne integral dacă e „cel mai scump" în ordinea din motor
  -- (pool_rank): preț de listă mai mare, sau egal dar pe o bază mai mică.
  if v_max_lista is null
     or v_lista > v_max_lista
     or (v_lista = v_max_lista and v_baza < v_min_baza_la_max) then
    return query select 0::numeric, v_baza;
    return;
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
