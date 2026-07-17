-- Zile de naștere luna aceasta pentru cursanții grupelor instructorului.
-- Teacher-scoped (SECURITY DEFINER, current_teacher_id()). Un cursant înscris în
-- 2 grupe apare o singură dată.
create or replace function get_zile_nastere_teacher()
returns table (
  client_id     uuid,
  client_nume   text,
  curs_nume     text,
  zi            int,
  este_azi      boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with scop as (
    select c.id, c.numele
    from cursuri c
    where c.teacher = current_teacher_id()
       or exists (select 1 from cursuri_teacheri ct
                  where ct.curs_id = c.id and ct.teacher_id = current_teacher_id())
  )
  select distinct on (cl.id)
    cl.id,
    trim(format('%s %s', coalesce(cl.prenume, ''), cl.nume)) as client_nume,
    s.numele as curs_nume,
    extract(day from cl.data_nasterii)::int as zi,
    (to_char(cl.data_nasterii, 'MM-DD') = to_char(current_date, 'MM-DD')) as este_azi
  from enrollments e
  join scop s on s.id = e.cursul
  join clienti cl on cl.id = e.client
  where e.reziliat = false
    and cl.data_nasterii is not null
    and extract(month from cl.data_nasterii) = extract(month from current_date)
  order by cl.id, s.numele;
$$;

grant execute on function get_zile_nastere_teacher() to authenticated;
