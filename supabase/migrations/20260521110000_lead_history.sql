-- Qapp v2 — Faza 3: jurnal de activitate per lead (activity log).
-- Tabel lead_history + trigger pe `leads` care înregistrează automat
-- schimbările de status / sub_status / flag / observații.

-- ============================================================
-- 1. Enum tip acțiune
-- ============================================================
do $$ begin
  create type lead_action_type as enum (
    'created', 'status_change', 'sub_status_change', 'sms_sent',
    'note_added', 'field_edit', 'flag_set', 'flag_cleared', 'assigned'
  );
exception
  when duplicate_object then null;
end $$;

-- ============================================================
-- 2. Tabel lead_history
-- ============================================================
create table if not exists lead_history (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references leads(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  action_type lead_action_type not null,
  old_value   text,
  new_value   text,
  payload     jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists lead_history_lead_idx
  on lead_history(lead_id, created_at desc);

alter table lead_history enable row level security;

create policy lead_history_select on lead_history
  for select to authenticated using (true);
create policy lead_history_insert on lead_history
  for insert to authenticated with check (true);

-- ============================================================
-- 3. Trigger — loghează automat schimbările pe `leads`
-- ============================================================
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

  -- UPDATE — câte un rând per câmp relevant schimbat.
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
            case when new.flag_reminder then 'flag_set' else 'flag_cleared' end);
  end if;

  if (new.observatii is distinct from old.observatii) then
    insert into lead_history (lead_id, user_id, action_type, new_value)
    values (new.id, uid, 'note_added', left(coalesce(new.observatii, ''), 500));
  end if;

  return new;
end;
$$;

drop trigger if exists trg_log_lead_activity on leads;
create trigger trg_log_lead_activity
  after insert or update on leads
  for each row execute function log_lead_activity();
