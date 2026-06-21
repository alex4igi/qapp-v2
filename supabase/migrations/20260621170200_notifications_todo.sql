-- M5: transformăm notificările dintr-un simplu feed într-un hub care suportă și
-- to-do-uri acționabile (model B: execuția rămâne directă, dar managerul primește
-- itemul în „De făcut" și îl marchează rezolvat după ce-l revizuiește).
-- Generic & extensibil: orice `kind` viitor (ex: cerere de preț) se conectează
-- inserând cu requires_action=true, status='open'.

alter table notifications
  add column if not exists requires_action boolean not null default false,
  add column if not exists status text check (status in ('open', 'resolved')),
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid references auth.users(id);

-- Index pentru lista „De făcut" a fiecărui utilizator.
create index if not exists idx_notif_todo
  on notifications(recipient_user_id)
  where requires_action and status = 'open';

-- ============================================================
-- notify_enrollment_move: marchează itemul ca to-do acționabil și
-- adaugă `client` în payload pentru deep-link la fișa clientului.
-- ============================================================
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
  v_client_id uuid;
  v_from      text;
  v_to        text;
  v_recipient uuid;
  v_count     integer := 0;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  select c.id, trim(coalesce(c.nume, '') || ' ' || coalesce(c.prenume, ''))
    into v_client_id, v_client
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
    insert into notifications (
      recipient_user_id, kind, title, body, payload, requires_action, status
    )
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
        'client', v_client_id,
        'from_curs', p_from_curs,
        'to_curs', p_to_curs,
        'actor', v_actor
      ),
      true,
      'open'
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function notify_enrollment_move(uuid, uuid, uuid, text) to authenticated;

-- ============================================================
-- RPC: marchează o notificare-to-do proprie ca rezolvată.
-- ============================================================
create or replace function notifications_resolve(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update notifications
    set status = 'resolved',
        resolved_at = now(),
        resolved_by = auth.uid(),
        read_at = coalesce(read_at, now())
    where id = p_id
      and recipient_user_id = auth.uid();
  if not found then
    raise exception 'Notificare inexistentă sau nu îți aparține';
  end if;
end;
$$;

grant execute on function notifications_resolve(uuid) to authenticated;

-- ============================================================
-- Backfill: notificările de mutare deja existente devin to-do deschise,
-- ca managerul (care abia acum are acces la /notificări) să le poată tria.
-- ============================================================
update notifications
  set requires_action = true,
      status = 'open'
  where kind = 'enrollment_move'
    and resolved_at is null;
