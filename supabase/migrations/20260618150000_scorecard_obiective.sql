-- Qapp v2 — Scorecard: obiective lunare de echipă (quota).
-- Ținta lunară pe care o compari cu realizatul din scorecard. Scope = echipă
-- (un singur target/lună/metrică, nu per operator — vezi decizia userului).
-- Metricile țintite: conversii (rezultat) + contacte verificate (proces).

create table if not exists scorecard_obiective (
  luna    text not null,                       -- 'YYYY-MM'
  metric  text not null
            check (metric in ('conversii', 'contacte_verificate')),
  target  numeric not null check (target >= 0),
  updated timestamptz not null default now(),
  primary key (luna, metric)
);

alter table scorecard_obiective enable row level security;

-- Obiectivele nu sunt sensibile: citibile de orice staff autentificat (apar ca
-- bară de progres în scorecard pentru toți).
create policy scorecard_obiective_select on scorecard_obiective
  for select to authenticated using (true);

-- Doar owner-ul setează ținta.
create policy scorecard_obiective_write on scorecard_obiective
  for all to authenticated
  using (is_owner()) with check (is_owner());
