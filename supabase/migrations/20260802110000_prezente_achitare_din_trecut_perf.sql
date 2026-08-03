-- Face „Achitate din trecut" (20260802100000) să încapă în bugetul de 8s al Supabase.
--
-- Măsurători pe datele reale (rol `authenticated`, prin PostgREST):
--   funcția veche (fără lookback):   12 luni 3,3s | o lună 4,8s   ← deja la limită
--   varianta din 20260802100000:     12 luni TIMEOUT              ← regresie
--   aceeași logică fără RLS:         12 luni 1,1s | o lună 0,6s
-- Diferența nu vine din filtrul per-rând al politicii (un `count(*)` pe prezente costă
-- la fel cu și fără RLS), ci din degradarea planului: cu RLS tabelele devin subquery-uri
-- security-barrier și planner-ul pierde ordinea bună de join la 12 luni.
--
-- Două schimbări:
--
-- 1) `security definer` + gard explicit pentru `parinte`. Funcția întoarce doar numărători
--    agregate pe lună, iar politicile de SELECT pe prezente/incasari/enrollments sunt
--    `using (true)` pentru orice rol de staff — deci ocolirea RLS nu expune nimic ce
--    staff-ul nu vede deja. Singurul rol pe care RLS îl oprea aici era `parinte`
--    (gardul restrictiv deny_parinte_direct), înlocuit acum cu o verificare explicită
--    evaluată o singură dată. `revoke ... from anon, public` conform regulii din CLAUDE.md.
--
-- 2) `cand` înlocuiește `stinse_in_fereastra`: în loc de un al doilea scan agregat peste
--    tot tabelul incasari (care se vărsa pe disc, 21 batches), luăm doar înrolările cu
--    plată în fereastră ȘI cu ședințe dinaintea ferestrei — un `exists` care merge pe
--    idx_prezente_prezent_enrollment_data. Restul (relevant, completion, classified,
--    trecut) rămâne ca în 20260802100000; rezultatele sunt identice, verificat numeric.
--
-- `force_custom_plan`: planul generic (parametri opaci) costa 3,4x față de cel custom.

create or replace function get_statistica_prezente_achitare(
  p_from    date,
  p_to      date,
  p_locatie uuid default null,
  p_teacher uuid default null,
  p_curs    uuid default null
)
returns table (
  luna        text,
  achitate    integer,
  neachitate  integer,
  din_trecut  integer
)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select
      date_trunc('month', p_from)::date as d_from,
      (date_trunc('month', p_to) + interval '1 month - 1 day')::date as d_to,
      (date_trunc('month', p_from) - interval '24 months')::date as d_floor
  ),
  -- înrolările cu cel puțin o prezență în interval (aplicăm aici toate filtrele)
  relevant as (
    select distinct p.enrollment as enr
    from prezente p
    join enrollments e on e.id = p.enrollment
    left join cursuri c on c.id = e.cursul
    left join sali s on s.id = c.sala
    cross join bounds b
    where p.status = 'Prezent'
      and p.enrollment is not null
      and p.data >= b.d_from
      and p.data <= b.d_to
      and (p_locatie is null or s.locatie = p_locatie)
      and (p_teacher is null or c.teacher = p_teacher)
      and (p_curs is null or e.cursul = p_curs)
  ),
  -- înrolări care POT contribui la overlay-ul „din trecut": au o plată în fereastră
  -- (condiție necesară ca stingerea să cadă în fereastră) ȘI au ședințe dinaintea
  -- ferestrei (altfel n-ar aduce nimic peste ce dă deja `relevant`).
  cand as (
    select distinct i.inregistrare as enr
    from incasari i
    join enrollments e on e.id = i.inregistrare
    left join cursuri c on c.id = e.cursul
    left join sali s on s.id = c.sala
    cross join bounds b
    where i.inregistrare is not null
      and coalesce(e.suma, 0) > 0
      and i.data >= b.d_from
      and i.data <= b.d_to
      and (p_locatie is null or s.locatie = p_locatie)
      and (p_teacher is null or c.teacher = p_teacher)
      and (p_curs is null or e.cursul = p_curs)
      and exists (
        select 1 from prezente p2
        where p2.enrollment = i.inregistrare
          and p2.status = 'Prezent'
          and p2.data < b.d_from
          and p2.data >= b.d_floor
      )
  ),
  enr_scope as (
    select enr from relevant
    union
    select enr from cand
  ),
  -- luna în care fiecare înrolare din scop devine complet plătită
  completion as (
    select enr, min(data) as cdate
    from (
      select
        i.inregistrare as enr,
        i.data,
        sum(i.suma) over (
          partition by i.inregistrare
          order by i.data, i.id
          rows between unbounded preceding and current row
        ) as cum,
        coalesce(e.suma, 0) as needed
      from incasari i
      join enrollments e on e.id = i.inregistrare
      join enr_scope r on r.enr = i.inregistrare
      cross join bounds b
      where coalesce(e.suma, 0) > 0
        and i.data is not null
        and i.data <= b.d_to
    ) t
    where t.cum >= t.needed
    group by enr
  ),
  classified as (
    select
      to_char(p.data, 'YYYY-MM') as sm,
      case
        when coalesce(e.suma, 0) <= 0 then to_char(p.data, 'YYYY-MM')  -- plătit din start
        else to_char(comp.cdate, 'YYYY-MM')
      end as cm
    from prezente p
    join enrollments e on e.id = p.enrollment
    left join cursuri c on c.id = e.cursul
    left join sali s on s.id = c.sala
    left join completion comp on comp.enr = e.id
    cross join bounds b
    where p.status = 'Prezent'
      and p.enrollment is not null
      and p.data >= b.d_from
      and p.data <= b.d_to
      and (p_locatie is null or s.locatie = p_locatie)
      and (p_teacher is null or c.teacher = p_teacher)
      and (p_curs is null or e.cursul = p_curs)
  ),
  -- overlay: TOATE prezențele mai vechi decât luna stingerii, inclusiv cele dinaintea
  -- ferestrei (max 24 luni în urmă). Filtrele nu se repetă — ambele surse ale lui
  -- `completion` le-au aplicat deja pe înrolare.
  trecut as (
    select to_char(comp.cdate, 'YYYY-MM') as luna, count(*)::int as n
    from completion comp
    join prezente p
      on p.enrollment = comp.enr
     and p.status = 'Prezent'
    cross join bounds b
    where comp.cdate >= b.d_from
      and comp.cdate <= b.d_to
      and p.data >= b.d_floor
      and p.data >= (date_trunc('month', comp.cdate) - interval '24 months')::date
      and to_char(p.data, 'YYYY-MM') < to_char(comp.cdate, 'YYYY-MM')
    group by 1
  ),
  emitted as (
    select
      sm as luna,
      case when cm is not null and cm <= sm then 1 else 0 end as achitate,
      case when cm is null or cm > sm then 1 else 0 end as neachitate,
      0 as din_trecut
    from classified
    union all
    select luna, 0, 0, n
    from trecut
  )
  select
    em.luna,
    sum(em.achitate)::integer   as achitate,
    sum(em.neachitate)::integer as neachitate,
    sum(em.din_trecut)::integer as din_trecut
  from emitted em
  cross join bounds b
  where (select auth_role()) <> 'parinte'   -- gardul pe care RLS îl dădea înainte
    and em.luna >= to_char(b.d_from, 'YYYY-MM')
    and em.luna <= to_char(b.d_to, 'YYYY-MM')
  group by em.luna
  order by em.luna;
$$;

alter function get_statistica_prezente_achitare(date, date, uuid, uuid, uuid)
  set plan_cache_mode = 'force_custom_plan';

revoke execute on function get_statistica_prezente_achitare(date, date, uuid, uuid, uuid)
  from anon, public;
grant execute on function get_statistica_prezente_achitare(date, date, uuid, uuid, uuid)
  to authenticated;
