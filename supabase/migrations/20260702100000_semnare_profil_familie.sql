-- Modul Contracte (semnare electronică) — M1: profil de semnare pe familie.
--
-- Date sensibile (CNP, adresă, CI) cerute de contract dar absente din `familii`.
-- Tabel separat, NU coloane pe `familii`: `familii` e citit peste tot în app,
-- iar RLS pe tabel dedicat e mai strict decât column privileges. Părintele le
-- completează O DATĂ la prima semnare; documentele următoare vin precompletate.
-- Pagina publică de semnare nu citește tabelul prin PostgREST — edge function-ul
-- `contract-public` (service role) injectează precompletările în răspunsul de load.

create table familii_date_semnatar (
  familie_id        uuid primary key references familii(id) on delete cascade,
  cnp               text,
  adresa            text,
  ci_serie          text,
  ci_numar          text,
  ci_eliberat_de    text,
  ci_eliberat_la    date,
  actualizat_la     timestamptz not null default now(),
  actualizat_sursa  text check (actualizat_sursa in ('semnare', 'staff'))
);

alter table familii_date_semnatar enable row level security;

-- Doar admin/owner citesc și scriu din app; edge functions folosesc service_role
-- (bypass RLS). Retenție: datele se șterg la cererea GDPR sau după expirarea
-- ultimului contract + termenul de prescripție (3 ani) — cleanup manual/cron viitor.
create policy familii_date_semnatar_admin on familii_date_semnatar
  for all to authenticated using (is_admin()) with check (is_admin());
