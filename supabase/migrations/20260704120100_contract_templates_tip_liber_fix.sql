-- Fix migrației anterioare (20260704120000): detecția dinamică a numelui
-- constraint-ului nu l-a găsit — Postgres rescrie `IN (...)` ca `= ANY(ARRAY[...])`,
-- fără substring-ul „in" pe care îl căutam. Numele real, confirmat prin eroare
-- la un INSERT de test: contract_templates_tip_check.
alter table contract_templates
  drop constraint if exists contract_templates_tip_check;
