-- Zonă interzisă SMS (quiet hours) — 19:30..10:00 local, editabilă din Setări.
-- Infrastructură:
--   1) coada `sms_amanate` — pentru căile de SMS FĂRĂ retry propriu (followup /
--      waiting_list din send-lead-sms, batch-ul manual din process-sms-queue).
--      Mesajul e PRE-COMPUS în rând; un drain (process-sms-amanate, ~1 min) îl
--      trimite după ce iese din fereastra interzisă.
--   2) rândul de config `sms_quiet_hours` în parametri_aplicatie (citit de edge fn).
--   3) status nou 'Amanat' la situatie_sms_uri — rândurile manuale preluate de coada
--      de noapte ies din 'De trimis' ca să nu fie re-procesate.
-- Cozile care AU deja retry (confirmari_programare_sms / confirmari_review_sms) NU
-- folosesc tabelul ăsta — drain-ul lor împinge doar send_after spre dimineață.

create table if not exists sms_amanate (
  id          uuid primary key default gen_random_uuid(),
  telefon     text not null,
  mesaj       text not null,
  tip         text,                         -- 'followup' | 'waiting_list' | 'manual' | …
  lead_id     uuid references leads(id) on delete set null,
  send_after  timestamptz not null default now(),
  status      text not null default 'in_asteptare',  -- in_asteptare | trimis | esuat
  error       text,
  trimis_la   timestamptz,
  created     timestamptz not null default now()
);

-- Drenare eficientă: rânduri scadente, neprocesate.
create index if not exists idx_sms_amanate_due
  on sms_amanate (status, send_after);

alter table sms_amanate enable row level security;

-- Scrierea reală se face cu service_role (bypass RLS) din edge functions; politicile
-- permisive sunt pentru o eventuală vizualizare/debug din UI de către staff.
drop policy if exists sms_amanate_insert_staff on sms_amanate;
create policy sms_amanate_insert_staff
  on sms_amanate for insert to authenticated
  with check (true);

drop policy if exists sms_amanate_select_staff on sms_amanate;
create policy sms_amanate_select_staff
  on sms_amanate for select to authenticated
  using (true);

-- Status nou pentru batch-urile manuale preluate de coada de noapte.
alter type status_sms add value if not exists 'Amanat';

-- Config quiet hours (default: pornit, 19:30..10:00). Citit de edge functions din
-- _shared/quietHours.ts; editabil din Setări (scriere doar admin/owner via RLS).
insert into parametri_aplicatie (titlu, valoare)
select 'sms_quiet_hours', '{"enabled":true,"start":"19:30","end":"10:00"}'
where not exists (
  select 1 from parametri_aplicatie where titlu = 'sms_quiet_hours'
);
