-- Qapp v2 — Overview: creștere netă lunară (intrați vs pierduți).
--
-- INDEPENDENT de cron/status (cronul auto_mark nu rulează pe prod momentan).
-- Fluxul de membri se derivă pur din înrolări, consistent cu definiția „activ":
--   * membru(M)   = are ≥1 înrolare care acoperă luna M (overlap data_incepere/data_final)
--   * intrati(M)  = membru în M dar NU în M-1 (clienți noi + reactivați)
--   * pierduti(M) = membru în M-1 dar NU în M
--   * net(M)      = intrati - pierduti
--
-- Calculăm pe o lună extra înainte de interval (pentru M-1 al primei luni afișate),
-- apoi o eliminăm din output (offset 1).

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
