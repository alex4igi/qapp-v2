-- Qapp v2 — Statistici: agregări financiare server-side.
--
-- PROBLEMĂ: funcțiile din statistici/api.ts aduceau rânduri brute din `incasari`/
-- `cheltuieli`/`plati_inrolari` și le însumau în JS. PostgREST întoarce maxim 1000
-- rânduri → cu 53k+ încasări, KPI-urile și mix-urile erau trunchiate tăcut la
-- primele 1000 rânduri (fizic cele mai vechi = importuri v1, ~toate Cash/Abonament).
-- Asta producea: KPI Încasări subevaluat, Mix metode „doar Cash", restanțe greșite.
--
-- SOLUȚIE: mutăm SUM/GROUP BY în SQL. Definiția canonică de venit = încasări pe
-- DATA PLĂȚII, toate categoriile.

-- 1. KPI-uri financiare (încasări, cheltuieli, restanțe) pe interval [p_from, p_to].
--    restanțe = rest>0, neprescrise, pe luna înrolării (data_incepere) în interval.
create or replace function get_kpis_financiar(p_from date, p_to date)
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
    ), 0) as incasari,
    coalesce((
      select sum(ch.valoare) from cheltuieli ch
      where ch.data between p_from and p_to
    ), 0) as cheltuieli,
    coalesce((
      select sum(pi.rest) from plati_inrolari pi
      where pi.rest > 0
        and pi.prescris = false
        and pi.data_incepere between p_from and p_to
    ), 0) as restante;
$$;

grant execute on function get_kpis_financiar(date, date) to authenticated;

-- 2. Mix pe metode de plată (pe data plății).
create or replace function get_mix_metode(p_from date, p_to date)
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
  group by coalesce(i.metoda::text, 'Necunoscut')
  having sum(i.suma) > 0
  order by total desc;
$$;

grant execute on function get_mix_metode(date, date) to authenticated;

-- 3. Mix pe categorii de încasări.
create or replace function get_mix_categorii_incasari(p_from date, p_to date)
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
  group by coalesce(i.categorie::text, 'Necunoscut')
  having sum(i.suma) > 0
  order by total desc;
$$;

grant execute on function get_mix_categorii_incasari(date, date) to authenticated;

-- 4. Mix pe categorii de cheltuieli.
create or replace function get_mix_categorii_cheltuieli(p_from date, p_to date)
returns table (
  categorie text,
  total     numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(ch.categorie::text, 'Necunoscut') as categorie, sum(ch.valoare) as total
  from cheltuieli ch
  where ch.data between p_from and p_to
  group by coalesce(ch.categorie::text, 'Necunoscut')
  having sum(ch.valoare) > 0
  order by total desc;
$$;

grant execute on function get_mix_categorii_cheltuieli(date, date) to authenticated;

-- 5. Creștere netă — aliniere la „înrolare validă" (activ + nereziliat).
--    Înainte număra ORICE înrolare care acoperea luna (inclusiv reziliați) → baza
--    de retenție era umflată (957 vs ~649 activi). Restul logicii e neschimbat.
create or replace function get_crestere_neta(
  p_locatie uuid default null,
  p_luni    integer default 12
)
returns table (
  luna     text,
  intrati  integer,
  pierduti integer,
  net      integer,
  activi   integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with bounds as (
    select date_trunc('month', current_date)::date as cur_month,
           greatest(coalesce(p_luni, 12), 1) as n
  ),
  months_calc as (
    select gs::date as m_start,
           (gs + interval '1 month' - interval '1 day')::date as m_end,
           (extract(year from gs) * 12 + extract(month from gs))::int as midx,
           to_char(gs, 'YYYY-MM') as luna
    from bounds b,
      generate_series(
        (b.cur_month - make_interval(months => b.n))::date,
        b.cur_month,
        interval '1 month'
      ) gs
  ),
  cm as (
    select distinct e.client,
           (extract(year from m.m_start) * 12 + extract(month from m.m_start))::int as midx
    from enrollments e
    join cursuri c on c.id = e.cursul
    join months_calc m
      on e.data_incepere <= m.m_end
     and (e.data_final is null or e.data_final >= m.m_start)
    where e.client is not null
      and e.activ = true
      and e.reziliat = false
      and (p_locatie is null or c.locatie = p_locatie)
  ),
  per_month as (
    select
      m.luna, m.midx,
      (select count(distinct a.client)::int from cm a where a.midx = m.midx) as activi,
      (select count(distinct a.client)::int from cm a
         where a.midx = m.midx
           and not exists (select 1 from cm b where b.client = a.client and b.midx = m.midx - 1)
      ) as intrati,
      (select count(distinct a.client)::int from cm a
         where a.midx = m.midx - 1
           and not exists (select 1 from cm b where b.client = a.client and b.midx = m.midx)
      ) as pierduti
    from months_calc m
  )
  select luna, intrati, pierduti, (intrati - pierduti) as net, activi
  from per_month
  order by luna
  offset 1;
$$;

grant execute on function get_crestere_neta(uuid, integer) to authenticated;
