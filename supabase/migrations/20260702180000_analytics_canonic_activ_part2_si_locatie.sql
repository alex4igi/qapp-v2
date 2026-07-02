-- Qapp v2 — /analytics: (A) aliniere la definiția canonică „activ" pentru cele 6
-- funcții amânate în 20260702120100 + (B) filtru de locație acolo unde selectorul
-- din header era ignorat silențios.
--
-- Context (decizii user 2026-07-02):
--  * O SINGURĂ definiție de „activ" pe toată pagina = cea canonică
--    (inrolari_active_la / inrolari_active_luna din 20260702120000). Restul
--    funcțiilor de headcount încă gateau pe flagul nesigur enrollments.activ →
--    raportau alt număr decât cifra de titlu „Elevi activi".
--  * Selectorul de Locație trebuie respectat SAU numărul e etichetat „tot clubul"
--    în UI. Aici adăugăm p_locatie unde se poate filtra corect.
--  * Restanțe = „total datorat" (nemodificat). Cheltuieli NU au coloană locatie →
--    Profitul rămâne global (UI îl etichetează „tot clubul").

-- ============================================================
-- A. Aliniere la definiția canonică „activ" (semnături neschimbate)
-- ============================================================

-- A1. get_ocupare_prime_time — roster recurent pe definiția canonică (ziua curentă),
--     nu pe e.activ=true + acoperire lună.
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
  with cs as (
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
    select ia.cursul as cid, count(distinct ia.client)::int as n
    from inrolari_active_la(current_date) ia
    join cs on cs.id = ia.cursul
    group by ia.cursul
  )
  select cs.slot,
         count(*)::int as grupe,
         coalesce(sum(a.n), 0)::int as activi,
         coalesce(sum(cs.capacitate_maxima), 0)::int as capacitate,
         case when sum(cs.capacitate_maxima) > 0
              then round(100.0 * coalesce(sum(a.n), 0) / sum(cs.capacitate_maxima), 0)
              else null end as procent
  from cs
  left join act a on a.cid = cs.id
  group by cs.slot
  order by case cs.slot
             when 'Prime-time 17-20' then 0
             when 'Zi (<17)' then 1
             when 'Seară (>=20)' then 2
             else 3 end;
$$;

grant execute on function get_ocupare_prime_time(uuid) to authenticated;

-- A2. get_yoy_aceeasi_luna — ramura 'activi' pe varianta lunară canonică.
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
           extract(month from gs)::int as mn,
           extract(year from gs)::int as yr
    from yrs, generate_series(make_date(yrs.y_prev, 1, 1), make_date(yrs.y_cur, 12, 1), interval '1 month') gs
  ),
  activi as (
    select g.mn, g.yr, count(distinct ia.client)::int as v
    from grid g
    cross join lateral inrolari_active_luna(g.m_start) ia
    join cursuri c on c.id = ia.cursul
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

-- A3. get_instructori_clienti_trend — headcount lunar/instructor pe varianta canonică.
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
    select distinct tc.tid, m.idx, ia.client
    from months m
    cross join lateral inrolari_active_luna(m.m_start) ia
    join tc on tc.curs_id = ia.cursul
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

-- A4. get_cursanti_multi_stil — baza „activi" pe definiția canonică.
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
    select ia.client, count(distinct c.stil) as stiluri
    from inrolari_active_la(current_date) ia
    join cursuri c on c.id = ia.cursul
    where c.stil is not null and c.stil <> ''
    group by ia.client
  )
  select
    count(*)::int as total_activi,
    count(*) filter (where stiluri >= 2)::int as multi_stil,
    case when count(*) > 0 then round(100.0 * count(*) filter (where stiluri >= 2) / count(*), 0) else 0 end as procent
  from per_client;
$$;

grant execute on function get_cursanti_multi_stil() to authenticated;

-- A5. get_familii_frati — apartenența „activ" pe definiția canonică.
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
      and cl.id in (select client from clienti_activi_la(current_date))
    group by cl.familia
  )
  select
    count(*)::int as total_familii,
    count(*) filter (where membri >= 2)::int as familii_cu_frati,
    coalesce(sum(membri) filter (where membri >= 2), 0)::int as copii_in_familii_frati
  from activi_pe_familie;
$$;

grant execute on function get_familii_frati() to authenticated;

-- ============================================================
-- B. Filtru de locație (semnături extinse → drop + recreate ca să nu rămână overload)
-- ============================================================

-- B/A6. get_rentabilitate_grupa — coloana „activi" pe definiția canonică + filtru locație.
drop function if exists get_rentabilitate_grupa(int);
create or replace function get_rentabilitate_grupa(
  p_luni    int  default 12,
  p_locatie uuid default null
)
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
  act as (
    select ia.cursul as cid, count(distinct ia.client)::int as n
    from inrolari_active_la(current_date) ia
    group by ia.cursul
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
    and (p_locatie is null or c.locatie = p_locatie)
    and (coalesce(inc.s, 0) <> 0 or coalesce(a.n, 0) > 0)
  order by coalesce(inc.s, 0) - coalesce(sc.sal, 0) asc;
$$;

grant execute on function get_rentabilitate_grupa(int, uuid) to authenticated;

-- B1. get_kpis_financiar — încasări + restanțe filtrabile pe locație.
--     Cheltuieli NU au coloană locatie → rămân GLOBALE (UI etichetează Profitul).
drop function if exists get_kpis_financiar(date, date);
create or replace function get_kpis_financiar(
  p_from    date,
  p_to      date,
  p_locatie uuid default null
)
returns table (
  incasari   numeric,
  cheltuieli numeric,
  restante   numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce((
      select sum(i.suma) from incasari i
      where i.data between p_from and p_to
        and (p_locatie is null or i.locatie = p_locatie)
    ), 0) as incasari,
    coalesce((
      select sum(ch.valoare) from cheltuieli ch
      where ch.data between p_from and p_to
      -- cheltuieli fără dimensiune de locație → global (Profit = „tot clubul")
    ), 0) as cheltuieli,
    coalesce((
      select sum(pi.rest) from plati_inrolari pi
      where pi.rest > 0
        and pi.prescris = false
        and pi.data_incepere between p_from and p_to
        and (p_locatie is null or pi.id_locatie = p_locatie)
    ), 0) as restante;
$$;

grant execute on function get_kpis_financiar(date, date, uuid) to authenticated;

-- B2. get_mix_metode — pe data plății, filtrabil pe locație.
drop function if exists get_mix_metode(date, date);
create or replace function get_mix_metode(
  p_from    date,
  p_to      date,
  p_locatie uuid default null
)
returns table (
  metoda text,
  total  numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(i.metoda::text, 'Necunoscut') as metoda, sum(i.suma) as total
  from incasari i
  where i.data between p_from and p_to
    and (p_locatie is null or i.locatie = p_locatie)
  group by coalesce(i.metoda::text, 'Necunoscut')
  having sum(i.suma) > 0
  order by total desc;
$$;

grant execute on function get_mix_metode(date, date, uuid) to authenticated;

-- B3. get_mix_categorii_incasari — filtrabil pe locație.
drop function if exists get_mix_categorii_incasari(date, date);
create or replace function get_mix_categorii_incasari(
  p_from    date,
  p_to      date,
  p_locatie uuid default null
)
returns table (
  categorie text,
  total     numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(i.categorie::text, 'Necunoscut') as categorie, sum(i.suma) as total
  from incasari i
  where i.data between p_from and p_to
    and (p_locatie is null or i.locatie = p_locatie)
  group by coalesce(i.categorie::text, 'Necunoscut')
  having sum(i.suma) > 0
  order by total desc;
$$;

grant execute on function get_mix_categorii_incasari(date, date, uuid) to authenticated;

-- B4. get_mix_recurent_oneoff — filtrabil pe locație.
drop function if exists get_mix_recurent_oneoff(date, date);
create or replace function get_mix_recurent_oneoff(
  p_from    date,
  p_to      date,
  p_locatie uuid default null
)
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
      and (p_locatie is null or i.locatie = p_locatie)
  )
  select tip, sum(suma) as total
  from clasificat
  group by tip
  having sum(suma) > 0
  order by total desc;
$$;

grant execute on function get_mix_recurent_oneoff(date, date, uuid) to authenticated;

-- B5. get_conversie_leads — filtrabil pe locație (leads.locatia = TEXT label).
drop function if exists get_conversie_leads(integer);
create or replace function get_conversie_leads(
  p_luni    integer default 6,
  p_locatie text default null
)
returns table (
  total_leads  integer,
  convertiti   integer,
  procent      numeric,
  zile_medii   numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with bounds as (
    select (date_trunc('month', current_date)
            - make_interval(months => greatest(coalesce(p_luni,6),1) - 1))::date as start_luna
  ),
  lead_set as (
    select l.status, l.data_conversie, l.created
    from leads l, bounds b
    where l.created >= b.start_luna
      and l.status <> 'nurture'
      and (p_locatie is null or l.locatia = p_locatie)
  )
  select
    count(*)::int as total_leads,
    count(*) filter (where status = 'convertit')::int as convertiti,
    case when count(*) > 0
         then round(100.0 * count(*) filter (where status = 'convertit') / count(*), 1)
         else 0 end as procent,
    round(avg(extract(epoch from (data_conversie - created)) / 86400.0)
          filter (where status = 'convertit' and data_conversie is not null), 1) as zile_medii
  from lead_set;
$$;

grant execute on function get_conversie_leads(integer, text) to authenticated;

-- B6. get_retentie_membri — filtrabil pe locație (prezențe via cursuri.locatie).
drop function if exists get_retentie_membri();
create or replace function get_retentie_membri(p_locatie uuid default null)
returns table (
  baza_prev integer,
  retinuti  integer,
  pierduti  integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with b as (
    select date_trunc('month', current_date)::date as m0
  ),
  ranges as (
    select
      (m0 - interval '2 month')::date                       as prev_start,
      (m0 - interval '1 month' - interval '1 day')::date     as prev_end,
      (m0 - interval '1 month')::date                        as cur_start,
      (m0 - interval '1 day')::date                          as cur_end
    from b
  ),
  prezenti_luna as (
    select distinct p.client, p.data
    from prezente p
    join enrollments e on e.id = p.enrollment
    join cursuri c on c.id = e.cursul
    where p.status = 'Prezent'
      and coalesce(c.facultativ, false) = false
      and p.client is not null
      and (p_locatie is null or c.locatie = p_locatie)
  ),
  prev_m as (
    select distinct pl.client
    from prezenti_luna pl, ranges r
    where pl.data between r.prev_start and r.prev_end
  ),
  cur_m as (
    select distinct pl.client
    from prezenti_luna pl, ranges r
    where pl.data between r.cur_start and r.cur_end
  )
  select
    (select count(*) from prev_m)::int as baza_prev,
    (select count(*) from prev_m where client in (select client from cur_m))::int as retinuti,
    (select count(*) from prev_m where client not in (select client from cur_m))::int as pierduti;
$$;

grant execute on function get_retentie_membri(uuid) to authenticated;

-- B7. get_retentie_cohorte — filtrabil pe locație (prezențe via cursuri.locatie).
drop function if exists get_retentie_cohorte(uuid);
create or replace function get_retentie_cohorte(
  p_sezon   uuid default null,
  p_locatie uuid default null
)
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
  with prez as (
    select distinct p.client, date_trunc('month', p.data)::date as m
    from prezente p
    join enrollments e on e.id = p.enrollment
    join cursuri c on c.id = e.cursul
    where p.status = 'Prezent'
      and coalesce(c.facultativ, false) = false
      and p.client is not null
      and p.data is not null
      and p.data < date_trunc('month', current_date)::date
      and (p_sezon is null or e.sezon_id = p_sezon)
      and (p_locatie is null or c.locatie = p_locatie)
  ),
  cohort as (
    select client, min(m) as cohort_m
    from prez group by client
  ),
  cohort_win as (
    select * from cohort
    where p_sezon is not null
       or cohort_m >= (date_trunc('month', current_date) - interval '11 months')::date
  ),
  tot as (
    select cohort_m, count(*)::int as total_initial from cohort_win group by cohort_m
  ),
  expanded as (
    select cw.client, cw.cohort_m, o.k,
           (cw.cohort_m + make_interval(months => o.k))::date as off_m
    from cohort_win cw
    cross join generate_series(0, 11) o(k)
    where (cw.cohort_m + make_interval(months => o.k))::date < date_trunc('month', current_date)::date
  ),
  ret as (
    select x.cohort_m, x.k, count(distinct pz.client)::int as ramasi
    from expanded x
    left join prez pz on pz.client = x.client and pz.m = x.off_m
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

grant execute on function get_retentie_cohorte(uuid, uuid) to authenticated;
