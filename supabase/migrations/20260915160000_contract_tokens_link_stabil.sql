-- Linkul de semnare rămâne ACELAȘI pe toată viața contractului (decis 2026-09-15).
--
-- Până acum stocam doar sha256(token) pe `contracte.token_hash`, deci reminderul nu
-- putea retrimite linkul existent și emitea unul nou — cel din primul SMS murea.
-- Părinții care apăsau pe primul SMS vedeau „Link invalid." și credeau că le-a
-- expirat contractul, iar recepția nu-l putea retrimite: gardul de dublură din
-- contract-send îl vedea încă „trimis".
--
-- `contract_tokens` = toate linkurile valide ale unui contract.
-- - `token` = linkul în clar, ca reminderul și „Retrimite link" să trimită același
--   link. E NULL pentru linkurile emise înainte de migrație (aveam doar hash-ul):
--   ele rămân valide, iar la primul reminder/retrimitere contractul primește un
--   link nou, păstrat de-atunci. Doar tranziția asta dă mai multe rânduri pe contract.
-- - Valabilitatea și anularea stau pe contract (`token_expira_la`, `status`), nu pe link.
--
-- DOAR service_role: linkul deschide datele semnatarului (CNP, CI, adresă), deci
-- tabelul nu are politici permisive — staff-ul nu-l citește prin PostgREST.
create table contract_tokens (
  token_hash   text primary key,
  contract_id  uuid not null references contracte(id) on delete cascade,
  token        text,
  created      timestamptz not null default now()
);

create index contract_tokens_contract_idx on contract_tokens (contract_id);

alter table contract_tokens enable row level security;
revoke all on contract_tokens from anon, authenticated;

create policy deny_parinte_direct on contract_tokens
  as restrictive for all to authenticated
  using ((select auth_role()) <> 'parinte')
  with check ((select auth_role()) <> 'parinte');

create policy deny_marketing_direct on contract_tokens
  as restrictive for all to authenticated
  using ((select auth_role()) <> 'marketing')
  with check ((select auth_role()) <> 'marketing');

insert into contract_tokens (token_hash, contract_id)
select token_hash, id from contracte where token_hash is not null
on conflict do nothing;

comment on column contracte.token_hash is
  'Nefolosit din 2026-09-15 — linkurile de semnare stau în contract_tokens.';

-- Jurnal: „Retrimite link" din lista de contracte.
alter table contract_events drop constraint if exists contract_events_tip_check;
alter table contract_events add constraint contract_events_tip_check
  check (tip in (
    'creat', 'trimis', 'retrimis', 'sms_pus_in_coada', 'sms_trimis', 'sms_amanat',
    'email_trimis', 'deschis', 'consimtamant', 'semnat', 'pdf_generat',
    'sigilat', 'drive_upload', 'gate_semnat', 'reminder', 'expirat',
    'respins', 'anulat', 'eroare'
  ));
