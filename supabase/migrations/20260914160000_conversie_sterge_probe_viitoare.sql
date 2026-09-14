-- La conversie, programările de probă din zilele următoare dispar.
--
-- Un lead convertit înainte de ședința de probă (Irina Virna, 14.09: programată
-- la probă pe 18.09, înrolată în aceeași grupă din 18.09) păstra programarea:
-- cron-morning citește programările, nu statusul leadului, deci în ziua probei
-- pleca „Va reamintim de sedinta gratuita... AZI" către un membru, iar rosterul
-- grupei o arăta de două ori (membru + lead). O programare de probă la o clasă
-- demo ținea în plus un loc ocupat.
--
-- Trigger în DB, nu în frontend: conversia se face din mai multe locuri (fișa
-- leadului, kanban, backfill-uri), iar RLS-ul dă DELETE pe programari_leads doar
-- adminului.
--
-- Ziua conversiei rămâne neatinsă: leadul convertit la proba de azi are rândul
-- de azi, iar prezența lui trebuie să rămână în istoric.

create or replace function sterge_probe_viitoare_la_conversie()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from programari_leads
   where lead = new.id
     and prezenta = 'programat'
     and data_programarii > (now() at time zone 'Europe/Bucharest')::date;
  return null;
end;
$$;

revoke execute on function sterge_probe_viitoare_la_conversie() from anon, public;

drop trigger if exists trg_leads_convertit_sterge_probe on leads;
create trigger trg_leads_convertit_sterge_probe
  after update of status on leads
  for each row
  when (new.status = 'convertit' and old.status is distinct from 'convertit')
  execute function sterge_probe_viitoare_la_conversie();
