-- Adaugă filtru opțional pe grupă (curs) la statistica prezențe pe achitare.
-- Semnătura crește cu un parametru → DROP + CREATE (altfel rămâne overload ambiguu
-- față de varianta cu 4 parametri la apelul fără p_curs).

drop function if exists get_statistica_prezente_achitare(date, date, uuid, uuid);

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
security invoker
set search_path = public
as $$
  with bounds as (
    select
      date_trunc('month', p_from)::date as d_from,
      (date_trunc('month', p_to) + interval '1 month - 1 day')::date as d_to
  ),
  -- luna în care fiecare înrolare devine complet plătită (cumulat, plăți până la sfârșitul intervalului)
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
  emitted as (
    -- statusul în propria lună (achitate XOR neachitate)
    select
      sm as luna,
      case when cm is not null and cm <= sm then 1 else 0 end as achitate,
      case when cm is null or cm > sm then 1 else 0 end as neachitate,
      0 as din_trecut
    from classified
    union all
    -- suprapunere: prezență mai veche stinsă în luna plății (cm)
    select
      cm as luna,
      0 as achitate,
      0 as neachitate,
      1 as din_trecut
    from classified
    where cm is not null and cm > sm
  )
  select
    em.luna,
    sum(em.achitate)::integer   as achitate,
    sum(em.neachitate)::integer as neachitate,
    sum(em.din_trecut)::integer as din_trecut
  from emitted em
  cross join bounds b
  where em.luna >= to_char(b.d_from, 'YYYY-MM')
    and em.luna <= to_char(b.d_to, 'YYYY-MM')
  group by em.luna
  order by em.luna;
$$;

grant execute on function get_statistica_prezente_achitare(date, date, uuid, uuid, uuid) to authenticated;
