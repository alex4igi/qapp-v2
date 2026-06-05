-- Qapp v2 — get_grad_ocupare: limitează la cursurile sezonului activ.
--
-- Fix vs 20260606170000: includea TOATE cursurile nesuspendate (198, inclusiv
-- sezoane arhivate) → ocupare irelevantă. Restrângem la cursurile sezonului activ.
-- Restul logicii identic.

create or replace function get_grad_ocupare(p_locatie uuid default null)
returns table (
  curs_id      uuid,
  curs_nume    text,
  locatie_nume text,
  teacher_nume text,
  activi       integer,
  capacitate   integer,
  procent      numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with luna as (
    select date_trunc('month', current_date)::date as start_luna,
           (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date as end_luna
  ),
  cursuri_scop as (
    select c.id, c.numele, c.locatie, c.teacher, c.capacitate_maxima
    from cursuri c
    where coalesce(c.suspendat, false) = false
      and c.sezon = (select id from sezoane where activ = true order by data_incepere desc limit 1)
      and (p_locatie is null or c.locatie = p_locatie)
      and (
        auth_role() <> 'teacher'
        or c.teacher = current_teacher_id()
        or exists (select 1 from cursuri_teacheri ct
                   where ct.curs_id = c.id and ct.teacher_id = current_teacher_id())
      )
  ),
  activi as (
    select cs.id as curs_id, count(distinct e.client)::int as n
    from cursuri_scop cs
    join enrollments e on e.cursul = cs.id
      and e.activ = true and e.reziliat = false
      and e.data_incepere <= (select end_luna from luna)
      and (e.data_final is null or e.data_final >= (select start_luna from luna))
    group by cs.id
  )
  select
    cs.id as curs_id,
    cs.numele as curs_nume,
    loc.nume as locatie_nume,
    coalesce(
      (select t.nume from teacheri t where t.id = cs.teacher),
      (select t.nume from cursuri_teacheri ct join teacheri t on t.id = ct.teacher_id
        where ct.curs_id = cs.id order by case when ct.rol='titular' then 0 else 1 end limit 1)
    ) as teacher_nume,
    coalesce(a.n, 0) as activi,
    cs.capacitate_maxima as capacitate,
    case when cs.capacitate_maxima > 0
         then round(100.0 * coalesce(a.n, 0) / cs.capacitate_maxima, 0)
         else null end as procent
  from cursuri_scop cs
  left join activi a on a.curs_id = cs.id
  left join locatii loc on loc.id = cs.locatie
  order by
    case when cs.capacitate_maxima > 0
         then round(100.0 * coalesce(a.n, 0) / cs.capacitate_maxima, 0)
         else null end desc nulls last,
    cs.numele;
$$;

grant execute on function get_grad_ocupare(uuid) to authenticated;
