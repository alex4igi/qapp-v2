-- Reînscriere per grupă pentru hub-ul instructorului. get_reinscrieri_progress
-- (20260527140000) e SECURITY INVOKER → pentru un teacher ar returna gol (nu
-- poate citi înrolările altor grupe/sezoane). Aici: SECURITY DEFINER, scoped la
-- grupele instructorului din sezonul țintă (implicit sezonul activ).
create or replace function get_reinscriere_teacher(p_sezon_tinta uuid default null)
returns table (
  curs_id         uuid,
  curs_nume       text,
  total_eligibili int,
  activati        int,
  procent         numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with tinta as (
    select coalesce(
      p_sezon_tinta,
      (select id from sezoane where activ = true order by data_incepere desc limit 1)
    ) as sezon
  ),
  target as (
    select c.id as curs_target_id, c.numele, c.cursul_original
    from cursuri c, tinta
    where c.sezon = tinta.sezon
      and (
        c.teacher = current_teacher_id()
        or exists (select 1 from cursuri_teacheri ct
                   where ct.curs_id = c.id and ct.teacher_id = current_teacher_id())
      )
  ),
  eligibili as (
    select t.curs_target_id, count(distinct e.client)::int as total
    from target t
    join enrollments e on e.cursul = t.cursul_original
    where t.cursul_original is not null
      and e.activ = true
      and e.reziliat = false
      and (e.data_incepere is null or e.data_incepere <= current_date)
      and (e.data_final is null or e.data_final >= current_date)
    group by t.curs_target_id
  ),
  activati as (
    select e.cursul as curs_target_id, count(distinct e.client)::int as total
    from enrollments e
    join target t on t.curs_target_id = e.cursul
    where e.este_reinscriere = true
      and e.reziliat = false
    group by e.cursul
  )
  select
    t.curs_target_id,
    t.numele,
    coalesce(el.total, 0),
    coalesce(a.total, 0),
    case when coalesce(el.total, 0) > 0
         then round(100.0 * coalesce(a.total, 0) / el.total, 1)
         else 0 end
  from target t
  left join eligibili el on el.curs_target_id = t.curs_target_id
  left join activati a   on a.curs_target_id  = t.curs_target_id
  order by t.numele;
$$;

grant execute on function get_reinscriere_teacher(uuid) to authenticated;
