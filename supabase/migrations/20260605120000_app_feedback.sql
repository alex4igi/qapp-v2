-- Qapp v2 — Feedback intern despre APLICAȚIE (bug-uri + idei de la testeri/staff).
-- Distinct de tabelul `feedback` (acela = sesizări/review-uri ale clienților despre cursuri).
-- Flux: oricine logat trimite din butonul 💬 din header → ajunge la owner/admin
-- (notificare in-app) → owner/admin triază (status) și răspunde; autorul își vede
-- propriul feedback + răspunsul.

-- ============================================================
-- 1) Enums
-- ============================================================
create type app_feedback_tip    as enum ('Bug', 'Idee', 'Intrebare');
create type app_feedback_status as enum ('Nou', 'In lucru', 'Planificat', 'Rezolvat', 'Respins');

-- ============================================================
-- 2) Tabel
-- ============================================================
create table app_feedback (
  id             uuid primary key default gen_random_uuid(),
  autor_user_id  uuid references auth.users(id) on delete set null default auth.uid(),
  autor_email    text,                                   -- denormalizat (auth.users nu e ușor de join-uit din client)
  tip            app_feedback_tip not null,
  titlu          text not null,
  detalii        text,
  pagina         text,                                   -- ruta din care s-a trimis (window.location.pathname)
  user_agent     text,                                   -- browser/device, util la reproducere bug
  status         app_feedback_status not null default 'Nou',
  raspuns        text,                                   -- răspunsul owner/admin către autor
  created        timestamptz not null default now(),
  updated        timestamptz not null default now()
);

create index idx_app_feedback_status  on app_feedback(status);
create index idx_app_feedback_created on app_feedback(created desc);
create index idx_app_feedback_autor   on app_feedback(autor_user_id);

create trigger trg_app_feedback_updated
  before update on app_feedback
  for each row execute function set_updated_timestamp();

-- ============================================================
-- 3) RLS
--   - select: autorul își vede propriile rânduri; admin/owner văd tot
--   - insert: orice user autentificat, doar pe numele lui (autor_user_id = self)
--   - update/delete: doar admin/owner (triere + răspuns + ștergere)
-- ============================================================
alter table app_feedback enable row level security;

create policy app_feedback_select on app_feedback
  for select to authenticated
  using (autor_user_id = auth.uid() or is_admin());

create policy app_feedback_insert_self on app_feedback
  for insert to authenticated
  with check (autor_user_id = auth.uid());

create policy app_feedback_admin_update on app_feedback
  for update to authenticated
  using (is_admin()) with check (is_admin());

create policy app_feedback_admin_delete on app_feedback
  for delete to authenticated
  using (is_admin());

-- ============================================================
-- 4) Trigger: la feedback nou, notifică toți owner+admin
--   SECURITY DEFINER ca să poată insera în `notifications` chiar și când
--   autorul e front_desk/teacher (RLS de insert pe notifications cere is_admin()).
-- ============================================================
create or replace function notify_admins_new_app_feedback()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient uuid;
  v_tip text := new.tip::text;
begin
  for v_recipient in
    select id from auth.users
    where raw_app_meta_data->>'role' in ('owner', 'admin')
  loop
    insert into notifications (recipient_user_id, kind, title, body, payload)
    values (
      v_recipient,
      'app_feedback_new',
      format('Feedback (%s): %s', v_tip, coalesce(nullif(new.titlu, ''), '(fără titlu)')),
      coalesce(new.autor_email, 'cineva')
        || ' • ' || coalesce(nullif(new.pagina, ''), '—'),
      jsonb_build_object(
        'feedback_id', new.id,
        'tip', v_tip,
        'pagina', new.pagina,
        'autor_email', new.autor_email
      )
    );
  end loop;
  return new;
end;
$$;

create trigger trg_app_feedback_notify
  after insert on app_feedback
  for each row execute function notify_admins_new_app_feedback();
