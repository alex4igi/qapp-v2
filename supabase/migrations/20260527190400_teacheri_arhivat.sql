-- Qapp v2 — Adăugare flag arhivat pe teacheri.
-- Folosit de manager+ pentru a închide profilul unui instructor inactiv.
-- Diferit de ștergere (DELETE) — păstrează istoricul evaluări/salarii/cursuri.

alter table teacheri
  add column if not exists arhivat boolean not null default false;

create index if not exists idx_teacheri_arhivat on teacheri(arhivat);
