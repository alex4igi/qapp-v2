-- Modul Contracte — M3: instanțe de contract trimise spre semnare.
--
-- Statusuri: draft → trimis → deschis → semnat → finalizat, plus respins/expirat/anulat.
-- `semnat` (părintele a apăsat „Semnează"; valori + semnătură salvate atomic) e separat
-- de `finalizat` (PDF generat + sigilat + Drive + documente_client) ca pipeline-ul de
-- finalizare să fie retriabil fără să blocheze UX-ul părintelui.
--
-- Securitate semnare: stocăm DOAR sha256(token); singurul drum spre 'semnat' e edge
-- function-ul public `contract-public` cu token valid — nu există RPC staff care să
-- completeze semnătura în numele clientului (cerință probatorie).

create table contracte (
  id                      uuid primary key default gen_random_uuid(),
  template_id             uuid not null references contract_templates(id),
  familie_id              uuid not null references familii(id) on delete cascade,
  client_id               uuid references clienti(id) on delete set null,
  gate_id                 uuid references reinscrieri_gate(id) on delete set null,
  campanie_id             uuid references campanii_reinscriere(id) on delete set null,
  status                  text not null default 'draft'
    check (status in ('draft', 'trimis', 'deschis', 'semnat', 'finalizat', 'respins', 'expirat', 'anulat')),
  token_hash              text unique,
  token_expira_la         timestamptz,
  valori                  jsonb,           -- snapshot: prefill + ce a completat părintele
  semnatura_path          text,            -- Storage 'contracte/semnaturi/{id}.png'
  consimtamant_esign_la   timestamptz,
  marketing_optin         boolean,
  motiv_respingere        text,
  pdf_hash_pre            text,
  pdf_hash_final          text,
  pdf_storage_path        text,            -- Storage = buffer/backup permanent
  pdf_drive_link          text,            -- Google Drive = locația canonică
  documente_client_id     uuid references documente_client(id) on delete set null,
  trimis_la               timestamptz,
  deschis_prima_data_la   timestamptz,
  semnat_la               timestamptz,
  finalizat_la            timestamptz,
  reminder_count          int not null default 0,
  last_reminder_la        timestamptz,
  created_by              uuid default auth.uid(),
  created                 timestamptz not null default now(),
  updated                 timestamptz not null default now()
);

create index contracte_familie_idx on contracte (familie_id);
create index contracte_status_idx on contracte (status);
create index contracte_template_idx on contracte (template_id);
create index contracte_gate_idx on contracte (gate_id) where gate_id is not null;
create index contracte_campanie_idx on contracte (campanie_id) where campanie_id is not null;

alter table contracte enable row level security;

-- Staff citește tot; scrierea din app doar admin/owner (trimiterea reală trece prin
-- edge functions cu service_role). Portalul public NU atinge PostgREST pe tabel.
create policy contracte_select_staff on contracte
  for select to authenticated using (true);
create policy contracte_write_admin on contracte
  for all to authenticated using (is_admin()) with check (is_admin());

create or replace function _contracte_touch_updated()
returns trigger
language plpgsql
as $$
begin
  new.updated = now();
  return new;
end;
$$;

create trigger trg_contracte_updated
  before update on contracte
  for each row execute function _contracte_touch_updated();
