-- Qapp v2 — /analytics Secțiunea 0: expanderul „Detaliu per grupă" de sub Rată
-- prezență respectă și el locația selectată (coerent cu badge-ul, care e deja
-- scopat). Adaugă p_locatie uuid la get_prezenta_saptamana_grupe (filtru
-- cursuri.locatie). În absența locației = tot clubul.

drop function if exists get_prezenta_saptamana_grupe();

create or replace function get_prezenta_saptamana_grupe(p_locatie uuid default null)
returns table (
  curs_id      uuid,
  curs_nume    text,
  locatie_nume text,
  prezenti     int,
  posibile     int,
  rata         numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with d2 as (
    select (date_trunc('week', current_date))::date - 7 as s_start,
           (date_trunc('week', current_date))::date - 1 as s_end
  ),
  sesiuni as (
    select e.cursul as curs_id, p.data, count(distinct p.client)::int as prezenti
    from d2
    join prezente p on p.status = 'Prezent' and p.data between d2.s_start and d2.s_end
    join enrollments e on e.id = p.enrollment
    join cursuri c on c.id = e.cursul
    where coalesce(c.facultativ, false) = false
      and coalesce(c.suspendat, false) = false
      and (p_locatie is null or c.locatie = p_locatie)
    group by e.cursul, p.data
  ),
  agg as (
    select s.curs_id,
           sum(s.prezenti)::int as prezenti,
           sum((select count(distinct e2.client)
                  from enrollments e2
                 where e2.cursul = s.curs_id
                   and e2.data_incepere <= s.data
                   and (e2.data_final is null or e2.data_final >= s.data)))::int as posibile
    from sesiuni s
    group by s.curs_id
  )
  select a.curs_id, c.numele, loc.nume,
         a.prezenti, a.posibile,
         case when a.posibile > 0 then round(100.0 * a.prezenti / a.posibile, 0) end as rata
  from agg a
  join cursuri c on c.id = a.curs_id
  left join locatii loc on loc.id = c.locatie
  where is_admin()
  order by rata asc nulls last, c.numele;
$$;

grant execute on function get_prezenta_saptamana_grupe(uuid) to authenticated;
