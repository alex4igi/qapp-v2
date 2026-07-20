-- `leads.ultima_contactare_la` se scria DOAR în updateLead, când sub_status intra
-- în nu_raspunde/de_revenit. Trei căi prin care un apel real nu lăsa urmă:
--   1. rezultat 'reusit' → logContact curăță sub_status → garda nu prinde;
--   2. 'nu răspunde' repetat → current.sub_status === form.sub_status → nu prinde;
--   3. 'reusit' fără observații pe un lead deja contactat → patch gol → updateLead
--      nici nu se apelează.
-- Câmpul însemna de fapt „ultima încercare eșuată CU schimbare de sub-status".
-- Efect colateral: cron-evening escaladează spre nurture leadurile nu_raspunde cu
-- ultima_contactare_la < acum-2z, deci trimitea în nurture oameni sunați ieri.
-- `lead_contacte` are adevărul — devine sursa care alimentează câmpul.

-- ------------------------------------------------------------------
-- 1) Backfill istoric din lead_contacte.
--    trg_leads_updated e dezactivat pe durata lui: e o corecție de date, nu o
--    editare. Altfel `updated = now()` pe mii de rânduri ar reseta ceasul de 10
--    zile pe care cron-evening îl folosește ca să treacă nu_a_venit → nurture
--    (cron-evening/index.ts:180 `.lt('updated', cutoff10d)`).
-- ------------------------------------------------------------------
alter table leads disable trigger trg_leads_updated;

update leads l
set ultima_contactare_la = c.last_contact
from (
  select lead_id, max(created) as last_contact
  from lead_contacte
  group by lead_id
) c
where c.lead_id = l.id
  and (l.ultima_contactare_la is null or l.ultima_contactare_la < c.last_contact);

alter table leads enable trigger trg_leads_updated;

-- ------------------------------------------------------------------
-- 2) Fix forward: orice contact logat bumpează câmpul, indiferent de rezultat.
--    În DB, nu în TS — calea 3 de mai sus arată că TS-ul poate să nu ajungă
--    deloc la update, iar lead_contacte are și alți scriitori (edge functions).
--    GREATEST ignoră NULL în Postgres, deci acoperă și primul contact.
--    NU atingem nr_contactari: semantica lui e „încercări fără răspuns" (prag 4
--    → nurture în cron-evening); un count(*) pe lead_contacte ar muta în nurture
--    leaduri sunate cu succes.
-- ------------------------------------------------------------------
create or replace function bump_lead_ultima_contactare()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update leads
  set ultima_contactare_la = greatest(ultima_contactare_la, new.created)
  where id = new.lead_id
    and (ultima_contactare_la is null or ultima_contactare_la < new.created);
  return null;
end;
$$;

revoke execute on function bump_lead_ultima_contactare() from anon, public;

drop trigger if exists trg_bump_lead_ultima_contactare on lead_contacte;
create trigger trg_bump_lead_ultima_contactare
  after insert on lead_contacte
  for each row execute function bump_lead_ultima_contactare();
