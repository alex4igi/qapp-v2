-- Qapp v2 — Audit log pentru acțiuni sensibile.
-- Scriere: override preț, modificare/ștergere încasare, reziliere înrolare,
-- ștergere lead, mutare copii, modificări date sensibile client (faza 2).
-- Vizualizare: owner + admin = global, manager = doar locația lui.

-- ============================================================
-- 1) Tabel
-- ============================================================
create table audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references auth.users(id) on delete set null,
  actor_role  text not null,
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  old_value   jsonb,
  new_value   jsonb,
  reason      text,
  locatie_id  uuid references locatii(id) on delete set null,
  created     timestamptz not null default now()
);

create index idx_audit_log_actor   on audit_log(actor_id);
create index idx_audit_log_action  on audit_log(action);
create index idx_audit_log_entity  on audit_log(entity_type, entity_id);
create index idx_audit_log_created on audit_log(created desc);
create index idx_audit_log_locatie on audit_log(locatie_id);

-- ============================================================
-- 2) RLS
-- ============================================================
alter table audit_log enable row level security;

-- admin/owner: vede tot
create policy audit_log_admin_all on audit_log
  for all to authenticated
  using (is_admin()) with check (is_admin());

-- manager: vede acțiunile la locația lui
create policy audit_log_manager_select on audit_log
  for select to authenticated
  using (is_manager() and is_in_my_locatie(locatie_id));

-- toți autentificații pot scrie audit doar pentru propriile acțiuni
create policy audit_log_self_insert on audit_log
  for insert to authenticated
  with check (actor_id = auth.uid());

-- ============================================================
-- 3) RPC pentru log audit (umple automat actor_id + actor_role)
-- ============================================================
create or replace function audit_log_record(
  p_action       text,
  p_entity_type  text,
  p_entity_id    uuid default null,
  p_old_value    jsonb default null,
  p_new_value    jsonb default null,
  p_reason       text default null,
  p_locatie_id   uuid default null
) returns audit_log
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row audit_log;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into audit_log (
    actor_id, actor_role, action, entity_type, entity_id,
    old_value, new_value, reason, locatie_id
  ) values (
    auth.uid(), auth_role(), p_action, p_entity_type, p_entity_id,
    p_old_value, p_new_value, p_reason, p_locatie_id
  ) returning * into v_row;

  return v_row;
end;
$$;

grant execute on function audit_log_record(text, text, uuid, jsonb, jsonb, text, uuid) to authenticated;
