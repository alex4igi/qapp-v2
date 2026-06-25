-- Qapp v2 — Dashboard analitic owner+admin (/analytics).
--
-- 13 RPC-uri de agregare server-side pentru pagina nouă de „numere" (retenție,
-- churn, funnel, risc timpuriu, economia grupelor, calitatea veniturilor,
-- oameni/instructori, specific școală de dans). Server-side obligatoriu —
-- PostgREST plafonează la 1000 rânduri și ar trunchia sumele.
--
-- Convenții: language sql stable security invoker; guard is_admin() pe câmpurile
-- financiare sensibile (LTV/aging/marjă/ARPU). Bază „înrolare validă" = activ +
-- nereziliat, acoperă luna (data_incepere <= end AND (data_final null OR >= start)).
-- Restanțe: rest = suma − Σîncasări(inregistrare=e.id), prescris = data_incepere
-- mai veche de 2 ani (paritate cu get_restante_totale).

-- ============================================================
-- 1. get_retentie_cohorte — matrice retenție pe cohorte de start
--    Cohortă = luna primei înrolări valide (recurent+trupă). Pentru fiecare offset
--    0..11, câți din cohortă mai au o înrolare care acoperă luna cohort+offset.
-- ============================================================
create or replace function get_retentie_cohorte(p_sezon uuid default null)
returns table (
  cohorta_luna     text,
  luni_de_la_start int,
  total_initial    int,
  ramasi           int,
  procent          numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with prima as (
    select e.client,
           date_trunc('month', min(e.data_incepere))::date as cohort_m
    from enrollments e
    join cursuri c on c.id = e.cursul
    where e.client is not null
      and e.reziliat = false
      and e.data_incepere is not null
      and coalesce(c.facultativ, false) = false
      and (p_sezon is null or e.sezon_id = p_sezon)
    group by e.client
  ),
  cohorte as (
    select * from prima
    where p_sezon is not null
       or cohort_m >= (date_trunc('month', current_date) - interval '11 months')::date
  ),
  tot as (
    select cohort_m, count(*)::int as total_initial
    from cohorte group by cohort_m
  ),
  -- (client, lună acoperită) — set-based, evită subcereri corelate
  client_cover as (
    select distinct e.client, gs::date as m
    from enrollments e
    join cursuri c on c.id = e.cursul
    cross join lateral generate_series(
      date_trunc('month', e.data_incepere),
      date_trunc('month', coalesce(e.data_final, current_date)),
      interval '1 month'
    ) gs
    where e.client is not null
      and e.reziliat = false
      and e.data_incepere is not null
      and coalesce(c.facultativ, false) = false
  ),
  expanded as (
    select c.client, c.cohort_m, o.k,
           (c.cohort_m + make_interval(months => o.k))::date as off_start
    from cohorte c
    cross join generate_series(0, 11) o(k)
    where (c.cohort_m + make_interval(months => o.k))::date <= date_trunc('month', current_date)::date
  ),
  ret as (
    select x.cohort_m, x.k, count(distinct cc.client)::int as ramasi
    from expanded x
    left join client_cover cc on cc.client = x.client and cc.m = x.off_start
    group by x.cohort_m, x.k
  )
  select
    to_char(r.cohort_m, 'YYYY-MM') as cohorta_luna,
    r.k as luni_de_la_start,
    t.total_initial,
    r.ramasi,
    case when t.total_initial > 0 then round(100.0 * r.ramasi / t.total_initial, 0) else 0 end as procent
  from ret r
  join tot t on t.cohort_m = r.cohort_m
  where is_admin()
  order by r.cohort_m, r.k;
$$;

grant execute on function get_retentie_cohorte(uuid) to authenticated;

-- ============================================================
-- 2. get_durata_medie_ltv — durată medie de înscriere (luni) + LTV mediu (RON)
-- ============================================================
create or replace function get_durata_medie_ltv(p_locatie uuid default null)
returns table (
  durata_medie_luni numeric,
  ltv_mediu         numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with spans as (
    select e.client,
           min(date_trunc('month', e.data_incepere)) as m0,
           max(date_trunc('month', coalesce(e.data_final, current_date))) as m1
    from enrollments e
    join cursuri c on c.id = e.cursul
    where e.client is not null
      and e.reziliat = false
      and e.data_incepere is not null
      and coalesce(c.facultativ, false) = false
      and (p_locatie is null or c.locatie = p_locatie)
    group by e.client
  ),
  durata as (
    select client,
           (extract(year from age(m1, m0)) * 12 + extract(month from age(m1, m0)) + 1)::numeric as luni
    from spans
  ),
  ltv as (
    select i.client, sum(i.suma) as total
    from incasari i
    where i.client is not null
    group by i.client
  )
  select
    round(avg(d.luni), 1) as durata_medie_luni,
    case when is_admin() then round(avg(coalesce(l.total, 0)), 0) else null end as ltv_mediu
  from durata d
  left join ltv l on l.client = d.client;
$$;

grant execute on function get_durata_medie_ltv(uuid) to authenticated;

-- ============================================================
-- 3. get_leads_pe_luna — volum leads + convertiți pe lună (pe leads.created)
-- ============================================================
create or replace function get_leads_pe_luna(
  p_from    date,
  p_to      date,
  p_locatie text default null
)
returns table (
  luna       text,
  leads      int,
  convertiti int
)
language sql
stable
security invoker
set search_path = public
as $$
  with months as (
    select to_char(gs, 'YYYY-MM') as luna
    from generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month') gs
  ),
  agg as (
    select to_char(date_trunc('month', l.created), 'YYYY-MM') as luna,
           count(*)::int as leads,
           count(*) filter (where l.status = 'convertit')::int as convertiti
    from leads l
    where l.created >= date_trunc('month', p_from)
      and l.created < date_trunc('month', p_to) + interval '1 month'
      and (p_locatie is null or l.locatia = p_locatie)
    group by 1
  )
  select m.luna, coalesce(a.leads, 0), coalesce(a.convertiti, 0)
  from months m
  left join agg a on a.luna = m.luna
  order by m.luna;
$$;

grant execute on function get_leads_pe_luna(date, date, text) to authenticated;

-- ============================================================
-- 4. get_absente_consecutive — cursanți cu seria finală de ≥ prag absențe
--    consecutive (flag de intervenție). Doar înrolări active, cursuri recurente.
--    'Motivat' rupe seria (absență scuzată).
-- ============================================================
create or replace function get_absente_consecutive(
  p_locatie uuid default null,
  p_prag    int  default 2
)
returns table (
  client_id           uuid,
  client_nume         text,
  curs_id             uuid,
  curs_nume           text,
  absente_consecutive int,
  ultima_prezenta     date
)
language sql
stable
security invoker
set search_path = public
as $$
  with prez as (
    select p.client, e.cursul as curs_id, p.data, p.status,
           row_number() over (partition by p.client, e.cursul order by p.data desc) as rn
    from prezente p
    join enrollments e on e.id = p.enrollment
      and e.activ = true and e.reziliat = false
    join cursuri c on c.id = e.cursul
    where p.data is not null
      and coalesce(c.facultativ, false) = false
      and (p_locatie is null or c.locatie = p_locatie)
  ),
  first_present as (
    select client, curs_id, min(rn) as rn_present
    from prez
    where status <> 'Absent'
    group by client, curs_id
  ),
  streak as (
    select p.client, p.curs_id,
           count(*) filter (
             where p.status = 'Absent'
               and (fp.rn_present is null or p.rn < fp.rn_present)
           )::int as absente,
           max(p.data) filter (where p.status <> 'Absent') as ultima_prez
    from prez p
    left join first_present fp on fp.client = p.client and fp.curs_id = p.curs_id
    group by p.client, p.curs_id
  )
  select s.client,
         trim(format('%s %s', coalesce(cl.prenume, ''), cl.nume)) as client_nume,
         s.curs_id, cu.numele as curs_nume,
         s.absente, s.ultima_prez
  from streak s
  join clienti cl on cl.id = s.client
  join cursuri cu on cu.id = s.curs_id
  where s.absente >= greatest(coalesce(p_prag, 2), 1)
  order by s.absente desc, client_nume
  limit 200;
$$;

grant execute on function get_absente_consecutive(uuid, int) to authenticated;

-- ============================================================
-- 5. get_restante_aging — restanțe nete (neprescrise) pe vechime
--    Buckets pe vârsta înrolării (data_incepere): 0-30 / 31-60 / 61-90 / 90+.
-- ============================================================
create or replace function get_restante_aging(p_locatie uuid default null)
returns table (
  bucket text,
  total  numeric,
  nr     int
)
language sql
stable
security invoker
set search_path = public
as $$
  with per_enroll as (
    select
      coalesce(e.suma, 0)
        - coalesce((select sum(i.suma) from incasari i where i.inregistrare = e.id), 0) as rest,
      (current_date - e.data_incepere) as varsta_zile,
      (e.data_incepere < (current_date - interval '2 years')) as prescris
    from enrollments e
    left join cursuri c on c.id = e.cursul
    left join sali s on s.id = c.sala
    where e.reziliat = false
      and e.data_incepere is not null
      and (p_locatie is null or s.locatie = p_locatie)
  ),
  flagged as (
    select rest,
      case
        when varsta_zile <= 30 then '0-30'
        when varsta_zile <= 60 then '31-60'
        when varsta_zile <= 90 then '61-90'
        else '90+'
      end as bucket
    from per_enroll
    where rest > 0 and not prescris
  )
  select b.bucket,
         coalesce(sum(f.rest), 0) as total,
         count(f.rest)::int as nr
  from (values ('0-30'), ('31-60'), ('61-90'), ('90+')) b(bucket)
  left join flagged f on f.bucket = b.bucket
  where is_admin()
  group by b.bucket
  order by array_position(array['0-30','31-60','61-90','90+'], b.bucket);
$$;

grant execute on function get_restante_aging(uuid) to authenticated;

-- ============================================================
-- 6. get_ocupare_prime_time — ocupare pe slot orar (prime-time 17-20 vs restul)
--    Cursuri recurente; ora din cursuri.ora (cast sigur prin regex).
-- ============================================================
create or replace function get_ocupare_prime_time(p_locatie uuid default null)
returns table (
  slot       text,
  grupe      int,
  activi     int,
  capacitate int,
  procent    numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with luna as (
    select date_trunc('month', current_date)::date as s,
           (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date as e
  ),
  cs as (
    select c.id, c.capacitate_maxima,
      case
        when c.ora is null or c.ora !~ '^[0-9]{1,2}:[0-9]{2}' then 'Fără oră'
        when (c.ora)::time >= time '17:00' and (c.ora)::time < time '20:00' then 'Prime-time 17-20'
        when (c.ora)::time < time '17:00' then 'Zi (<17)'
        else 'Seară (>=20)'
      end as slot
    from cursuri c
    where coalesce(c.suspendat, false) = false
      and coalesce(c.facultativ, false) = false
      and (p_locatie is null or c.locatie = p_locatie)
  ),
  act as (
    select cs.id, count(distinct e.client)::int as n
    from cs
    join enrollments e on e.cursul = cs.id
      and e.activ = true and e.reziliat = false
      and e.data_incepere <= (select e from luna)
      and (e.data_final is null or e.data_final >= (select s from luna))
    group by cs.id
  )
  select cs.slot,
         count(*)::int as grupe,
         coalesce(sum(a.n), 0)::int as activi,
         coalesce(sum(cs.capacitate_maxima), 0)::int as capacitate,
         case when sum(cs.capacitate_maxima) > 0
              then round(100.0 * coalesce(sum(a.n), 0) / sum(cs.capacitate_maxima), 0)
              else null end as procent
  from cs
  left join act a on a.id = cs.id
  group by cs.slot
  order by case cs.slot
             when 'Prime-time 17-20' then 0
             when 'Zi (<17)' then 1
             when 'Seară (>=20)' then 2
             else 3 end;
$$;

grant execute on function get_ocupare_prime_time(uuid) to authenticated;

-- ============================================================
-- 7. get_rentabilitate_grupa — marjă per grupă (recurentă)
--    Încasări atribuite cursului (incasari_curs_luna) − cotă din salariul
--    instructorului titular (salariu / nr. cursuri ale titularului). Aproximare
--    onestă: salariul nu e ținut pe curs. Cele mai slabe marje primele.
-- ============================================================
create or replace function get_rentabilitate_grupa(p_luni int default 12)
returns table (
  curs_id          uuid,
  curs_nume        text,
  locatie_nume     text,
  incasari         numeric,
  salariu_atribuit numeric,
  marja            numeric,
  activi           int
)
language sql
stable
security invoker
set search_path = public
as $$
  with months as (
    select to_char(gs, 'YYYY-MM') as luna,
           extract(year from gs)::int as anul,
           extract(month from gs)::int as luna_num
    from generate_series(
      date_trunc('month', current_date) - make_interval(months => greatest(coalesce(p_luni, 12), 1) - 1),
      date_trunc('month', current_date),
      interval '1 month'
    ) gs
  ),
  inc as (
    select v.id_curs as cid, sum(v.total) as s
    from incasari_curs_luna v
    join months m on v.luna = m.luna
    where v.id_curs is not null
    group by v.id_curs
  ),
  teacher_courses as (
    select c.teacher as tid, count(*)::numeric as nc
    from cursuri c
    where c.teacher is not null and coalesce(c.suspendat, false) = false
    group by c.teacher
  ),
  sal_teacher as (
    select st.teacher as tid, sum(st.total) as s
    from salarii_teacher st
    join months m on st.anul = m.anul and st.luna = m.luna_num
    group by st.teacher
  ),
  sal_curs as (
    select c.id as cid, coalesce(stt.s, 0) / nullif(tc.nc, 0) as sal
    from cursuri c
    left join teacher_courses tc on tc.tid = c.teacher
    left join sal_teacher stt on stt.tid = c.teacher
  ),
  luna_now as (
    select date_trunc('month', current_date)::date as s,
           (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date as e
  ),
  act as (
    select e.cursul as cid, count(distinct e.client)::int as n
    from enrollments e
    where e.activ = true and e.reziliat = false
      and e.data_incepere <= (select e from luna_now)
      and (e.data_final is null or e.data_final >= (select s from luna_now))
    group by e.cursul
  )
  select c.id, c.numele, loc.nume,
         coalesce(inc.s, 0) as incasari,
         coalesce(sc.sal, 0) as salariu_atribuit,
         coalesce(inc.s, 0) - coalesce(sc.sal, 0) as marja,
         coalesce(a.n, 0) as activi
  from cursuri c
  left join inc on inc.cid = c.id
  left join sal_curs sc on sc.cid = c.id
  left join act a on a.cid = c.id
  left join locatii loc on loc.id = c.locatie
  where is_admin()
    and coalesce(c.suspendat, false) = false
    and coalesce(c.facultativ, false) = false
    and (coalesce(inc.s, 0) <> 0 or coalesce(a.n, 0) > 0)
  order by coalesce(inc.s, 0) - coalesce(sc.sal, 0) asc;
$$;

grant execute on function get_rentabilitate_grupa(int) to authenticated;

-- ============================================================
-- 8. get_arpu_trend — venit / clienți activi pe lună (ARPU)
-- ============================================================
create or replace function get_arpu_trend(
  p_from    date,
  p_to      date,
  p_locatie uuid default null
)
returns table (
  luna           text,
  venit          numeric,
  clienti_activi int,
  arpu           numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with months as (
    select to_char(gs, 'YYYY-MM') as luna,
           gs::date as m_start,
           (gs + interval '1 month' - interval '1 day')::date as m_end
    from generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month') gs
  ),
  venit as (
    select to_char(date_trunc('month', i.data), 'YYYY-MM') as luna, sum(i.suma) as s
    from incasari i
    where i.data >= date_trunc('month', p_from)
      and i.data < date_trunc('month', p_to) + interval '1 month'
      and (p_locatie is null or i.locatie = p_locatie)
    group by 1
  ),
  activi as (
    select m.luna, count(distinct e.client)::int as n
    from months m
    join enrollments e on e.activ = true and e.reziliat = false
      and e.data_incepere <= m.m_end
      and (e.data_final is null or e.data_final >= m.m_start)
    join cursuri c on c.id = e.cursul
    where (p_locatie is null or c.locatie = p_locatie)
    group by m.luna
  )
  select m.luna,
         coalesce(v.s, 0) as venit,
         coalesce(a.n, 0) as clienti_activi,
         case when coalesce(a.n, 0) > 0 then round(coalesce(v.s, 0) / a.n, 0) else null end as arpu
  from months m
  left join venit v on v.luna = m.luna
  left join activi a on a.luna = m.luna
  order by m.luna;
$$;

grant execute on function get_arpu_trend(date, date, uuid) to authenticated;

-- ============================================================
-- 9. get_mix_recurent_oneoff — % venituri recurente vs one-off
--    Recurent = încasare legată de înrolare Per luna/Per an; restul = one-off
--    (Per sedinta + bilete/merch/taxă/workshop neasociate unei recurente).
-- ============================================================
create or replace function get_mix_recurent_oneoff(p_from date, p_to date)
returns table (
  tip   text,
  total numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with clasificat as (
    select i.suma,
      case when e.tip_plata in ('Per luna', 'Per an') then 'Recurent' else 'One-off' end as tip
    from incasari i
    left join enrollments e on e.id = i.inregistrare
    where i.data between p_from and p_to
  )
  select tip, sum(suma) as total
  from clasificat
  group by tip
  having sum(suma) > 0
  order by total desc;
$$;

grant execute on function get_mix_recurent_oneoff(date, date) to authenticated;

-- ============================================================
-- 10. get_instructori_clienti_trend — INIMA feature-ului „1 click instructor"
--     Per instructor: nr clienți activi distincți pe lună (ultimele p_luni),
--     curent, precedent, delta, retenție lună-vs-lună, serie (sparkline).
--     Teacher↔curs = titular (cursuri.teacher) ∪ M:N (cursuri_teacheri),
--     pt. a nu pierde cursurile clonate fără rând M:N.
-- ============================================================
create or replace function get_instructori_clienti_trend(p_luni int default 6)
returns table (
  teacher_id       uuid,
  teacher_nume     text,
  clienti_curent   int,
  clienti_prev     int,
  delta            int,
  retentie_procent numeric,
  serie            int[]
)
language sql
stable
security invoker
set search_path = public
as $$
  with months as (
    select gs::date as m_start,
           (gs + interval '1 month' - interval '1 day')::date as m_end,
           row_number() over (order by gs)::int as idx
    from generate_series(
      date_trunc('month', current_date) - make_interval(months => greatest(coalesce(p_luni, 6), 1) - 1),
      date_trunc('month', current_date),
      interval '1 month'
    ) gs
  ),
  maxidx as (select max(idx) as mx from months),
  tc as (
    select c.id as curs_id, c.teacher as tid from cursuri c where c.teacher is not null
    union
    select ct.curs_id, ct.teacher_id from cursuri_teacheri ct
  ),
  tcm as (
    select distinct tc.tid, m.idx, e.client
    from tc
    join enrollments e on e.cursul = tc.curs_id
      and e.activ = true and e.reziliat = false
    join months m on e.data_incepere <= m.m_end
      and (e.data_final is null or e.data_final >= m.m_start)
    where e.client is not null
  ),
  per as (
    select tid, idx, count(distinct client)::int as n
    from tcm group by tid, idx
  ),
  agg as (
    select t.id as tid,
      coalesce((select n from per p where p.tid = t.id and p.idx = (select mx from maxidx)), 0) as cur,
      coalesce((select n from per p where p.tid = t.id and p.idx = (select mx from maxidx) - 1), 0) as prev,
      (select count(distinct a.client)::int
         from tcm a
         where a.tid = t.id and a.idx = (select mx from maxidx) - 1
           and exists (select 1 from tcm b
                       where b.tid = a.tid and b.idx = (select mx from maxidx) and b.client = a.client)
      ) as retinuti,
      (select count(distinct a.client)::int from tcm a
         where a.tid = t.id and a.idx = (select mx from maxidx) - 1) as baza_prev,
      (select array_agg(coalesce((select n from per p where p.tid = t.id and p.idx = m.idx), 0) order by m.idx)
         from months m) as serie
    from teacheri t
    where coalesce(t.arhivat, false) = false
  )
  select agg.tid,
         trim(format('%s %s', coalesce(tt.prenume, ''), tt.nume)) as teacher_nume,
         agg.cur, agg.prev, (agg.cur - agg.prev) as delta,
         case when agg.baza_prev > 0 then round(100.0 * agg.retinuti / agg.baza_prev, 0) else null end as retentie_procent,
         agg.serie
  from agg
  join teacheri tt on tt.id = agg.tid
  where agg.cur > 0 or agg.prev > 0 or (select bool_or(x > 0) from unnest(agg.serie) x)
  order by agg.cur desc, (agg.cur - agg.prev) desc;
$$;

grant execute on function get_instructori_clienti_trend(int) to authenticated;

-- ============================================================
-- 11. get_yoy_aceeasi_luna — comparație an-la-an pe ACEEAȘI lună (1..12)
--     p_metrica = 'venit' (incasari) sau 'activi' (headcount cu înrolare activă).
-- ============================================================
create or replace function get_yoy_aceeasi_luna(
  p_metrica text default 'venit',
  p_locatie uuid default null
)
returns table (
  luna_num     int,
  an_curent    numeric,
  an_precedent numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with yrs as (
    select extract(year from current_date)::int as y_cur,
           extract(year from current_date)::int - 1 as y_prev
  ),
  venit as (
    select extract(month from i.data)::int as mn,
           extract(year from i.data)::int as yr,
           sum(i.suma) as v
    from incasari i, yrs
    where p_metrica = 'venit'
      and i.data is not null
      and extract(year from i.data)::int in (yrs.y_cur, yrs.y_prev)
      and (p_locatie is null or i.locatie = p_locatie)
    group by 1, 2
  ),
  grid as (
    select gs::date as m_start,
           (gs + interval '1 month' - interval '1 day')::date as m_end,
           extract(month from gs)::int as mn,
           extract(year from gs)::int as yr
    from yrs, generate_series(make_date(yrs.y_prev, 1, 1), make_date(yrs.y_cur, 12, 1), interval '1 month') gs
  ),
  activi as (
    select g.mn, g.yr, count(distinct e.client)::int as v
    from grid g
    join enrollments e on e.activ = true and e.reziliat = false
      and e.data_incepere <= g.m_end
      and (e.data_final is null or e.data_final >= g.m_start)
    join cursuri c on c.id = e.cursul
    where p_metrica = 'activi'
      and (p_locatie is null or c.locatie = p_locatie)
    group by g.mn, g.yr
  ),
  unified as (
    select mn, yr, v from venit
    union all
    select mn, yr, v from activi
  )
  select gm.mn as luna_num,
         coalesce(sum(u.v) filter (where u.yr = (select y_cur from yrs)), 0) as an_curent,
         coalesce(sum(u.v) filter (where u.yr = (select y_prev from yrs)), 0) as an_precedent
  from generate_series(1, 12) gm(mn)
  left join unified u on u.mn = gm.mn
  group by gm.mn
  order by gm.mn;
$$;

grant execute on function get_yoy_aceeasi_luna(text, uuid) to authenticated;

-- ============================================================
-- 12. get_cursanti_multi_stil — % cursanți activi înscriși în 2+ stiluri
-- ============================================================
create or replace function get_cursanti_multi_stil()
returns table (
  total_activi int,
  multi_stil   int,
  procent      numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with per_client as (
    select e.client, count(distinct c.stil) as stiluri
    from enrollments e
    join cursuri c on c.id = e.cursul
    where e.activ = true and e.reziliat = false and e.client is not null
      and c.stil is not null and c.stil <> ''
    group by e.client
  )
  select
    count(*)::int as total_activi,
    count(*) filter (where stiluri >= 2)::int as multi_stil,
    case when count(*) > 0 then round(100.0 * count(*) filter (where stiluri >= 2) / count(*), 0) else 0 end as procent
  from per_client;
$$;

grant execute on function get_cursanti_multi_stil() to authenticated;

-- ============================================================
-- 13. get_familii_frati — familii cu ≥2 membri activi (frați)
-- ============================================================
create or replace function get_familii_frati()
returns table (
  total_familii          int,
  familii_cu_frati       int,
  copii_in_familii_frati int
)
language sql
stable
security invoker
set search_path = public
as $$
  with activi_pe_familie as (
    select cl.familia, count(distinct cl.id) as membri
    from clienti cl
    where cl.familia is not null
      and exists (
        select 1 from enrollments e
        where e.client = cl.id and e.activ = true and e.reziliat = false
      )
    group by cl.familia
  )
  select
    count(*)::int as total_familii,
    count(*) filter (where membri >= 2)::int as familii_cu_frati,
    coalesce(sum(membri) filter (where membri >= 2), 0)::int as copii_in_familii_frati
  from activi_pe_familie;
$$;

grant execute on function get_familii_frati() to authenticated;
