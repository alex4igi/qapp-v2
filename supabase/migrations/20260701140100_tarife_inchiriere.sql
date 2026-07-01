-- Grila de tarife pentru închirierea sălilor (cursuri private / antrenament).
-- Preț per (sală × tier × treaptă durată). Tier-ul e derivat automat de cine
-- închiriază: teacher/crew → 'staff', client/guest → 'client' (vezi UI).
-- Trepte fixe 60/90/120; peste 120 = pret_120 + increment_30 * (extra/30).
-- Fără RLS (ca incasari/datorii/sali) — acces prin sesiune authenticated.

create type tier_inchiriere as enum ('staff', 'client');

create table if not exists tarife_inchiriere (
  id            uuid primary key default gen_random_uuid(),
  sala          uuid not null references sali(id) on delete cascade,
  tier          tier_inchiriere not null,
  pret_60       numeric,        -- null = neconfigurat (UI blochează rezervarea)
  pret_90       numeric,
  pret_120      numeric,
  increment_30  numeric,        -- preț per 30 min suplimentare peste 120
  updated       timestamptz not null default now(),
  unique (sala, tier)
);

create index if not exists idx_tarife_inchiriere_sala on tarife_inchiriere(sala);

-- Seed din Excel-ul actual — doar sălile de la Ștefan cel Mare ("Sala 1"/"Sala 2"
-- la locația "Galeriile Stefan cel Mare"). Restul sălilor se completează în Setări.
-- Idempotent: on conflict do nothing; no-op dacă numele nu potrivesc.
insert into tarife_inchiriere (sala, tier, pret_60, pret_90, pret_120, increment_30)
select s.id, 'staff'::tier_inchiriere, 70, 100, 120, 30
from sali s join locatii l on l.id = s.locatie
where s.nume = 'Sala 1' and l.nume ilike '%stefan%'
on conflict (sala, tier) do nothing;

insert into tarife_inchiriere (sala, tier, pret_60, pret_90, pret_120, increment_30)
select s.id, 'client'::tier_inchiriere, 80, 120, 140, 40
from sali s join locatii l on l.id = s.locatie
where s.nume = 'Sala 1' and l.nume ilike '%stefan%'
on conflict (sala, tier) do nothing;

insert into tarife_inchiriere (sala, tier, pret_60, pret_90, pret_120, increment_30)
select s.id, 'staff'::tier_inchiriere, 40, 60, 80, 30
from sali s join locatii l on l.id = s.locatie
where s.nume = 'Sala 2' and l.nume ilike '%stefan%'
on conflict (sala, tier) do nothing;

insert into tarife_inchiriere (sala, tier, pret_60, pret_90, pret_120, increment_30)
select s.id, 'client'::tier_inchiriere, 50, 75, 90, 30
from sali s join locatii l on l.id = s.locatie
where s.nume = 'Sala 2' and l.nume ilike '%stefan%'
on conflict (sala, tier) do nothing;
