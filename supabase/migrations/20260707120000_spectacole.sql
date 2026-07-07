-- Modul Spectacole / Recital — producția unui spectacol de final de sezon / gală.
--
-- Context: qapp acoperă bine CRM/financiar, dar nu avea nimic pentru partea de
-- „producție de spectacol" (echivalentul „Recital Wizard" din DanceStudio-Pro),
-- deși Quasar are trupe (MiniQ's/UNIQ/RockOnQ) și organizează spectacole. `concursuri`
-- e doar record-keeping (rezultate), `evenimente` e listă + bilete — niciunul nu ține
-- un lineup de numere pe scenă.
--
-- Model: un `spectacol` are un lineup ordonat de `spectacol_acte` (numere de scenă);
-- fiecare act poate fi alimentat dintr-o grupă/trupă (`cursuri`) și are performerii lui
-- (`spectacol_act_performeri`, seed din înrolările active ale grupei, apoi editabil manual).
-- „Avertizarea de schimbare rapidă" (un performer în două acte apropiate) se calculează în
-- UI din lineup — nu necesită stare în DB. Puntea `spectacole.eveniment` leagă opțional un
-- spectacol de un `evenimente` (pentru ticketing — Planul A, ulterior).

create type status_spectacol as enum ('planificat', 'confirmat', 'finalizat', 'anulat');

-- ============================================================
-- Tabele
-- ============================================================

create table spectacole (
  id        uuid primary key default gen_random_uuid(),
  nume      text not null,
  data      date,
  ora       text,
  locatie   text,
  sezon     uuid references sezoane(id) on delete set null,
  status    status_spectacol not null default 'planificat',
  note      text,
  -- Punte opțională spre un eveniment cu bilete (Planul A / ticketing).
  eveniment uuid references evenimente(id) on delete set null,
  created   timestamptz not null default now(),
  updated   timestamptz not null default now()
);
create index idx_spectacole_data  on spectacole(data);
create index idx_spectacole_sezon on spectacole(sezon);

-- Un rând per număr de scenă (act), ordonat prin `ordine`.
create table spectacol_acte (
  id          uuid primary key default gen_random_uuid(),
  spectacol   uuid not null references spectacole(id) on delete cascade,
  ordine      integer not null default 0,
  titlu       text not null,
  -- Grupa/trupa sursă (opțional): din ea se pre-populează performerii.
  curs        uuid references cursuri(id) on delete set null,
  durata_min  integer,
  -- Responsabil scenă/culise pentru acest act.
  responsabil uuid references teacheri(id) on delete set null,
  note        text,
  created     timestamptz not null default now()
);
create index idx_spectacol_acte_spectacol on spectacol_acte(spectacol);

-- Performerii unui act. Seed din `enrollments` active ale `curs`, apoi editabil manual
-- (un dansator poate fi mutat/adăugat individual, dincolo de roster-ul grupei).
create table spectacol_act_performeri (
  id      uuid primary key default gen_random_uuid(),
  act     uuid not null references spectacol_acte(id) on delete cascade,
  client  uuid not null references clienti(id) on delete cascade,
  created timestamptz not null default now(),
  unique (act, client)
);
create index idx_spectacol_perf_act    on spectacol_act_performeri(act);
create index idx_spectacol_perf_client on spectacol_act_performeri(client);

-- Auto-update `updated` pe spectacole (funcția există din schema de bază).
create trigger trg_spectacole_updated
  before update on spectacole
  for each row execute function set_updated_timestamp();

-- ============================================================
-- RLS — oglindește open_sesiuni/open_rezervari:
--   READ = tot staff-ul autentificat (inclusiv teacherii responsabili de act);
--   WRITE = owner/admin/manager (PRIVILEGED).
-- Scrierile reale trec prin API cu clientul staff (RLS-ul se aplică direct — nu avem
-- RPC-uri SECURITY DEFINER aici). Gardul `deny_parinte_direct` (restrictiv) blochează
-- conturile de portal, ca la orice tabel nou (vezi 20260705090000).
-- ============================================================

alter table spectacole              enable row level security;
alter table spectacol_acte          enable row level security;
alter table spectacol_act_performeri enable row level security;

do $$
declare t text;
begin
  foreach t in array array['spectacole', 'spectacol_acte', 'spectacol_act_performeri']
  loop
    execute format('create policy %I_select on public.%I for select to authenticated using (true)', t, t);
    execute format(
      'create policy %I_write on public.%I for all to authenticated '
      || 'using (auth_role() in (%L, %L, %L)) with check (auth_role() in (%L, %L, %L))',
      t, t, 'owner', 'admin', 'manager', 'owner', 'admin', 'manager'
    );
    -- Gard portal (restrictiv), identic cu 20260705090000.
    execute format(
      'create policy deny_parinte_direct on public.%I as restrictive for all to authenticated '
      || 'using (auth_role() <> %L) with check (auth_role() <> %L)',
      t, 'parinte', 'parinte'
    );
  end loop;
end $$;
