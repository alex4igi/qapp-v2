-- Reconciliere cash zilnică
--
-- O înregistrare reprezintă închiderea casei pe o zi + locație:
-- numărăm bancnotele pe denominații, comparăm cu Cash din sistem
-- (sumă încasări Cash în ziua aceea pentru locație), decidem cât
-- depunem la bancă și cât lăsăm ca fond pentru ziua următoare.
--
-- Fluxul aritmetic:
--   fond_inceput + total_sistem_cash  = ar trebui în casă
--   total_numarat                     = ce găsim efectiv
--   diferenta = total_numarat - (fond_inceput + total_sistem_cash)
--               0=perfect, +=surplus, −=lipsă
--   de_depus  = cât luăm la bancă (decizie operator)
--   fond_ramas = total_numarat - de_depus (rămâne pt mâine)

create table reconcilieri_cash (
  id              uuid primary key default gen_random_uuid(),
  data            date not null,
  locatie         uuid references locatii(id) on delete restrict,
  denominatii     jsonb not null default '{}'::jsonb,
  total_numarat   numeric not null default 0,
  total_sistem    numeric not null default 0,
  fond_inceput    numeric not null default 0,
  de_depus        numeric not null default 0,
  fond_ramas      numeric not null default 0,
  notite          text,
  created_by      uuid,
  created         timestamptz not null default now(),
  updated         timestamptz not null default now(),
  unique (data, locatie)
);

create index reconcilieri_cash_data_idx on reconcilieri_cash (data desc);
create index reconcilieri_cash_locatie_idx on reconcilieri_cash (locatie);

-- RLS — aceiași 4 actori (admin + manager + user + front_desk) pot CRUD;
-- pattern-ul existent permite SELECT pentru toți autentificații + admin tot.
-- Includem recepția explicit ca să poată face actul de închidere zilnică.
alter table reconcilieri_cash enable row level security;

create policy reconcilieri_cash_select_all
  on reconcilieri_cash for select to authenticated using (true);

create policy reconcilieri_cash_admin_all
  on reconcilieri_cash for all to authenticated
  using (is_admin()) with check (is_admin());

create policy reconcilieri_cash_user_insert
  on reconcilieri_cash for insert to authenticated with check (true);

create policy reconcilieri_cash_user_update
  on reconcilieri_cash for update to authenticated
  using (true) with check (true);
