-- Qapp v2 — contor neprezentări per lead + regula „a 2-a neprezentare → nurture".
--
-- Sursa de adevăr = numărul de programări absente (programari_leads.prezenta='absent').
-- Menținut automat de un trigger, ca UI-ul și logica de tranziție să-l citească direct.
--
-- Regulă produs (2026-07-01):
--   * 1-a neprezentare → nu_a_venit (primește SMS followup).
--   * 2-a neprezentare (după reprogramare) → direct nurture, FĂRĂ SMS.

alter table leads
  add column if not exists nr_neprezentari integer not null default 0;

-- Recalculează contorul lead-ului afectat la orice schimbare de prezență.
create or replace function sync_lead_neprezentari()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_lead uuid := coalesce(new.lead, old.lead);
begin
  if target_lead is null then
    return coalesce(new, old);
  end if;
  update leads
  set nr_neprezentari = (
    select count(*)
    from programari_leads pl
    where pl.lead = target_lead
      and pl.prezenta = 'absent'
  )
  where id = target_lead;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_lead_neprezentari on programari_leads;
create trigger trg_sync_lead_neprezentari
after insert or delete or update of prezenta on programari_leads
for each row execute function sync_lead_neprezentari();

-- Backfill pentru datele existente.
update leads l
set nr_neprezentari = (
  select count(*)
  from programari_leads pl
  where pl.lead = l.id
    and pl.prezenta = 'absent'
);

-- prune_expired_leads: split pe contor — a 2-a neprezentare merge direct în nurture.
create or replace function prune_expired_leads()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_count integer := 0;
begin
  -- 1. Marchează programările expirate ca 'absent' (triggerul recalculează contorul).
  update programari_leads
  set prezenta = 'absent',
      updated  = now()
  where prezenta = 'programat'
    and data_programarii < current_date;

  -- 2a. A 2-a neprezentare (>=2 absențe) → nurture direct, fără SMS.
  update leads
  set status = 'nurture',
      sub_status = null,
      flag_reminder = false,
      flag_streak = 0,
      flag_reminder_at = null
  where leads.status = 'programat'
    and exists (
      select 1 from programari_leads pl where pl.lead = leads.id
    )
    and not exists (
      select 1 from programari_leads pl
      where pl.lead = leads.id and pl.data_programarii >= current_date
    )
    and leads.nr_neprezentari >= 2;

  -- 2b. 1-a neprezentare → nu_a_venit (rândurile >=2 au ieșit deja din 'programat').
  update leads
  set status = 'nu_a_venit'
  where leads.status = 'programat'
    and exists (
      select 1 from programari_leads pl where pl.lead = leads.id
    )
    and not exists (
      select 1 from programari_leads pl
      where pl.lead = leads.id and pl.data_programarii >= current_date
    );

  get diagnostics affected_count = row_count;
  return affected_count;
end;
$$;

grant execute on function prune_expired_leads() to authenticated;
