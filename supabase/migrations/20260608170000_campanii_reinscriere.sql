-- Qapp v2 — Campanie de reînscrieri (admin) + porțile de validitate.
--
-- O campanie se organizează de un admin înainte de sezonul de toamnă (un sezon
-- `tip=principal, stare=planificat`). Vizează toate cursurile RECURENTE
-- (`facultativ=false`) din acel sezon. Are target (nr. clienți reînscriși),
-- perioadă (început/final) + o fereastră de procesare (`zile_procesare`, implicit 7).
--
-- O reînscriere e VALIDĂ doar când AMBELE porți sunt completate:
--   1. taxa de rezervare plătită (o încasare `categorie='Taxa'` ≥ taxa fixă a campaniei)
--   2. actul adițional semnat (esemneaza.ro SAU manual → link scan în Drive)
-- Când ambele porți trec, se cheamă `activate_reinscriere_pe_sezon` (preț promo +
-- este_reinscriere=true) — vezi `..._campanii_reinscriere_rpc.sql`.

-- ============================================================
-- 1) Tabel campanie (una per sezon țintă)
-- ============================================================
create table campanii_reinscriere (
  id              uuid primary key default gen_random_uuid(),
  sezon_tinta     uuid not null references sezoane(id) on delete cascade,
  nume            text not null,
  target_clienti  integer not null default 0 check (target_clienti >= 0),
  taxa_rezervare  numeric not null check (taxa_rezervare > 0),
  data_incepere   date not null,
  data_final      date not null,
  zile_procesare  integer not null default 7 check (zile_procesare >= 0),
  inchisa_la      timestamptz,            -- null = deschisă; setat la închiderea manuală
  created_by      uuid references auth.users(id) on delete set null,
  created         timestamptz not null default now(),
  updated         timestamptz not null default now(),
  constraint uq_campanie_sezon unique (sezon_tinta),
  constraint chk_campanie_perioada check (data_final >= data_incepere)
);
create index idx_campanii_reinscriere_sezon on campanii_reinscriere(sezon_tinta);

-- ============================================================
-- 2) Tabel porți, grilă (campanie, client, curs țintă)
-- ============================================================
create table reinscrieri_gate (
  id                  uuid primary key default gen_random_uuid(),
  campanie_id         uuid not null references campanii_reinscriere(id) on delete cascade,
  client_id           uuid not null references clienti(id) on delete cascade,
  curs_tinta_id       uuid not null references cursuri(id) on delete cascade,

  -- Poarta 1: taxa de rezervare
  taxa_incasare_id    uuid references incasari(id) on delete set null,
  taxa_platita_la     timestamptz,

  -- Poarta 2: actul adițional
  act_status          text not null default 'nesemnat'
                        check (act_status in ('nesemnat','trimis','semnat','expirat','anulat')),
  act_canal           text check (act_canal in ('esemneaza','manual')),
  esemneaza_request_id text,
  document_link       text,
  act_semnat_la       timestamptz,

  -- Rezultat
  activat_la          timestamptz,
  enrollment_id       uuid references enrollments(id) on delete set null,

  created             timestamptz not null default now(),
  updated             timestamptz not null default now(),
  constraint uq_reinscrieri_gate unique (campanie_id, client_id, curs_tinta_id)
);
create index idx_reinscrieri_gate_campanie on reinscrieri_gate(campanie_id);
create index idx_reinscrieri_gate_client   on reinscrieri_gate(client_id);
create index idx_reinscrieri_gate_curs     on reinscrieri_gate(curs_tinta_id);
create index idx_reinscrieri_gate_request  on reinscrieri_gate(esemneaza_request_id)
  where esemneaza_request_id is not null;

-- ============================================================
-- 3) RLS — scrieri prin RPC (SECURITY DEFINER) + fallback admin + service_role (webhook Faza 2)
-- ============================================================
alter table campanii_reinscriere enable row level security;
alter table reinscrieri_gate enable row level security;

-- Citire: orice autentificat (accesul la pagină e gestionat de ROUTE_ACCESS).
create policy campanii_reinscriere_select on campanii_reinscriere
  for select to authenticated using (true);
-- Scriere directă: doar admin/owner (fallback; calea normală e RPC definer).
create policy campanii_reinscriere_admin_write on campanii_reinscriere
  for all to authenticated using (is_admin()) with check (is_admin());

create policy reinscrieri_gate_select on reinscrieri_gate
  for select to authenticated using (true);
create policy reinscrieri_gate_admin_write on reinscrieri_gate
  for all to authenticated using (is_admin()) with check (is_admin());
-- Webhook esemneaza (Faza 2) scrie cu service_role.
create policy reinscrieri_gate_service_insert on reinscrieri_gate
  for insert with check (auth.role() = 'service_role');
create policy reinscrieri_gate_service_update on reinscrieri_gate
  for update using (auth.role() = 'service_role');

grant select on campanii_reinscriere to authenticated;
grant select on reinscrieri_gate to authenticated;
