-- Qapp v2 — Notificări in-app pentru owner/admin.
-- MVP: digest săptămânal cu activitatea echipei (audit log filtrat pe manager/admin).
-- Extensibil pentru alte tipuri (lead nou ne-contactat, restanță critică, etc.).

-- ============================================================
-- 1) Tabel
-- ============================================================
create table notifications (
  id                 uuid primary key default gen_random_uuid(),
  recipient_user_id  uuid not null references auth.users(id) on delete cascade,
  kind               text not null,
  title              text not null,
  body               text,
  payload            jsonb,
  read_at            timestamptz,
  created_at         timestamptz not null default now()
);

create index idx_notif_recipient on notifications(recipient_user_id);
create index idx_notif_unread    on notifications(recipient_user_id) where read_at is null;
create index idx_notif_kind      on notifications(kind);
create index idx_notif_created   on notifications(created_at desc);

-- ============================================================
-- 2) RLS
-- ============================================================
alter table notifications enable row level security;

-- Self: vede + marchează propriile notificări ca citite
create policy notifications_self_select on notifications
  for select to authenticated using (recipient_user_id = auth.uid());

create policy notifications_self_update on notifications
  for update to authenticated
  using (recipient_user_id = auth.uid())
  with check (recipient_user_id = auth.uid());

-- Self: poate șterge propriile notificări (curățare)
create policy notifications_self_delete on notifications
  for delete to authenticated
  using (recipient_user_id = auth.uid());

-- Admin/owner: pot insera (folosit de RPC + manual)
create policy notifications_admin_insert on notifications
  for insert to authenticated
  with check (is_admin());

-- ============================================================
-- 3) RPC: dispatch digest săptămânal manager/admin activity
-- ============================================================
-- Aggregează audit_log din ultimele 7 zile (filtrat la actor_role IN admin/manager)
-- și creează câte o notificare pentru fiecare owner+admin.
-- Idempotent: dacă a rulat deja în ultimele 6 zile, sare peste.
create or replace function audit_digest_dispatch_weekly()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_since timestamptz := now() - interval '7 days';
  v_count integer := 0;
  v_recipient uuid;
  v_total integer;
  v_already integer;
  v_payload jsonb;
begin
  -- Acces: doar cron (no auth) sau admin/owner manual
  if auth.uid() is not null and not is_admin() then
    raise exception 'Access denied';
  end if;

  -- Idempotență: dacă există deja un digest creat în ultimele 6 zile, sare
  select count(*) into v_already
  from notifications
  where kind = 'audit_digest_weekly'
    and created_at >= now() - interval '6 days';
  if v_already > 0 then
    return 0;
  end if;

  -- Total acțiuni manager/admin în ultimele 7 zile
  select count(*) into v_total
  from audit_log
  where created >= v_since
    and actor_role in ('admin', 'manager');

  if v_total = 0 then
    return 0;
  end if;

  -- Detalii agregate per (acțiune, actor_role)
  select jsonb_build_object(
    'since', v_since,
    'until', now(),
    'total_actions', v_total,
    'by_action', coalesce(jsonb_agg(row_data order by (row_data->>'count')::int desc), '[]'::jsonb)
  )
  into v_payload
  from (
    select jsonb_build_object(
      'action', action,
      'actor_role', actor_role,
      'count', cnt
    ) as row_data
    from (
      select action, actor_role, count(*) as cnt
      from audit_log
      where created >= v_since
        and actor_role in ('admin', 'manager')
      group by action, actor_role
    ) g
  ) s;

  -- Pentru fiecare owner+admin, creează o notificare
  for v_recipient in
    select id from auth.users
    where raw_app_meta_data->>'role' in ('owner', 'admin')
  loop
    insert into notifications (recipient_user_id, kind, title, body, payload)
    values (
      v_recipient,
      'audit_digest_weekly',
      format('Activitate echipă: %s acțiuni săptămâna trecută', v_total),
      'Verifică pagina Audit pentru detalii (cine, ce, când, motiv).',
      v_payload
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function audit_digest_dispatch_weekly() to authenticated;

-- ============================================================
-- 4) Helper RPC: counts unread pentru badge
-- ============================================================
create or replace function notifications_unread_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(count(*)::int, 0)
  from notifications
  where recipient_user_id = auth.uid()
    and read_at is null;
$$;

grant execute on function notifications_unread_count() to authenticated;

-- ============================================================
-- 5) Helper RPC: marchează toate notificările proprii ca citite
-- ============================================================
create or replace function notifications_mark_all_read()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update notifications
    set read_at = now()
    where recipient_user_id = auth.uid()
      and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function notifications_mark_all_read() to authenticated;
