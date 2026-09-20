-- Penalizarea reducerii de familie: fereastră de grație + criteriul pe data plății
-- (decizie Alex, 2026-09-20).
--
-- Problema: cronul verifica doar „sunt banii în DB acum?", fără să se uite la data
-- plății. Clientul transfera la termen, extrasul ING se importa a doua zi, iar cronul
-- de la 03:30 tăia reducerea între timp — definitiv, fiindcă motorul nu reevaluează o
-- rată care are încasări. Pe 21 septembrie ar fi lovit 19 rate / 17 clienți / 392 RON,
-- oameni care plătiseră duminică 20, la termen.
--
-- Fixul are două jumătăți, care funcționează doar împreună:
--   1. GRAȚIE de 5 zile calendaristice — timpul în care apucăm să importăm extrasul.
--      Termenul clientului rămâne 15/20; se mișcă doar momentul în care verificăm noi.
--   2. Criteriul devine DATA PLĂȚII (`incasari.data <= scadență`), nu simpla prezență a
--      banilor. Fără asta, grația ar prelungi de facto scadența cu 5 zile pentru toți.
--
-- Condiția trăia copiată în trei locuri divergente (cron, motor, locul integral) — de
-- aici capcana notată în docs/reguli-preturi-reduceri.md. Acum există o singură dată,
-- în `penalizare_activa`, iar cele trei o cheamă.

-- ============================================================
-- 1. Regula, într-un singur loc
-- ============================================================
create or replace function penalizare_activa(p_enrollment uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(
    -- Regula se aplică sezoanelor care încep din 2026-09-01 încolo.
    sz.data_incepere >= date '2026-09-01'
    and e.data_incepere is not null
    -- Grația de 5 zile: fereastra noastră de procesare a extrasului bancar.
    and scadenta_rata(e.data_incepere, e.sezon_id) + 5 < current_date
    -- O rată creată DUPĂ propriul termen (înscriere târzie în lună) n-a avut ce rata.
    and e.created::date <= scadenta_rata(e.data_incepere, e.sezon_id)
    -- Contează banii veniți PÂNĂ la scadență, nu cei înregistrați până azi.
    and coalesce((
          select sum(i.suma) from incasari i
          where i.inregistrare = e.id
            and i.data <= scadenta_rata(e.data_incepere, e.sezon_id)
        ), 0) < coalesce(e.suma, 0),
    false)
  from enrollments e
  left join sezoane sz on sz.id = e.sezon_id
  where e.id = p_enrollment;
$$;

-- ============================================================
-- 2. Cronul — aceleași pre-filtre ieftine înainte de apelul de funcție
-- ============================================================
create or replace function cancel_discount_familie_restant()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  with restante as (
    select e.id
    from enrollments e
    where e.tip_plata = 'Per luna'
      and e.activ and not e.reziliat
      and e.politica_discount > 0
      and e.data_incepere is not null
      and penalizare_activa(e.id)
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

-- ============================================================
-- 3. Locul „integral" al lunii — avea deja filtrul pe i.data, câștigă grația
-- ============================================================
create or replace function ocupa_locul_integral(p_enrollment uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(e.politica_discount, 0) = 0
    and exists (
      select 1 from incasari i
      where i.inregistrare = e.id and i.suma is not null and i.suma > 0
    )
    -- O rată plătită DUPĂ termen are reducerea 0 din penalizare, nu pentru că era
    -- abonamentul integral — aia nu ocupă locul.
    and not penalizare_activa(e.id)
  from enrollments e
  where e.id = p_enrollment;
$$;

-- ============================================================
-- 4. Motorul — aceeași condiție, ca o modificare în familie să nu re-acorde
--    reducerea pe o lună deja penalizată de cron
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
  v_loc_ocupat boolean;
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

    -- Locul „integral" al lunii e deja ocupat de o rată plătită întreg?
    select exists (
      select 1 from enrollments e
      where e.client = any(v_pool)
        and e.tip_plata = 'Per luna'
        and e.activ and not e.reziliat
        and e.voucher is null
        and date_trunc('month', e.data_incepere)::date = v_month
        and ocupa_locul_integral(e.id)
    ) into v_loc_ocupat;

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
        end as rata_normala
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
        e.rata_normala,
        coalesce(e.rata_normala, e.baza) as pret_lista,
        -- Termenul (+ grația) a trecut ⇒ luna și-a pierdut reducerea de familie.
        -- Rândurile de aici au zero încasări, deci „scadent" ⇒ „neachitat".
        penalizare_activa(e.id) as scadenta_depasita,
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
          when p.rk = 1 and not v_loc_ocupat then 0 -- cel mai scump → integral
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

-- ============================================================
-- 5. Granturi — re-declarate explicit (create or replace le păstrează, dar auditul
--    din 2026-09-20 tocmai a închis găurile de aici; nu le lăsăm pe seama moștenirii)
-- ============================================================
revoke execute on function penalizare_activa(uuid) from anon, public;
grant  execute on function penalizare_activa(uuid) to authenticated;

-- Cheamă doar cronul (service_role) — rămâne închisă pentru portal/agenție.
revoke execute on function cancel_discount_familie_restant() from authenticated, anon, public;
grant  execute on function cancel_discount_familie_restant() to service_role;

revoke execute on function ocupa_locul_integral(uuid) from anon, public;
grant  execute on function ocupa_locul_integral(uuid) to authenticated;
revoke execute on function recalculate_pool_discount(uuid) from anon, public;
grant  execute on function recalculate_pool_discount(uuid) to authenticated;

-- ============================================================
-- 6. Cronul, la loc (oprit manual pe 2026-09-20 ca să nu taie înainte de fix)
-- ============================================================
select cron.schedule(
  'discount-familie-anulare-restante',
  '30 0 * * *',
  $$select cancel_discount_familie_restant();$$
);
