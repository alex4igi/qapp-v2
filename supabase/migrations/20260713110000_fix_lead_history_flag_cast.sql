-- Fix trigger log_lead_activity: ramura flag_reminder folosea un CASE care
-- returnează `text`, iar Postgres NU convertește implicit text→enum la INSERT
-- în action_type (lead_action_type). Rezultat: orice UPDATE care schimbă
-- flag_reminder crapa cu "column action_type is of type lead_action_type but
-- expression is of type text", anulând tot update-ul. Efect: flagurile de
-- prioritate pe leads (inclusiv a_venit din cron-evening) nu s-au setat
-- niciodată de la 2026-05-21. Fix: cast explicit ::lead_action_type.

create or replace function log_lead_activity() returns trigger
language plpgsql security definer
as $$
declare
  uid uuid := auth.uid();
begin
  if (tg_op = 'INSERT') then
    insert into lead_history (lead_id, user_id, action_type, new_value)
    values (new.id, uid, 'created', new.status::text);
    return new;
  end if;

  if (new.status is distinct from old.status) then
    insert into lead_history (lead_id, user_id, action_type, old_value, new_value)
    values (new.id, uid, 'status_change', old.status::text, new.status::text);
  end if;

  if (new.sub_status is distinct from old.sub_status) then
    insert into lead_history (lead_id, user_id, action_type, old_value, new_value)
    values (new.id, uid, 'sub_status_change',
            old.sub_status::text, new.sub_status::text);
  end if;

  if (new.flag_reminder is distinct from old.flag_reminder) then
    insert into lead_history (lead_id, user_id, action_type)
    values (new.id, uid,
            (case when new.flag_reminder then 'flag_set' else 'flag_cleared' end)::lead_action_type);
  end if;

  if (new.observatii is distinct from old.observatii) then
    insert into lead_history (lead_id, user_id, action_type, new_value)
    values (new.id, uid, 'note_added', left(coalesce(new.observatii, ''), 500));
  end if;

  return new;
end;
$$;
