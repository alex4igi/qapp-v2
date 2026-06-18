-- Front_desk poate muta cursanți între grupe; managerul (și owner/admin) primesc
-- o notificare informativă (fără aprobare — nu îngreunăm managerul).
-- SECURITY DEFINER pentru fan-out peste RLS, ca la notify_price_change.
create or replace function notify_enrollment_move(
  p_enrollment uuid,
  p_from_curs  uuid,
  p_to_curs    uuid,
  p_motiv      text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor     uuid := auth.uid();
  v_client    text;
  v_from      text;
  v_to        text;
  v_recipient uuid;
  v_count     integer := 0;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  select trim(coalesce(c.nume, '') || ' ' || coalesce(c.prenume, ''))
    into v_client
  from enrollments e
  join clienti c on c.id = e.client
  where e.id = p_enrollment;

  select numele into v_from from cursuri where id = p_from_curs;
  select numele into v_to   from cursuri where id = p_to_curs;

  for v_recipient in
    select id from auth.users
    where raw_app_meta_data->>'role' in ('owner', 'admin', 'manager')
      and id <> v_actor
  loop
    insert into notifications (recipient_user_id, kind, title, body, payload)
    values (
      v_recipient,
      'enrollment_move',
      format('Mutare cursant: %s', coalesce(nullif(v_client, ''), 'client')),
      format('%s → %s. Motiv: %s',
             coalesce(v_from, '—'),
             coalesce(v_to, '—'),
             coalesce(nullif(trim(p_motiv), ''), '—')),
      jsonb_build_object(
        'enrollment', p_enrollment,
        'from_curs', p_from_curs,
        'to_curs', p_to_curs,
        'actor', v_actor
      )
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function notify_enrollment_move(uuid, uuid, uuid, text) to authenticated;
