-- Qapp v2 — auto-mutare leads expirate.
--
-- Regula: un lead cu `status='programat'` care nu mai are nicio programare viitoare
-- (toate `programari_leads.data_programarii < CURRENT_DATE`) este marcat `nu_a_venit`.
-- Programările expirate trecute (încă `prezenta='programat'`) primesc `prezenta='absent'`.
--
-- Apelată on-demand din UI la deschiderea pipeline-ului de leads (KanbanBoard).
-- Idempotentă — re-apelarea într-o zi în care nu mai sunt lead-uri eligibile e no-op.

create or replace function prune_expired_leads()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_count integer := 0;
begin
  -- 1. Marchează programările expirate ca 'absent'.
  update programari_leads
  set prezenta = 'absent',
      updated  = now()
  where prezenta = 'programat'
    and data_programarii < current_date;

  -- 2. Mută lead-urile programate fără viitor → nu_a_venit.
  --    Trigger-ul `trg_log_lead_activity` va loga automat schimbarea de status.
  with leads_expirate as (
    select l.id
    from leads l
    where l.status = 'programat'
      and exists (
        select 1 from programari_leads pl where pl.lead = l.id
      )
      and not exists (
        select 1 from programari_leads pl
        where pl.lead = l.id
          and pl.data_programarii >= current_date
      )
  )
  update leads
  set status = 'nu_a_venit'
  from leads_expirate le
  where leads.id = le.id;

  get diagnostics affected_count = row_count;
  return affected_count;
end;
$$;

grant execute on function prune_expired_leads() to authenticated;
