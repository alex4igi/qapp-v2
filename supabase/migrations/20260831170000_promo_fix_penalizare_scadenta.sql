-- Reguli de preț actualizate (decizie Alex, 2026-08-31):
--
--   1. Prețul PROMO de reînscriere, odată activat, rămâne fixat pe tot sezonul —
--      indiferent dacă rata se plătește la termen sau nu.
--   2. În schimb, dacă se depășește termenul de plată al unei rate, se anulează
--      REDUCEREA DE FAMILIE (politica cross-sell/family) pentru luna a cărei
--      scadență a fost depășită. Doar acea lună; celelalte rămân neatinse.
--
-- Penalizarea înlocuiește vechiul `cancel_expired_reinscrieri()`, care downgrada
-- promo-ul pe tot restul sezonului (suma → cursuri.pret_lunar, este_reinscriere
-- → false, promo_anulat_la → now()). Funcția aceea dispare, împreună cu cron-ul ei.
-- Coloana `promo_anulat_la` rămâne pentru urma istorică (0 rânduri azi) — nu se
-- mai scrie în ea, deci `get_reinscrieri_pierderi` va raporta de acum 0 pierduți.
--
-- INTRARE ÎN VIGOARE: penalizarea se aplică doar ratelor cu scadența ≥ 2026-08-31.
-- Fără gardul ăsta, prima rulare ar retrage retroactiv reducerea de pe 37 de rate
-- din vara 2026 (iulie/august, deja scadente) și ar umfla restanțele sezonului trecut.

-- ============================================================
-- 1. scadenta_rata — expresia canonică a termenului de plată al unei rate
--    (prima/ultima rată a sezonului au date explicite pe sezon; altfel ziua 15).
--    Aceeași regulă e inline în get_sms_recipients și get_restante_worklist;
--    aici o extragem pentru cele două consumatoare noi de mai jos.
-- ============================================================
create or replace function scadenta_rata(p_data_incepere date, p_sezon uuid)
returns date
language sql
stable
set search_path = public
as $$
  select case
    when sz.scadenta_prima_rata is not null
         and date_trunc('month', p_data_incepere) = date_trunc('month', sz.data_incepere)
      then sz.scadenta_prima_rata
    when sz.scadenta_ultima_rata is not null
         and date_trunc('month', p_data_incepere) = date_trunc('month', sz.data_final)
      then sz.scadenta_ultima_rata
    else (date_trunc('month', p_data_incepere)::date + 14)
  end
  from (select 1) _
  left join sezoane sz on sz.id = p_sezon
  where p_data_incepere is not null;
$$;

revoke execute on function scadenta_rata(date, uuid) from anon, public;
grant execute on function scadenta_rata(date, uuid) to authenticated;

-- ============================================================
-- 2. Regula 1 — promo-ul nu se mai pierde niciodată.
--    Cron-ul se oprește ÎNAINTE de drop (job-ul referă funcția).
-- ============================================================
select cron.unschedule(jobid)
  from cron.job where jobname = 'reinscrieri-anulare-expirate';

drop function if exists cancel_expired_reinscrieri();

-- ============================================================
-- 3. Regula 2 — penalizarea pe lună: rata scadentă și neachitată integral
--    pierde reducerea de familie pentru luna respectivă.
--    Penalizarea e definitivă: plata ulterioară nu readuce reducerea (o lună
--    scadentă nu mai e reevaluată nici de recalculate_pool_discount, care
--    parcurge doar lunile ≥ luna curentă).
-- ============================================================
create or replace function cancel_discount_familie_restant()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_regula_de_la constant date := date '2026-08-31';
begin
  with restante as (
    select e.id
    from enrollments e
    where e.tip_plata = 'Per luna'
      and e.activ and not e.reziliat
      and e.politica_discount > 0
      and e.data_incepere is not null
      and scadenta_rata(e.data_incepere, e.sezon_id) >= v_regula_de_la
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

select cron.schedule(
  'discount-familie-anulare-restante',
  '30 0 * * *',   -- zilnic la 00:30 UTC, în locul vechiului job de promo
  $$select cancel_discount_familie_restant();$$
);

-- ============================================================
-- 4. recalculate_pool_discount — nu re-acordă reducerea pe o lună deja scadentă.
--    Fără asta, orice modificare în familie (înrolare nouă, reziliere) ar anula
--    penalizarea aplicată de cron. Rândurile din CTE au deja zero încasări
--    (gardul `not exists incasari > 0`), deci „scadent" ⇒ „neachitat".
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
  v_regula_de_la constant date := date '2026-08-31';
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
        scadenta_rata(e.data_incepere, e.sezon_id) as scadenta
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
        (e.scadenta >= v_regula_de_la
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
          when r.scadenta_depasita then 0     -- rată scadentă neachitată → preț integral
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
