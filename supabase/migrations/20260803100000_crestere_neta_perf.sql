-- get_crestere_neta nu mai cade sub RLS: 3,5s ca `authenticated` vs 0,42s fără
-- RLS (măsurat 2026-08-03), iar sub concurența de la montarea /statistici urca
-- la 6,9s — la limita statement_timeout de 8s. Aceeași clasă de degradare ca la
-- get_statistica_prezente_achitare (20260802110000): nu filtrul per-rând al
-- politicii, ci planner-ul care pierde ordinea de join când tabelele devin
-- subquery-uri security-barrier.
--
-- Același rețetar: `security definer` + gard explicit pentru `parinte` (evaluat
-- o dată) + revoke anon/public + plan custom. Funcția întoarce doar numărători
-- agregate pe lună, iar politicile de SELECT pe tabelele sursă sunt `using (true)`
-- pentru orice rol de staff — ocolirea RLS nu expune nimic nou. Corpul rămâne
-- IDENTIC cu 20260702120400 (verificat numeric înainte/după, diff 0).

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
security definer
set search_path = public
as $$
  with bounds as (
    select (date_trunc('month', current_date) - interval '1 month')::date as last_closed,
           greatest(coalesce(p_luni, 12), 1) as n
  ),
  months_calc as (
    select gs::date as m_start,
           (extract(year from gs) * 12 + extract(month from gs))::int as midx,
           to_char(gs, 'YYYY-MM') as luna
    from bounds b,
      generate_series(
        (b.last_closed - make_interval(months => b.n))::date,
        b.last_closed,
        interval '1 month'
      ) gs
  ),
  cm as (
    select distinct ia.client, m.midx
    from months_calc m
    cross join lateral inrolari_active_luna(m.m_start) ia
    join cursuri c on c.id = ia.cursul
    where (p_locatie is null or c.locatie = p_locatie)
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
  where (select auth_role()) <> 'parinte'   -- gardul pe care RLS îl dădea înainte
  order by luna
  offset 1;
$$;

alter function get_crestere_neta(uuid, integer)
  set plan_cache_mode = 'force_custom_plan';

revoke execute on function get_crestere_neta(uuid, integer) from anon, public;
grant execute on function get_crestere_neta(uuid, integer) to authenticated;
