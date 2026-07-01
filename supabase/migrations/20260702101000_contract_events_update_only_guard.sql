-- Fix: gardul append-only pe contract_events bloca și CASCADE-ul de la ștergerea
-- contractului (imposibil de șters un contract — inclusiv pentru GDPR erasure).
--
-- Model corect: rândurile nu pot fi MODIFICATE niciodată (trigger pe UPDATE), iar
-- DELETE direct e imposibil pentru orice rol (privilegiul e revocat, inclusiv
-- service_role). Singura cale de dispariție a jurnalului = ON DELETE CASCADE la
-- ștergerea contractului părinte (rulează ca owner) — exact calea GDPR dorită.

drop trigger if exists trg_contract_events_immutable on contract_events;

create trigger trg_contract_events_immutable
  before update on contract_events
  for each row execute function _contract_events_immutable();
