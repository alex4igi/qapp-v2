-- Qapp v2 — adaugă motiv + dată reziliere pe enrollments.
-- Motivul ajută la rapoarte de retention și la istoricul clientului.

alter table enrollments
  add column if not exists motiv_reziliere text,
  add column if not exists data_reziliere  timestamptz;
