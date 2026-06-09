-- Qapp v2 — Scorecard call-center: praguri configurabile (Sub/Standard/Peste).
-- Tabel de config editabil din UI (doar owner). PK text + coloană `faza` →
-- KPI-urile Fazei 2/3 se adaugă ca rânduri noi, fără ALTER TABLE.
--
-- Seed = valori ancorate în industrie (vezi planul); editabile ulterior.

create table if not exists scorecard_praguri (
  cheie         text primary key,
  faza          smallint not null default 1,   -- 1=leads, 2=restante, 3=reactivari
  eticheta      text not null,
  unitate       text not null,                  -- 'ore' | 'numar' | 'procent'
  prag_standard numeric not null,
  prag_peste    numeric not null,
  directie      text not null default 'mai_mare_e_bine'
                check (directie in ('mai_mare_e_bine','mai_mic_e_bine')),
  pondere       numeric not null default 1,
  scorat        boolean not null default true,  -- intră în scorul total?
  descriere     text,
  updated       timestamptz not null default now()
);

alter table scorecard_praguri enable row level security;

-- Pragurile nu sunt sensibile: citibile de orice staff autentificat (RPC-ul
-- scorecard rulează security invoker și are nevoie să le citească).
create policy scorecard_praguri_select on scorecard_praguri
  for select to authenticated using (true);

-- Doar owner-ul ajustează pragurile.
create policy scorecard_praguri_write on scorecard_praguri
  for all to authenticated
  using (is_owner()) with check (is_owner());

-- ============================================================
-- Seed praguri Faza 1
-- ============================================================
insert into scorecard_praguri
  (cheie, faza, eticheta, unitate, prag_standard, prag_peste, directie, pondere, scorat, descriere)
values
  -- Controlabile (viitoare bază fixă)
  ('volum_contacte',     1, 'Volum contacte verificate', 'numar',   10, 20, 'mai_mare_e_bine', 1, true,
    'Nr. contacte coroborate / lună per operator.'),
  ('viteza_contactare',  1, 'Viteză de contactare',      'ore',     24,  1, 'mai_mic_e_bine',  1, true,
    'Ore lucrătoare (excl. weekend) de la intrarea lead-ului la primul contact. <1h peste, ≤24h standard.'),
  ('persistenta',        1, 'Persistență',               'numar',    6,  8, 'mai_mare_e_bine', 1, true,
    'Media încercărilor pe lead-urile pierdute. 95% din convertiți sunt prinși până la a 6-a încercare.'),
  ('igiena_crm',         1, 'Igienă CRM',                'procent', 80, 95, 'mai_mare_e_bine', 1, true,
    '% lead-uri lucrate cu cel puțin un contact notat (observații).'),
  ('followup_onorat',    1, 'Follow-up onorat',          'procent', 70, 90, 'mai_mare_e_bine', 1, true,
    '% callback-uri onorate la data dorită.'),
  -- Influențabile / risc (viitor bonus)
  ('conversie',          1, 'Conversie',                 'procent', 35, 50, 'mai_mare_e_bine', 1, true,
    'Convertiți / lead-uri lucrate. Boutique fitness ~50% standard.'),
  ('show_rate',          1, 'Show-rate demo',            'procent', 70, 85, 'mai_mare_e_bine', 1, true,
    'Prezenți / (prezenți+absenți) la ședința demo. No-show mediu în industrie ~30%.'),
  -- Clasa generală (derivată din scorul normalizat)
  ('scor_general',       1, 'Scor general',              'procent', 50, 75, 'mai_mare_e_bine', 0, false,
    'Pragul pentru clasa generală, pe scorul total normalizat (0-100%).'),
  -- Flag-uri anti-gaming (heuristici, ne-scorate)
  ('rafala_nr',          1, 'Rafală — nr. contacte',     'numar',   10, 10, 'mai_mare_e_bine', 0, false,
    'Nr. minim de contacte într-o fereastră scurtă care declanșează flag-ul de rafală.'),
  ('rafala_min',         1, 'Rafală — fereastră (min)',  'numar',    5,  5, 'mai_mic_e_bine',  0, false,
    'Durata ferestrei (minute) pentru flag-ul de rafală.'),
  ('decalaj_rata',       1, 'Decalaj — prag verificat',  'procent', 20, 20, 'mai_mare_e_bine', 0, false,
    'Sub acest procent de contacte verificate (cu volum mare) → flag de decalaj activitate↔rezultat.')
on conflict (cheie) do nothing;
