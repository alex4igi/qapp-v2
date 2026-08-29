-- Atribuire pe reclamă + log de intake, pentru reconcilierea CRM ↔ Google/Meta Ads.
--
-- Context: edge function-urile cer deja de la Graph API `ad_id`, `ad_name`,
-- `form_id`, `campaign_id`, dar păstrau doar `campaign_name` (colapsat în
-- `utm_campaign`, uneori numele, alteori id-ul numeric). Toate lead-urile Meta
-- intră sub un singur rând `campanii_promovare` ("Meta Ads"), deci `sursa` nu
-- distinge campaniile — reconcilierea la nivel de campanie/ad set e imposibilă.
--
-- Coloanele sunt GENERICE (nu `meta_*`): aceleași câmpuri servesc Google Ads,
-- unde `gclid` e și precondiția pentru upload de conversii offline.
-- Se populează doar de la deploy încolo — rândurile istorice nu se pot
-- backfill-a fără re-interogare Graph după `extern_id`.
alter table leads
  add column if not exists platform    text,
  add column if not exists campaign_id text,
  add column if not exists ad_id       text,
  add column if not exists ad_name     text,
  add column if not exists adset_id    text,
  add column if not exists adset_name  text,
  add column if not exists form_id     text,
  add column if not exists gclid       text;

create index if not exists idx_leads_campaign_id on leads (campaign_id)
  where campaign_id is not null;

-- Log de intake: un rând la FIECARE eveniment primit, nu doar la cele care produc
-- un lead. Fără el, dedup-ul pe telefon din `insertLead` aruncă tăcut evenimentele
-- repetate: Meta raportează 50, CRM-ul arată 43, iar diferența e inexplicabilă.
-- Cu el, reconcilierea închide: 50 = 43 lead-uri noi + 7 persoane deja în CRM.
create table if not exists leads_intake_log (
  id            uuid primary key default gen_random_uuid(),
  created       timestamptz not null default now(),
  -- de unde a venit evenimentul
  canal         text not null check (canal in ('meta_webhook', 'meta_poller', 'website', 'sheets')),
  -- ce s-a întâmplat cu el
  rezultat      text not null check (rezultat in ('creat', 'duplicat_telefon', 'duplicat_extern_id', 'respins_validare')),
  -- lead-ul CREAT sau, la duplicat, cel EXISTENT cu care s-a făcut match
  lead_id       uuid references leads (id) on delete set null,
  extern_id     text,
  platform      text,
  campaign_id   text,
  campaign_name text,
  ad_id         text,
  ad_name       text,
  adset_id      text,
  adset_name    text,
  form_id       text,
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  telefon       text,
  detalii       jsonb
);

create index if not exists idx_leads_intake_log_created on leads_intake_log (created desc);
create index if not exists idx_leads_intake_log_campanie on leads_intake_log (campaign_id, created desc);

alter table leads_intake_log enable row level security;

-- Scrierea vine exclusiv din edge functions pe service_role (bypass RLS): staff-ul
-- nu are politică de insert/update, logul rămâne imutabil (ca `lead_contacte`).
create policy leads_intake_log_select_all on leads_intake_log
  for select to authenticated using (true);
create policy leads_intake_log_admin_all on leads_intake_log
  for all to authenticated using (is_admin()) with check (is_admin());

-- Gardul obligatoriu pentru conturile de portal (vezi CLAUDE.md + 20260705090000).
create policy deny_parinte_direct on leads_intake_log as restrictive
  for all to authenticated
  using (auth_role() <> 'parinte') with check (auth_role() <> 'parinte');
