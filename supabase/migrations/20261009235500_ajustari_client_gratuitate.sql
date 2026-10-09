-- Tabul „Ajustări": intră și voucherul de angajat / gratuitatea specială
-- (`gratuitate_inrolare`, din 20261009230000) — tot o ajustare de preț pe înrolare.

create or replace function get_ajustari_client(
  p_client  uuid default null,
  p_familie uuid default null
)
returns table (
  id        uuid,
  moment    timestamptz,
  actiune   text,
  rol       text,
  autor     text,
  motiv     text,
  pentru    text,
  curs      text,
  curs_nou  text,
  luna      date,
  vechi     jsonb,
  nou       jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rol text := (select auth_role());
  v_uuid constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  if v_rol is null or v_rol not in ('owner', 'admin', 'manager') then
    raise exception 'Acces refuzat.' using errcode = '42501';
  end if;

  return query
  with membri as (
    select c.id,
           nullif(btrim(concat_ws(' ', c.prenume, c.nume)), '') as nume,
           btrim(coalesce(c.nume, '') || ' ' || coalesce(c.prenume, '')) as nume_invers
    from clienti c
    where c.id = p_client
       or (p_familie is not null and c.familia = p_familie)
  ),
  staff as (
    select u.id,
           coalesce(nullif(trim(concat_ws(' ', t.prenume, t.nume)), ''), split_part(u.email, '@', 1)) as nume
    from auth.users u
    left join lateral (
      select t.prenume, t.nume from teacheri t where t.auth_user_id = u.id limit 1
    ) t on true
  ),
  linii as (
    select distinct on (a.id) a.*, m.nume as nume_client
    from audit_log a
    cross join lateral (
      select e.client from enrollments e
       where a.entity_type = 'enrollment' and e.id = a.entity_id
      union all
      select i.client from incasari i
       where a.entity_type = 'incasare' and i.id = a.entity_id
      union all
      select a.entity_id where a.entity_type = 'client'
      union all
      select e.client from enrollments e
       where a.action = 'prezenta_deleted' and e.id::text = a.old_value->>'enrollment'
      union all
      select case when v.x ~ v_uuid then v.x::uuid end
        from (values (a.old_value->>'client'), (a.new_value->>'client'),
                     (a.old_value->>'client_id'), (a.new_value->>'client_id')) v(x)
       where v.x ~ v_uuid
      union all
      select mm.id from membri mm
       where a.action = 'incasare_deleted'
         and a.old_value->>'client_id' is null
         and a.old_value->>'client' = mm.nume_invers
    ) k(client_id)
    join membri m on m.id = k.client_id
    where a.action in (
            'price_override', 'enrollment_moved', 'enrollment_date_corrected',
            'enrollment_backdated', 'abonament_to_sedinte', 'sedinte_to_abonament',
            'enrollment_reziliata', 'enrollment_deleted', 'incasare_modified',
            'incasare_moved', 'incasare_deleted', 'datorie_deleted', 'prezenta_deleted',
            'gratuitate_inrolare'
          )
      and (v_rol <> 'manager' or is_in_my_locatie(a.locatie_id))
    order by a.id
  ),
  cu_inrolare as (
    select l.*,
           case
             when l.entity_type = 'enrollment' then l.entity_id
             when l.new_value->>'target_type' = 'enrollment' and l.new_value->>'target_id' ~ v_uuid
               then (l.new_value->>'target_id')::uuid
             when l.old_value->>'enrollment_id' ~ v_uuid then (l.old_value->>'enrollment_id')::uuid
             when l.old_value->>'enrollment' ~ v_uuid then (l.old_value->>'enrollment')::uuid
           end as enr_id
    from linii l
  )
  select l.id,
         l.created,
         l.action,
         l.actor_role,
         s.nume,
         l.reason,
         l.nume_client,
         coalesce(cv.numele, ce.numele, l.old_value->>'curs'),
         case
           when l.action = 'enrollment_moved' then cn.numele
           when l.action = 'incasare_moved' then l.new_value->>'curs'
         end,
         coalesce(e.data_incepere, (l.old_value->>'data_incepere')::date),
         l.old_value,
         l.new_value
  from cu_inrolare l
  left join enrollments e on e.id = l.enr_id
  left join cursuri ce on ce.id = e.cursul
  left join cursuri cv on cv.id::text = l.old_value->>'cursul'
  left join cursuri cn on cn.id::text = l.new_value->>'cursul'
  left join staff s on s.id = l.actor_id
  order by l.created desc;
end;
$$;

revoke execute on function get_ajustari_client(uuid, uuid) from anon, public;
grant execute on function get_ajustari_client(uuid, uuid) to authenticated;
