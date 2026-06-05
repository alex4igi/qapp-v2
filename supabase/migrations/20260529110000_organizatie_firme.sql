-- Qapp v2 — Tabel firme organizație (înlocuiește hardcoded din OrganizatiePage).
-- CRUD owner-only.

create table if not exists organizatie_firme (
  id              uuid primary key default gen_random_uuid(),
  nume            text not null,
  cui             text,
  registru_comert text,
  capital         numeric,
  observatii      text,
  created         timestamptz not null default now(),
  updated         timestamptz not null default now()
);

create index if not exists idx_organizatie_firme_nume on organizatie_firme(nume);

drop trigger if exists trg_organizatie_firme_updated on organizatie_firme;
create trigger trg_organizatie_firme_updated
  before update on organizatie_firme
  for each row execute function set_updated_timestamp();

-- Seed cu firmele actuale (idempotent — doar dacă nu există deja)
insert into organizatie_firme (nume, cui, registru_comert)
select 'Quasar Dance SRL', '40569057', 'J22/654/2019'
where not exists (select 1 from organizatie_firme where cui = '40569057');

insert into organizatie_firme (nume, cui, registru_comert)
select 'Quasar Dance Studio SRL', '49361270', 'J22/15/2024'
where not exists (select 1 from organizatie_firme where cui = '49361270');

-- ============================================================
-- RLS — owner only pentru write; toți staff-ul citește
-- ============================================================
alter table organizatie_firme enable row level security;

drop policy if exists organizatie_firme_select on organizatie_firme;
create policy organizatie_firme_select on organizatie_firme
  for select using (true);

drop policy if exists organizatie_firme_owner_write on organizatie_firme;
create policy organizatie_firme_owner_write on organizatie_firme
  for all
  using (
    coalesce(
      (auth.jwt() -> 'app_metadata' ->> 'role'),
      (auth.jwt() ->> 'role')
    ) = 'owner'
  )
  with check (
    coalesce(
      (auth.jwt() -> 'app_metadata' ->> 'role'),
      (auth.jwt() ->> 'role')
    ) = 'owner'
  );
