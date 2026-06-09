-- Qapp v2 — Scorecard call-center, Faza 1: logul hibrid de contacte per lead.
-- Tabel `lead_contacte`: eveniment de business intenționat (canal + rezultat),
-- cu user_id NOT NULL = atribuire curată per operator. Distinct de lead_history
-- (audit-log generat de trigger, poluat de cron cu user_id null).
--
-- Enum-urile sunt GENERICE (fără prefix lead_) — vor fi refolosite de un tabel
-- frate `client_contacte` în Faza 2 (restanțe) / Faza 3 (reactivări).

do $$ begin
  create type canal_contact as enum ('telefon','sms','email','dm');
exception when duplicate_object then null; end $$;

do $$ begin
  create type rezultat_contact as enum ('reusit','follow_up','pierdut');
exception when duplicate_object then null; end $$;

create table if not exists lead_contacte (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references leads(id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users(id),
  canal       canal_contact not null,
  rezultat    rezultat_contact not null,
  observatii  text,
  created     timestamptz not null default now()
);

create index if not exists lead_contacte_user_created_idx
  on lead_contacte(user_id, created);
create index if not exists lead_contacte_lead_idx
  on lead_contacte(lead_id, created desc);

alter table lead_contacte enable row level security;

-- Citire pentru tot staff-ul autentificat (scorecard-ul agregă per operator).
create policy lead_contacte_select on lead_contacte
  for select to authenticated using (true);

-- Inserare doar de staff și doar pe propriul user_id (anti-falsificare atribuire).
create policy lead_contacte_insert on lead_contacte
  for insert to authenticated
  with check (
    auth_role() in ('admin','owner','manager','front_desk')
    and user_id = auth.uid()
  );
