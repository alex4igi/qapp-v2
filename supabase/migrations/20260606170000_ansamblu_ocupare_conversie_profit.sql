-- Qapp v2 — Overview iterația 4: grad ocupare + conversie leads + profitabilitate teacher.

-- ============================================================
-- 1. get_grad_ocupare — înscriși activi luna asta / capacitate, per curs
--    Scoping: p_locatie; teacher vede doar cursurile lui.
-- ============================================================
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

-- ============================================================
-- 2. get_conversie_leads — pâlnia lead→client pe ultimele p_luni luni
--    (global; leads.locatia e text liber, nescoped pe locație)
-- ============================================================
create or replace function get_conversie_leads(p_luni integer default 6)
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

grant execute on function get_conversie_leads(integer) to authenticated;

-- ============================================================
-- 3. get_profitabilitate_teacher — încasări vs salariu vs marjă, ultimele p_luni
--    ACCES RESTRÂNS: doar owner + admin (guard is_admin()). Managerii NU văd.
-- ============================================================
create or replace function get_profitabilitate_teacher(p_luni integer default 12)
returns table (
  teacher_id   uuid,
  teacher_nume text,
  incasari     numeric,
  salariu      numeric,
  marja        numeric
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
      date_trunc('month', current_date) - make_interval(months => greatest(coalesce(p_luni,12),1) - 1),
      date_trunc('month', current_date),
      interval '1 month'
    ) gs
  ),
  inc as (
    select v.id_teacher as tid, sum(v.total) as s
    from incasari_teacher_luna v
    join months m on v.luna = m.luna
    where v.id_teacher is not null
    group by v.id_teacher
  ),
  sal as (
    select st.teacher as tid, sum(st.total) as s
    from salarii_teacher st
    join months m on st.anul = m.anul and st.luna = m.luna_num
    group by st.teacher
  )
  select
    t.id,
    format('%s %s', t.prenume, t.nume),
    coalesce(inc.s, 0),
    coalesce(sal.s, 0),
    coalesce(inc.s, 0) - coalesce(sal.s, 0)
  from teacheri t
  left join inc on inc.tid = t.id
  left join sal on sal.tid = t.id
  where is_admin()
    and (coalesce(inc.s, 0) <> 0 or coalesce(sal.s, 0) <> 0)
  order by coalesce(inc.s, 0) - coalesce(sal.s, 0) desc;
$$;

grant execute on function get_profitabilitate_teacher(integer) to authenticated;
