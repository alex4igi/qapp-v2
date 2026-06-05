-- Qapp v2 — Faza 1 a redesign-ului funnelului de lead-uri.
-- Vezi planul: ~/.claude/plans/vreau-sa-discutam-despre-synchronous-candle.md (secțiunea A).
-- Tabelul `leads` este de dezvoltare (date de test) — fără risc de date reale.

-- ============================================================
-- 1. leads: drop `a_venit` bool — sursă unică de adevăr = `status`
-- ============================================================
alter table leads drop column if exists a_venit;

-- ============================================================
-- 2. leads: câmpuri noi pentru logica de contactare + flaguri
-- ============================================================
alter table leads
  -- setat când sub_status devine de_revenit / nu_raspunde
  add column if not exists ultima_contactare_la timestamptz,
  -- când leadul cere / promite să fie contactat (sub_status = de_revenit)
  add column if not exists data_callback_dorit  timestamptz,
  -- contor flaguri succesive ignorate; >=2 → auto-Nurture (cron-evening)
  add column if not exists flag_streak          integer not null default 0;

-- ============================================================
-- 3. programari_leads: marcaj prezență (rosterul afișează doar `programat`)
-- ============================================================
do $$ begin
  create type prezenta_lead as enum ('programat', 'prezent', 'absent');
exception
  when duplicate_object then null;
end $$;

alter table programari_leads
  add column if not exists prezenta prezenta_lead not null default 'programat';

-- ============================================================
-- 4. sms_logs: logare eșecuri (status + error). Dedupe ia doar `sent`.
-- ============================================================
alter table sms_logs
  add column if not exists status text not null default 'sent',
  add column if not exists error  text;
