-- `teacheri` nu are coloană de locație: instructorii sunt multi-locație prin
-- definiție (locația lor stă în app_metadata al contului, când există cont).
-- Are în schimb `email`, care e util în dropdown ca să distingi omonimele.

create or replace function get_titulari_kpi(p_include_teacheri boolean default true)
returns table (
  tip         text,
  titular_id  uuid,
  nume_afisat text,
  email       text,
  rol         text,
  locatie_id  uuid,
  are_grila   boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Doar owner/admin pot vedea titularii de grilă KPI'
      using errcode = '42501';
  end if;

  return query
  select 'user'::text,
         u.id,
         trim(coalesce(
           nullif(trim(concat_ws(' ', t.prenume, t.nume)), ''),
           nullif(u.raw_user_meta_data ->> 'full_name', ''),
           split_part(u.email, '@', 1)
         )),
         u.email::text,
         (u.raw_app_meta_data ->> 'role')::text,
         nullif(u.raw_app_meta_data ->> 'locatie_id', '')::uuid,
         exists (select 1 from kpi_grile g
                  where g.titular_user = u.id and g.stare <> 'incheiata')
  from auth.users u
  left join teacheri t on t.auth_user_id = u.id
  where u.raw_app_meta_data ->> 'role' in ('owner','admin','manager','front_desk')
    and u.deleted_at is null

  union all

  select 'teacher'::text,
         t.id,
         trim(concat_ws(' ', t.prenume, t.nume)),
         t.email,
         'teacher'::text,
         null::uuid,
         exists (select 1 from kpi_grile g
                  where g.titular_teacher = t.id and g.stare <> 'incheiata')
  from teacheri t
  where p_include_teacheri
    and coalesce(t.arhivat, false) = false
    and t.auth_user_id is null   -- cei cu cont apar deja în prima ramură

  order by 3;
end;
$$;

revoke execute on function get_titulari_kpi(boolean) from anon, public;
grant execute on function get_titulari_kpi(boolean) to authenticated;
