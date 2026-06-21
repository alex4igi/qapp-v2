-- Confirmare inrolare recurenta prin SMS, cu fereastra de undo de 5 minute.
-- Flow:
--   1) La crearea unei inrolari recurente, frontend-ul insereaza un rand aici
--      (send_after = now() + 5 min).
--   2) Edge function cron-confirmari-sms dreneaza periodic randurile scadente:
--      re-verifica ca inrolarea e inca activa, compune mesajul si il trimite.
-- Daca inrolarea e stearsa in interval (greseala), randul dispare prin ON DELETE
-- CASCADE; daca e reziliata, drain-ul o marcheaza 'anulat' fara sa trimita.

-- 1) Link grup WhatsApp pe curs (completat manual din profilul cursului).
alter table cursuri add column if not exists link_whatsapp text;

-- 2) Coada de confirmari programate.
create table if not exists confirmari_inrolare_sms (
  id            uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references enrollments(id) on delete cascade,
  status        text not null default 'programat',  -- programat | trimis | anulat | esuat
  send_after    timestamptz not null default now() + interval '5 minutes',
  telefon       text,
  mesaj         text,
  error         text,
  trimis_la     timestamptz,
  created       timestamptz not null default now()
);

-- O singura confirmare per inrolare (anti dublu-submit).
create unique index if not exists uq_confirmari_inrolare_enrollment
  on confirmari_inrolare_sms (enrollment_id);

-- Drenare eficienta: randuri scadente, neprocesate.
create index if not exists idx_confirmari_inrolare_due
  on confirmari_inrolare_sms (status, send_after);

alter table confirmari_inrolare_sms enable row level security;

-- Staff autentificat poate programa o confirmare (insert) si o poate inspecta
-- (select). Trimiterea efectiva o face drain-ul cu service_role (bypass RLS).
create policy confirmari_inrolare_insert_staff
  on confirmari_inrolare_sms for insert to authenticated
  with check (true);

create policy confirmari_inrolare_select_staff
  on confirmari_inrolare_sms for select to authenticated
  using (true);
