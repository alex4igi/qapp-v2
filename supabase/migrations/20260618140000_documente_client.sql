-- Documente client (faza 1): linkuri Google Drive clicabile, tipizate.
-- Fișierele rămân în Drive; aici stocăm doar linkul + tipul + expirarea.
-- Upload direct în Drive = faza 2 (peste aceeași structură).
create type tip_document as enum (
  'Contract', 'Anexa', 'Reziliere', 'Medical', 'Declaratie', 'Altul'
);

create table documente_client (
  id            uuid primary key default gen_random_uuid(),
  client        uuid not null references clienti(id) on delete cascade,
  tip           tip_document not null default 'Altul',
  titlu         text,
  link          text not null,
  data_expirarii date,
  observatii    text,
  created       timestamptz not null default now(),
  created_by    uuid default auth.uid()
);

create index documente_client_client_idx on documente_client (client);

alter table documente_client enable row level security;

-- Toți autentificații văd documentele; staff-ul (inclusiv front_desk) le poate
-- gestiona. Gating-ul fin pe cine vede tab-ul se face în UI.
create policy documente_client_select_all on documente_client
  for select to authenticated using (true);
create policy documente_client_write_all on documente_client
  for all to authenticated using (true) with check (true);
