-- Qapp v2 — remodelarea tabelului `leads` la pipeline-ul CRM complet din proiectul qleads.
-- Înlocuiește enum-ul slab de status (4 valori) cu pipeline-ul de 9 coloane și adaugă
-- câmpurile de CRM (sub_status, flag_reminder, nr_contactari, programare, etc.).
-- `sursa` rămâne FK către campanii_promovare. Tabelul `leads` este gol — fără risc de date.

-- ============================================================
-- 1. STATUS: 4 valori -> pipeline 9 coloane
-- ============================================================
alter table leads alter column status drop default;
alter table leads alter column status type text using status::text;
drop type status_lead;
create type status_lead as enum (
  'nou', 'contactat', 'waiting_list', 'programat',
  'a_venit', 'nu_a_venit', 'convertit', 'pierdut', 'nurture'
);
alter table leads
  alter column status type status_lead using status::status_lead,
  alter column status set default 'nou',
  alter column status set not null;

-- ============================================================
-- 2. INTERES: enum aliniat cu cursurile reale Quasar
-- ============================================================
alter table leads alter column interes type text using interes::text;
drop type interes_lead;
create type interes_lead as enum (
  'Street Dance', 'K-pop', 'Gimnastică', 'Zumba',
  'Acrobatică', 'Quasar for Kids', 'Altceva'
);
alter table leads alter column interes type interes_lead using interes::interes_lead;

-- ============================================================
-- 3. ENUM-uri noi
-- ============================================================
create type sub_status_lead as enum ('de_revenit', 'nu_raspunde');
create type grupa_lead as enum (
  'Tiny', 'Junior', 'Varsity', 'Teens', 'Students', 'Adults'
);

-- ============================================================
-- 4. Câmpuri CRM noi pe `leads`
-- ============================================================
alter table leads
  add column prenume          text,
  add column sub_status       sub_status_lead,
  add column motiv_pierdut    text,
  add column flag_reminder    boolean not null default false,
  add column flag_reminder_at timestamptz,
  add column nr_contactari    integer not null default 0,
  add column curs_interes     text,
  add column grupa_varsta     grupa_lead,
  add column data_programare  timestamptz,
  add column a_venit          boolean,
  add column data_conversie   timestamptz,
  add column responsabil_id   uuid references auth.users(id) on delete set null;

create index idx_leads_data_programare on leads(data_programare);
create index idx_leads_flag_reminder on leads(flag_reminder);

-- ============================================================
-- 5. Tabel sms_logs (dedup SMS)
-- ============================================================
create table sms_logs (
  id        uuid primary key default gen_random_uuid(),
  lead_id   uuid references leads(id) on delete cascade,
  tip       text not null,
  telefon   text,
  mesaj     text,
  trimis_la timestamptz not null default now()
);
create index sms_logs_lead_tip on sms_logs(lead_id, tip);

alter table sms_logs enable row level security;
create policy sms_logs_select_all on sms_logs
  for select to authenticated using (true);
create policy sms_logs_insert on sms_logs
  for insert to authenticated with check (true);
create policy sms_logs_admin_all on sms_logs
  for all to authenticated using (is_admin()) with check (is_admin());
