-- Qapp v2 — Scorecard call-center, Faza 2 (restanțe) + fundație Faza 3 (reactivări).
-- Tabel `client_contacte`: log de contacte pe CLIENT (nu pe lead), simetric cu
-- lead_contacte. Refolosește enum-urile generice canal_contact/rezultat_contact.
-- `scop` distinge fluxul: 'recuperare' (Faza 2) vs 'reactivare' (Faza 3).
--
-- Atribuire curată: user_id NOT NULL = operatorul. Suma efectiv recuperată NU
-- se ia din acest tabel (ar fi self-reported), ci din `incasari` reale după
-- data contactului — vezi get_scorecard_restante.

create table if not exists client_contacte (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references clienti(id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users(id),
  canal        canal_contact not null,
  rezultat     rezultat_contact not null,
  scop         text not null check (scop in ('recuperare','reactivare','altul')),
  suma_promisa numeric,   -- cât a promis clientul (informativ; NU contează la scor)
  observatii   text,
  created      timestamptz not null default now()
);

create index if not exists client_contacte_user_created_idx
  on client_contacte(user_id, created);
create index if not exists client_contacte_client_idx
  on client_contacte(client_id, created desc);
create index if not exists client_contacte_scop_idx
  on client_contacte(scop, created);

alter table client_contacte enable row level security;

create policy client_contacte_select on client_contacte
  for select to authenticated using (true);

create policy client_contacte_insert on client_contacte
  for insert to authenticated
  with check (
    auth_role() in ('admin','owner','manager','front_desk')
    and user_id = auth.uid()
  );

-- ============================================================
-- Seed praguri Faza 2 (restanțe). 'scor_general' se reutilizează din Faza 1.
-- ============================================================
insert into scorecard_praguri
  (cheie, faza, eticheta, unitate, prag_standard, prag_peste, directie, pondere, scorat, descriere)
values
  ('volum_recuperare',  2, 'Volum contacte recuperare', 'numar',    8, 15, 'mai_mare_e_bine', 1, true,
    'Nr. contacte de recuperare / lună per operator.'),
  ('rata_recuperare',   2, 'Rată recuperare',           'procent', 70, 90, 'mai_mare_e_bine', 1, true,
    'Sume efectiv încasate după contact / (încasat + rest rămas) pe clienții lucrați.'),
  ('igiena_recuperare', 2, 'Igienă recuperare',         'procent', 80, 95, 'mai_mare_e_bine', 1, true,
    '% contacte de recuperare cu notă (observații).')
on conflict (cheie) do nothing;
