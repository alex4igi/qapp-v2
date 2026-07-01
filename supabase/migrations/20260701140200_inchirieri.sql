-- Închirieri săli (cursuri private / antrenament individual).
-- Ocupă un interval într-o sală; apare în calendarul de închirieri alături de
-- cursurile recurente. Doar tranzacție de închiriere — NU atinge salariu/prezențe.
-- Plata: integral acum (incasari) SAU pentru un client, rest → datorii (link `datorie`);
-- pentru guest fără cont, neplătitul trăiește pe status_plata='neachitat'.
-- Fără RLS (ca incasari/datorii).

create type status_plata_inchiriere as enum ('achitat', 'partial', 'neachitat');

create table if not exists inchirieri (
  id            uuid primary key default gen_random_uuid(),
  sala          uuid not null references sali(id) on delete restrict,
  locatie       uuid references locatii(id) on delete set null,
  data          date not null,
  ora_start     time not null,
  ora_final     time not null,
  durata_min    integer not null check (durata_min > 0 and durata_min % 30 = 0),
  tier          tier_inchiriere not null,
  teacher       uuid references teacheri(id) on delete set null,
  client        uuid references clienti(id) on delete set null,
  guest_nume    text,
  guest_tel     text,
  pret          numeric not null default 0 check (pret >= 0),
  status_plata  status_plata_inchiriere not null default 'neachitat',
  datorie       uuid references datorii(id) on delete set null,
  observatii    text,
  created_by    uuid references auth.users(id) on delete set null default auth.uid(),
  created       timestamptz not null default now(),
  updated       timestamptz not null default now(),

  -- Exact o identitate de chiriaș: teacher | client | guest. Teacher singur = închiriere
  -- staff (poate fi 0 lei = antrenament individual).
  constraint inchirieri_one_renter check (
    (teacher is not null)::int + (client is not null)::int + (guest_nume is not null)::int = 1
  )
);

create index if not exists idx_inchirieri_data on inchirieri(data);
create index if not exists idx_inchirieri_sala_data on inchirieri(sala, data);
create index if not exists idx_inchirieri_client on inchirieri(client);
