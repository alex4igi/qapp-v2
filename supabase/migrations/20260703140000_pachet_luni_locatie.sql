-- Qapp v2 — /analytics: „Elevi activi" (cifra de titlu, Secțiunea 0) respectă
-- selectorul de Locație din header, la fel ca restul paginii (vezi
-- 20260702180000_analytics_canonic_activ_part2_si_locatie.sql).
--
-- clienti_activi_la primește acum p_locatie (join cursuri prin
-- inrolari_active_la; LEFT JOIN ca să nu piardă clienți cu enrollments.cursul
-- null când p_locatie e null — comportamentul global rămâne neschimbat).
-- get_pachet_luni primește p_locatie și îl propagă la snapshot-ul „snap"
-- (folosit de #1 Creștere netă și #9 Elevi activi). Restul cifrelor pachetului
-- (leads, conversie, risc, prezență, churn, umplere, restanțe) rămân globale
-- deocamdată — nu au fost cerute scoped.

drop function if exists clienti_activi_la(date);

create or replace function clienti_activi_la(p_data date default current_date, p_locatie uuid default null)
returns table (client uuid)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct ia.client
  from inrolari_active_la(p_data) ia
  left join cursuri c on c.id = ia.cursul
  where p_locatie is null or c.locatie = p_locatie;
$$;

grant execute on function clienti_activi_la(date, uuid) to authenticated;

drop function if exists get_pachet_luni();

create or replace function get_pachet_luni(p_locatie uuid default null)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with dates as (
    select (date_trunc('week', current_date))::date - 7 as s_start
  ),
  d2 as (
    select s_start, s_start + 6 as s_end from dates
  ),
  -- ── snapshot-uri client-level (definiția canonică, scoped pe p_locatie) ────
  snap_dates as (
    select k, dt from d2, lateral (values
      ('azi',      current_date),
      ('azi_7',    current_date - 7),
      ('azi_364',  current_date - 364),
      ('dum_0',    s_end),
      ('dum_1',    s_end - 7),
      ('dum_2',    s_end - 14),
      ('dum_52',   s_end - 364),
      ('dum_53',   s_end - 371)
    ) v(k, dt)
  ),
  snap as (
    select sd.k, ca.client
    from snap_dates sd
    cross join lateral clienti_activi_la(sd.dt, p_locatie) ca
  ),
  snap_n as (
    select k, count(*)::int as n from snap group by k
  ),
  flux as (
    select p.k,
      (select count(*) from snap a where a.k = p.cur
         and not exists (select 1 from snap b where b.k = p.prev and b.client = a.client))::int as intrati,
      (select count(*) from snap a where a.k = p.prev
         and not exists (select 1 from snap b where b.k = p.cur and b.client = a.client))::int as iesiti
    from (values ('curent', 'dum_0', 'dum_1'), ('prev', 'dum_1', 'dum_2'), ('yoy', 'dum_52', 'dum_53')) p(k, cur, prev)
  ),
  -- ── #2 leads noi (global — leads nu au dimensiune de curs) ─────────────────
  leads_w as (
    select w.k, count(l.id)::int as n
    from d2, lateral (values
      ('curent', s_start, s_end),
      ('prev',   s_start - 7, s_end - 7),
      ('yoy',    s_start - 364, s_end - 364)
    ) w(k, f, t)
    left join leads l on l.created::date between w.f and w.t and l.status <> 'nurture'
    group by w.k
  ),
  -- ── #4 înscrieri noi (prima plată de abonament din istoric) ─────────────────
  prima_plata as (
    select i.client, min(i.data) as d0
    from incasari i
    where i.categorie = 'Abonament' and i.client is not null
    group by i.client
  ),
  inscrieri_w as (
    select w.k, count(pp.client)::int as n
    from d2, lateral (values
      ('curent', s_start, s_end),
      ('prev',   s_start - 7, s_end - 7),
      ('yoy',    s_start - 364, s_end - 364)
    ) w(k, f, t)
    left join prima_plata pp on pp.d0 between w.f and w.t
    group by w.k
  ),
  -- ── #5 conversie 30 zile ────────────────────────────────────────────────────
  conv as (
    select w.k,
      (select count(*)::int from leads l
        where l.status <> 'nurture'
          and l.created::date > w.f and l.created::date <= w.t) as leads,
      (select count(*)::int from leads l
        where l.status <> 'nurture'
          and l.data_conversie::date > w.f and l.data_conversie::date <= w.t) as convertiti
    from (values
      ('curent', current_date - 30, current_date),
      ('prev',   current_date - 37, current_date - 7),
      ('yoy',    current_date - 394, current_date - 364)
    ) w(k, f, t)
  ),
  -- ── #6 elevi în risc (stare curentă) ────────────────────────────────────────
  risc as (
    select count(distinct client_id)::int as n from get_absente_consecutive(null, 2)
  ),
  -- ── #7 rată prezență săptămânală ────────────────────────────────────────────
  sesiuni_w as (
    select w.k, e.cursul as curs_id, p.data,
           count(distinct p.client)::int as prezenti
    from d2, lateral (values
      ('curent', s_start, s_end),
      ('prev',   s_start - 7, s_end - 7),
      ('yoy',    s_start - 364, s_end - 364)
    ) w(k, f, t)
    join prezente p on p.status = 'Prezent' and p.data between w.f and w.t
    join enrollments e on e.id = p.enrollment
    join cursuri c on c.id = e.cursul
    where coalesce(c.facultativ, false) = false
      and coalesce(c.suspendat, false) = false
    group by w.k, e.cursul, p.data
  ),
  prez_w as (
    select s.k,
           sum(s.prezenti)::int as prezenti,
           sum((select count(distinct e2.client)
                  from enrollments e2
                 where e2.cursul = s.curs_id
                   and e2.data_incepere <= s.data
                   and (e2.data_final is null or e2.data_final >= s.data)))::int as posibile
    from sesiuni_w s
    group by s.k
  ),
  -- ── #8 churn lunar ──────────────────────────────────────────────────────────
  churn_m as (
    select gs::date as m_start
    from generate_series(
      date_trunc('month', current_date) - interval '3 months',
      date_trunc('month', current_date),
      interval '1 month'
    ) gs
    where current_date >= gs::date + 14 + 30
    order by gs desc
    limit 1
  ),
  churn_months as (
    select 'curent' as k, m_start from churn_m
    union all select 'prev', (m_start - interval '1 month')::date from churn_m
    union all select 'yoy',  (m_start - interval '12 months')::date from churn_m
  ),
  churn_calc as (
    select cm.k, cm.m_start,
      count(*)::int as baza,
      count(*) filter (where
        not exists (
          select 1 from incasari i
          where i.client = b.client and i.categorie = 'Abonament'
            and i.data >= cm.m_start and i.data <= cm.m_start + 44
        )
        and not exists (
          select 1 from enrollments e
          where e.client = b.client and e.reziliat = false
            and e.data_incepere <= (cm.m_start + interval '1 month' - interval '1 day')::date
            and (e.data_final is null or e.data_final >= cm.m_start)
            and coalesce(e.suma, 0) <= coalesce(
              (select sum(i.suma) from incasari i
                where i.inregistrare = e.id and i.data <= cm.m_start + 44), 0)
        )
      )::int as pierduti
    from churn_months cm
    cross join lateral clienti_activi_la(cm.m_start) b
    group by cm.k, cm.m_start
  ),
  -- ── #10 grad de umplere (sezon activ, recurente) ────────────────────────────
  cursuri_sez as (
    select c.id, c.capacitate_maxima
    from cursuri c
    where coalesce(c.suspendat, false) = false
      and coalesce(c.facultativ, false) = false
      and c.sezon = (select id from sezoane where activ = true order by data_incepere desc limit 1)
  ),
  act_by_course as (
    select w.k, ia.cursul, count(distinct ia.client)::int as n
    from (values ('curent', current_date), ('prev', current_date - 7)) w(k, dt)
    cross join lateral inrolari_active_la(w.dt) ia
    group by w.k, ia.cursul
  ),
  umplere as (
    select w.k,
      round(100.0 * sum(coalesce(ac.n, 0)) / nullif(sum(cs.capacitate_maxima), 0), 0) as media,
      count(*) filter (where coalesce(ac.n, 0) < 7)::int as sub_prag
    from (values ('curent'), ('prev')) w(k)
    cross join cursuri_sez cs
    left join act_by_course ac on ac.k = w.k and ac.cursul = cs.id
    group by w.k
  ),
  -- ── #11 restanțe >7z peste scadență ─────────────────────────────────────────
  rest_snap as (
    select w.k,
      coalesce(sum(x.rest), 0) as suma,
      count(distinct x.fam)::int as familii
    from (values
      ('curent', current_date),
      ('prev',   current_date - 7),
      ('yoy',    current_date - 364)
    ) w(k, dt)
    cross join lateral (
      select coalesce(cl.familia, e.client) as fam,
             coalesce(e.suma, 0) - coalesce(
               (select sum(i.suma) from incasari i
                 where i.inregistrare = e.id and i.data <= w.dt), 0) as rest
      from enrollments e
      left join sezoane sz on sz.id = e.sezon_id
      left join clienti cl on cl.id = e.client
      where e.reziliat = false
        and e.data_incepere is not null
        and e.data_incepere >= (w.dt - interval '2 years')  -- neprescris la momentul X
        and (case
               when sz.scadenta_prima_rata is not null
                    and date_trunc('month', e.data_incepere) = date_trunc('month', sz.data_incepere)
                 then sz.scadenta_prima_rata
               when sz.scadenta_ultima_rata is not null
                    and date_trunc('month', e.data_incepere) = date_trunc('month', sz.data_final)
                 then sz.scadenta_ultima_rata
               else (date_trunc('month', e.data_incepere)::date + 14)
             end) + 7 < w.dt
    ) x
    where x.rest > 0
    group by w.k
  ),
  fact_luna as (
    select
      coalesce(sum(e.suma), 0) as facturat,
      coalesce(sum(
        case when (date_trunc('month', e.data_incepere)::date + 14) + 7 < current_date
          then greatest(coalesce(e.suma, 0) - coalesce(
                 (select sum(i.suma) from incasari i where i.inregistrare = e.id), 0), 0)
          else 0 end
      ), 0) as restant
    from enrollments e
    where e.reziliat = false
      and date_trunc('month', e.data_incepere) = date_trunc('month', current_date)
  )
  select jsonb_build_object(
    'saptamana', (select jsonb_build_object('start', s_start, 'end', s_end) from d2),
    'activi', jsonb_build_object(
      'curent', (select n from snap_n where k = 'azi'),
      'prev',   (select n from snap_n where k = 'azi_7'),
      'yoy',    nullif((select coalesce(n, 0) from snap_n where k = 'azi_364'), 0)
    ),
    'crestere_neta', (
      select jsonb_build_object(
        'curent',  (select intrati - iesiti from flux where k = 'curent'),
        'prev',    (select intrati - iesiti from flux where k = 'prev'),
        'yoy',     (select case when exists (select 1 from snap where k = 'dum_52')
                           then (select intrati - iesiti from flux where k = 'yoy') end),
        'intrati', (select intrati from flux where k = 'curent'),
        'iesiti',  (select iesiti from flux where k = 'curent')
      )
    ),
    'leads_noi', jsonb_build_object(
      'curent', (select n from leads_w where k = 'curent'),
      'prev',   (select n from leads_w where k = 'prev'),
      'yoy',    (select n from leads_w where k = 'yoy')
    ),
    'inscrieri_noi', jsonb_build_object(
      'curent', (select n from inscrieri_w where k = 'curent'),
      'prev',   (select n from inscrieri_w where k = 'prev'),
      'yoy',    (select n from inscrieri_w where k = 'yoy')
    ),
    'conversie_30z', jsonb_build_object(
      'curent', (select case when leads > 0 then round(100.0 * convertiti / leads, 1) end from conv where k = 'curent'),
      'prev',   (select case when leads > 0 then round(100.0 * convertiti / leads, 1) end from conv where k = 'prev'),
      'yoy',    (select case when leads > 0 then round(100.0 * convertiti / leads, 1) end from conv where k = 'yoy'),
      'leads',      (select leads from conv where k = 'curent'),
      'convertiti', (select convertiti from conv where k = 'curent')
    ),
    'risc', jsonb_build_object(
      'elevi', (select n from risc), 'prev', null, 'yoy', null
    ),
    'prezenta', jsonb_build_object(
      'curent', (select case when posibile > 0 then round(100.0 * prezenti / posibile, 1) end from prez_w where k = 'curent'),
      'prev',   (select case when posibile > 0 then round(100.0 * prezenti / posibile, 1) end from prez_w where k = 'prev'),
      'yoy',    (select case when posibile > 0 then round(100.0 * prezenti / posibile, 1) end from prez_w where k = 'yoy'),
      'prezenti', (select prezenti from prez_w where k = 'curent'),
      'posibile', (select posibile from prez_w where k = 'curent')
    ),
    'churn', jsonb_build_object(
      'luna',     (select to_char(m_start, 'YYYY-MM') from churn_m),
      'rata',     (select case when baza > 0 then round(100.0 * pierduti / baza, 1) end from churn_calc where k = 'curent'),
      'pierduti', (select pierduti from churn_calc where k = 'curent'),
      'baza',     (select baza from churn_calc where k = 'curent'),
      'prev',     (select case when baza > 0 then round(100.0 * pierduti / baza, 1) end from churn_calc where k = 'prev'),
      'yoy',      (select case when baza > 0 then round(100.0 * pierduti / baza, 1) end from churn_calc where k = 'yoy')
    ),
    'umplere', jsonb_build_object(
      'media',    (select media from umplere where k = 'curent'),
      'prev',     (select media from umplere where k = 'prev'),
      'yoy',      null,
      'sub_prag', (select sub_prag from umplere where k = 'curent')
    ),
    'restante', jsonb_build_object(
      'suma',    coalesce((select suma from rest_snap where k = 'curent'), 0),
      'familii', coalesce((select familii from rest_snap where k = 'curent'), 0),
      'procent_facturare', (select case when facturat > 0 then round(100.0 * restant / facturat, 1) end from fact_luna),
      'prev',    coalesce((select suma from rest_snap where k = 'prev'), 0),
      'yoy',     (select suma from rest_snap where k = 'yoy')
    )
  )
  where is_admin();
$$;

grant execute on function get_pachet_luni(uuid) to authenticated;
