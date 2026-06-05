-- Qapp v2 — Adaugă date de contact pe locații (folosite în SMS, UI și share).
-- Câmpuri opționale; nu schimbă semantica existentă.

alter table locatii
  add column if not exists adresa text,
  add column if not exists telefon text,
  add column if not exists link_maps text;
