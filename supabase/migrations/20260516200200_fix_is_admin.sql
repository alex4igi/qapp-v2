-- Fix: migrația 20260516200000 conținea două bug-uri legate de identificarea
-- rolului admin în JWT:
--   1. is_admin() a fost suprascris cu un coalesce greșit (primul argument false →
--      restul ignorat). Restaurăm la varianta din 20260514100200_rls.sql care
--      folosește helper-ul auth_role().
--   2. confirma_salariu_teacher() verifica `auth.jwt() ->> 'role'`, care întoarce
--      mereu 'authenticated' pentru orice user logat — niciodată 'admin'.
--      Folosim is_admin() corect.

create or replace function is_admin()
returns boolean
language sql
stable
as $$
  select auth_role() = 'admin';
$$;

create or replace function confirma_salariu_teacher(
  p_teacher uuid,
  p_anul int,
  p_luna int,
  p_data_plata date default current_date
) returns salarii_teacher
language plpgsql
security definer
set search_path = public
as $$
declare
  v_calc jsonb;
  v_row salarii_teacher;
begin
  if not is_admin() then
    raise exception 'Doar adminul poate confirma salarii' using errcode = '42501';
  end if;

  v_calc := calculeaza_salariu_teacher(p_teacher, p_anul, p_luna);

  insert into salarii_teacher (teacher, anul, luna, total, breakdown, status, data_plata)
  values (
    p_teacher, p_anul, p_luna,
    (v_calc ->> 'total')::numeric,
    v_calc -> 'grupe',
    'platit',
    p_data_plata
  )
  on conflict (teacher, anul, luna) do update
    set total = excluded.total,
        breakdown = excluded.breakdown,
        data_plata = excluded.data_plata,
        updated = now()
  returning * into v_row;

  return v_row;
end;
$$;

-- RLS policy pe salarii_teacher: my_teacher_id rămâne, dar policy SELECT pentru teacher
-- ar trebui să meargă pe ambele helpere; nimic de schimbat.
