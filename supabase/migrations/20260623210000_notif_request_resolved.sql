-- Închide bucla request → răspuns: când cel care a primit un to-do acționabil
-- (ex: managerul, pe o mutare de grupă lansată de front_desk) îl marchează
-- rezolvat, inițiatorul (`payload.actor`) primește o notificare-răspuns.
-- Managerul poate atașa opțional o notă text care ajunge la inițiator.
-- Generic: orice `kind` cu requires_action + payload.actor beneficiază automat.

drop function if exists notifications_resolve(uuid);

create or replace function notifications_resolve(
  p_id      uuid,
  p_raspuns text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload   jsonb;
  v_title     text;
  v_kind      text;
  v_requires  boolean;
  v_status    text;
  v_actor_txt text;
  v_actor     uuid;
  v_email     text;
  v_role      text;
  v_role_lbl  text;
  v_body      text;
begin
  select payload, title, kind, requires_action, status, payload->>'actor'
    into v_payload, v_title, v_kind, v_requires, v_status, v_actor_txt
  from notifications
  where id = p_id and recipient_user_id = auth.uid();

  if not found then
    raise exception 'Notificare inexistentă sau nu îți aparține';
  end if;

  update notifications
    set status = 'resolved',
        resolved_at = now(),
        resolved_by = auth.uid(),
        read_at = coalesce(read_at, now())
    where id = p_id and recipient_user_id = auth.uid();

  -- Back-notification doar la prima rezolvare a unui to-do cu inițiator cunoscut.
  if v_requires and v_status = 'open' and v_actor_txt is not null then
    v_actor := v_actor_txt::uuid;
    if v_actor <> auth.uid() then
      select email, raw_app_meta_data->>'role'
        into v_email, v_role
      from auth.users where id = auth.uid();

      v_role_lbl := case v_role
        when 'owner' then 'owner'
        when 'admin' then 'admin'
        when 'manager' then 'manager'
        when 'front_desk' then 'recepție'
        when 'teacher' then 'instructor'
        else coalesce(v_role, 'staff')
      end;

      v_body := coalesce(nullif(btrim(p_raspuns), ''), 'Verificat și confirmat.')
                || format(' — %s (%s)', coalesce(v_email, 'staff'), v_role_lbl);

      insert into notifications (recipient_user_id, kind, title, body, payload)
      values (
        v_actor,
        'request_resolved',
        v_title,
        v_body,
        jsonb_build_object(
          'client', v_payload->>'client',
          'original_kind', v_kind,
          'resolved_by_email', v_email,
          'raspuns', nullif(btrim(p_raspuns), '')
        )
      );
    end if;
  end if;
end;
$$;

grant execute on function notifications_resolve(uuid, text) to authenticated;
