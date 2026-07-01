-- Modul Contracte — M4: jurnal probatoriu de evenimente, APPEND-ONLY.
--
-- Acesta e audit trail-ul cu valoare legală (Legea 214/2024: sarcina probei la
-- SES/AdES e a școlii): fiecare pas din viața contractului cu IP, user-agent și
-- timestamp de server. Nimic nu se modifică sau șterge — nici măcar de admin;
-- corecțiile se exprimă ca evenimente noi.

create table contract_events (
  id           bigint generated always as identity primary key,
  contract_id  uuid not null references contracte(id) on delete cascade,
  tip          text not null check (tip in (
    'creat', 'trimis', 'sms_pus_in_coada', 'email_trimis', 'deschis',
    'consimtamant', 'semnat', 'pdf_generat', 'sigilat', 'drive_upload',
    'reminder', 'expirat', 'respins', 'anulat', 'eroare'
  )),
  meta         jsonb,   -- { ip, ua, hash, telefon_mascat, mesaj_eroare, ... }
  created      timestamptz not null default now()
);

create index contract_events_contract_idx on contract_events (contract_id, created);

alter table contract_events enable row level security;

create policy contract_events_select_staff on contract_events
  for select to authenticated using (true);
create policy contract_events_insert_admin on contract_events
  for insert to authenticated with check (is_admin());
-- fără policy de update/delete pentru authenticated + gard hard și pentru service_role:

revoke update, delete on contract_events from authenticated, anon, service_role;

create or replace function _contract_events_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'contract_events este append-only (jurnal probatoriu).';
end;
$$;

create trigger trg_contract_events_immutable
  before update or delete on contract_events
  for each row execute function _contract_events_immutable();
