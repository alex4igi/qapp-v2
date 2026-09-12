-- Canal de bug-uri/idei pentru MEMBRII din portal (qapp-membri), triat în același
-- `/feedback-app` ca feedback-ul intern al staff-ului.
--
-- De ce coloane pe tabelul existent și nu un tabel nou: `app_feedback` are deja gardurile
-- `deny_parinte_direct` și `deny_marketing_direct`; un tabel nou ar trebui să le primească
-- manual (regula din CLAUDE.md) și ar dubla trierea.
--
-- ⚠️ Capcană: `app_feedback.autor_user_id` are FK spre auth.users(id) cu default auth.uid().
-- Pentru un cont de portal, auth.uid() = portal_accounts.id, care NU există în auth.users →
-- insertul ar pica pe FK. De aceea RPC-ul scrie explicit `autor_user_id = null` și ține
-- identitatea în `autor_portal_account_id`.

-- ============================================================
-- 1) Coloane
-- ============================================================
create type app_feedback_sursa as enum ('staff', 'portal');

alter table app_feedback
  add column sursa                   app_feedback_sursa not null default 'staff',
  add column autor_portal_account_id uuid references portal_accounts(id) on delete set null,
  add column autor_client_id         uuid references clienti(id)         on delete set null;

create index idx_app_feedback_sursa on app_feedback(sursa, created desc);

-- ============================================================
-- 2) RPC de trimitere din portal
--   Rolul `parinte` nu atinge direct niciun tabel (deny_parinte_direct) → SECURITY DEFINER.
-- ============================================================
create or replace function submit_app_feedback_portal(
  p_tip        text,
  p_titlu      text,
  p_detalii    text default null,
  p_pagina     text default null,
  p_user_agent text default null,
  p_client     uuid default null
)
returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_email  text;
  v_recent integer;
  v_id     uuid;
begin
  if not is_parinte() then
    raise exception 'forbidden';
  end if;

  select email into v_email
  from portal_accounts
  where id = auth.uid() and status = 'active';
  if v_email is null then
    raise exception 'forbidden';
  end if;

  if p_tip not in ('Bug', 'Idee', 'Intrebare') then
    raise exception 'tip invalid';
  end if;
  if nullif(btrim(p_titlu), '') is null then
    raise exception 'Scrie pe scurt despre ce e vorba.';
  end if;
  -- clientul e opțional (context: pe care membru era comutat), dar dacă vine, e al lui
  if p_client is not null and p_client not in (select client_member_ids()) then
    raise exception 'forbidden';
  end if;

  -- portalul nu are captcha; singura plasă contra spam-ului
  select count(*) into v_recent
  from app_feedback
  where autor_portal_account_id = auth.uid()
    and created > now() - interval '1 hour';
  if v_recent >= 5 then
    raise exception 'Ai trimis deja mai multe mesaje in ultima ora. Revino putin mai tarziu.';
  end if;

  insert into app_feedback (
    autor_user_id, autor_portal_account_id, autor_client_id, autor_email,
    sursa, tip, titlu, detalii, pagina, user_agent
  ) values (
    null, auth.uid(), p_client, v_email,
    'portal', p_tip::app_feedback_tip,
    left(btrim(p_titlu), 160),
    left(nullif(btrim(p_detalii), ''), 4000),
    left(nullif(btrim(p_pagina), ''), 200),
    left(nullif(btrim(p_user_agent), ''), 400)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function submit_app_feedback_portal(text, text, text, text, text, uuid) from anon, public;
grant  execute on function submit_app_feedback_portal(text, text, text, text, text, uuid) to authenticated;

-- ============================================================
-- 3) Notificarea către owner/admin — marchează sursa
--   Doar funcția, NU triggerul (rămâne cel din 20260605120000).
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
      format(
        'Feedback %s (%s): %s',
        case when new.sursa = 'portal' then 'MEMBRU' else 'app' end,
        v_tip,
        coalesce(nullif(new.titlu, ''), '(fără titlu)')
      ),
      coalesce(new.autor_email, 'cineva')
        || ' • ' || coalesce(nullif(new.pagina, ''), '—'),
      jsonb_build_object(
        'feedback_id', new.id,
        'tip', v_tip,
        'sursa', new.sursa,
        'pagina', new.pagina,
        'autor_email', new.autor_email
      )
    );
  end loop;
  return new;
end;
$$;
