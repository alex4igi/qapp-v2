-- get_datorii_evolutie: TIMEOUT (8s) pe rolul authenticated prin PostgREST,
-- deși cu service role (fără RLS) rulează în ~3s. Aceeași patologie ca la
-- get_statistica_prezente_achitare (20260802110000): cu RLS, enrollments/incasari
-- devin subquery-uri security-barrier și planner-ul pierde ordinea de join.
--
-- Fix identic cu precedentul: `security definer` — funcția întoarce doar solduri
-- agregate pe lună, iar politicile de SELECT pe enrollments/incasari/datorii sunt
-- `using (true)` pentru staff, deci ocolirea RLS nu expune nimic în plus. Singurul
-- rol pe care RLS îl oprea era `parinte` — acoperit de gardul explicit auth_role()
-- (staff-only), evaluat o dată. `force_custom_plan` ca la precedent.

create or replace function get_datorii_evolutie(p_locatie uuid default null, p_luni int default 12)
returns table (
  luna        text,
  sold_net    numeric,
  sold_oneoff numeric,
  sold_total  numeric
)
language sql
stable
security definer
set search_path = public
set plan_cache_mode = force_custom_plan
as $$
  with luni as (
    select (date_trunc('month', current_date) - (interval '1 month' * g))::date as m_start
    from generate_series(0, greatest(coalesce(p_luni, 12), 1) - 1) g
  ),
  f as (
    select date_trunc('month', e.data_incepere)::date as b, sum(coalesce(e.suma, 0)) as suma
    from enrollments e
    left join cursuri c on c.id = e.cursul
    left join sali s on s.id = c.sala
    where e.reziliat = false
      and e.data_incepere is not null
      and (p_locatie is null or s.locatie = p_locatie)
    group by 1
  ),
  p as (
    select date_trunc('month', e.data_incepere)::date as b,
           date_trunc('month', i.data)::date as pm,
           sum(i.suma) as suma
    from incasari i
    join enrollments e on e.id = i.inregistrare
    left join cursuri c on c.id = e.cursul
    left join sali s on s.id = c.sala
    where e.reziliat = false
      and e.data_incepere is not null
      and (p_locatie is null or s.locatie = p_locatie)
    group by 1, 2
  ),
  df as (
    select date_trunc('month', d.created)::date as b, sum(d.suma_datorata) as suma
    from datorii d
    where (p_locatie is null or d.locatie = p_locatie)
    group by 1
  ),
  dp as (
    select date_trunc('month', d.created)::date as b,
           date_trunc('month', i.data)::date as pm,
           sum(i.suma) as suma
    from incasari i
    join datorii d on d.id = i.datorie
    where (p_locatie is null or d.locatie = p_locatie)
    group by 1, 2
  ),
  solduri as (
    select
      l.m_start,
      greatest(
        coalesce((select sum(f.suma) from f
                  where f.b <= l.m_start and f.b > (l.m_start - interval '2 years')::date), 0)
        - coalesce((select sum(p.suma) from p
                  where p.b <= l.m_start and p.b > (l.m_start - interval '2 years')::date
                    and p.pm <= l.m_start), 0),
        0) as sold_net,
      greatest(
        coalesce((select sum(df.suma) from df where df.b <= l.m_start), 0)
        - coalesce((select sum(dp.suma) from dp where dp.b <= l.m_start and dp.pm <= l.m_start), 0),
        0) as sold_oneoff
    from luni l
  )
  select
    to_char(s.m_start, 'YYYY-MM') as luna,
    s.sold_net,
    s.sold_oneoff,
    s.sold_net + s.sold_oneoff as sold_total
  from solduri s
  where auth_role() in ('owner', 'admin', 'manager', 'front_desk')
  order by s.m_start asc;
$$;

revoke execute on function get_datorii_evolutie(uuid, int) from anon, public;
grant execute on function get_datorii_evolutie(uuid, int) to authenticated;
