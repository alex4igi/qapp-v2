-- Qapp v2 — Email logs (mirror sms_logs).
--
-- Folosit pentru:
-- 1. Dedup: same (lead_id, tip) → un singur email trimis.
-- 2. Audit: cine a primit ce și când.
-- 3. Diagnostics: erori provider stocate pentru investigație.
--
-- În 2026 singurul caller activ e auto-reply-ul widget-ului de pe quasardance.ro
-- (vezi intake-website-lead). Restul rămâne ca infrastructură pentru 2027.

create table if not exists email_logs (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid references leads(id) on delete set null,
  client_id    uuid references clienti(id) on delete set null,
  familia_id   uuid references familii(id) on delete set null,
  to_email     text not null,
  tip          text not null,           -- 'auto_reply_widget', 'restante_*', etc.
  subject      text,
  status       text not null,           -- 'trimis' | 'stub' | 'esuat' | 'opt_out'
  message_id   text,                    -- ID returnat de provider
  error        text,
  trimis_la    timestamptz not null default now()
);

create index if not exists idx_email_logs_lead on email_logs(lead_id);
create index if not exists idx_email_logs_client on email_logs(client_id);
create index if not exists idx_email_logs_familia on email_logs(familia_id);
create index if not exists idx_email_logs_tip on email_logs(tip, trimis_la);
-- Dedup: previne trimitere dublă pe același (lead, tip) cu status='trimis'.
create unique index if not exists uq_email_logs_lead_tip_trimis
  on email_logs(lead_id, tip)
  where status = 'trimis' and lead_id is not null;

alter table email_logs enable row level security;

-- Read: orice utilizator autentificat (folosit din UI Studio pentru audit).
drop policy if exists email_logs_select on email_logs;
create policy email_logs_select on email_logs
  for select using (auth.role() = 'authenticated');

-- Write: doar service role (edge functions). RLS-ul exclude clienții.
drop policy if exists email_logs_insert on email_logs;
create policy email_logs_insert on email_logs
  for insert with check (auth.role() = 'service_role');

drop policy if exists email_logs_update on email_logs;
create policy email_logs_update on email_logs
  for update using (auth.role() = 'service_role');

grant select on email_logs to authenticated;
