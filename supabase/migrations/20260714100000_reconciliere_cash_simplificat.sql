-- Reconciliere cash simplificată: model per zi, fără fond reportat / de depus.
-- Diferența devine: numărat − (încasări_cash − cheltuieli_cash).
-- Adăugăm doar total_cheltuieli (tastat manual în card). Coloanele vechi
-- fond_inceput / de_depus / fond_ramas rămân (default 0) pentru a păstra
-- istoricul intact; UI-ul nou nu le mai scrie/citește.

alter table reconcilieri_cash
  add column if not exists total_cheltuieli numeric not null default 0;
