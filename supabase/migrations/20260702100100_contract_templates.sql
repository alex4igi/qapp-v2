-- Modul Contracte — M2: template-uri PDF versionate per sezon.
--
-- `fields` = definițiile câmpurilor plasate pe PDF, coordonate normalizate 0..1
-- cu originea SUS-STÂNGA (independent de rezoluția de randare; pdf-lib convertește
-- la origine jos-stânga la generare):
--   { key, label, type: 'text'|'date'|'checkbox'|'signature'|'copii_table',
--     source: 'familie.reprezentant'|'familie.cnp'|'familie.adresa'|'familie.ci'|
--             'familie.telefon'|'familie.email'|'copil.nume'|'manual'|'azi',
--     required, editable, page, x, y, w, h, fontSize }
--
-- Imutabilitate probatorie: după prima trimitere (`locked_at`) template-ul devine
-- read-only pe pdf/fields — altfel nu putem dovedi ce text a semnat o familie.
-- Modificare = rând nou cu versiune+1.

create table contract_templates (
  id                uuid primary key default gen_random_uuid(),
  tip               text not null check (tip in ('contract_educational', 'act_aditional', 'tabara', 'trupa')),
  sezon             uuid references sezoane(id) on delete set null,
  nume              text not null,
  versiune          int not null default 1,
  pdf_storage_path  text not null,          -- bucket privat 'contracte-templates'
  fields            jsonb not null default '[]',
  locked_at         timestamptz,
  activ             boolean not null default true,
  valabilitate_zile int not null default 30,
  created_by        uuid default auth.uid(),
  created           timestamptz not null default now(),
  updated           timestamptz not null default now(),
  unique (tip, sezon, versiune)
);

alter table contract_templates enable row level security;

create policy contract_templates_select_staff on contract_templates
  for select to authenticated using (true);
create policy contract_templates_write_admin on contract_templates
  for all to authenticated using (is_admin()) with check (is_admin());

-- gard imutabilitate după lock
create or replace function _contract_template_lock_guard()
returns trigger
language plpgsql
as $$
begin
  if old.locked_at is not null
     and (new.pdf_storage_path is distinct from old.pdf_storage_path
          or new.fields is distinct from old.fields) then
    raise exception 'Template blocat (are contracte trimise). Creează o versiune nouă.';
  end if;
  new.updated = now();
  return new;
end;
$$;

create trigger trg_contract_template_lock
  before update on contract_templates
  for each row execute function _contract_template_lock_guard();

-- Bucket-uri Storage private (idempotent). Acces: doar service_role + signed URLs
-- generate de edge functions; niciun policy public pe storage.objects.
insert into storage.buckets (id, name, public)
values ('contracte-templates', 'contracte-templates', false),
       ('contracte', 'contracte', false)
on conflict (id) do nothing;
