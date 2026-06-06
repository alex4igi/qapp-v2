-- Qapp v2 — Rezervări „OPEN class": sesiuni + rezervări cu capacitate pe sesiune.
--
-- Cursul OPEN (facultativ) rulează pe zile recurente, cu alt instructor de fiecare
-- dată și max 35 locuri PER ȘEDINȚĂ. Cursanții plătesc în avans ca să-și blocheze
-- un loc la o dată viitoare. Modelăm un strat dedicat de sesiuni + rezervări peste
-- mecanica existentă: la rezervare cu plată, RPC-ul (vezi _open_class_rpc) creează
-- ȘI o înrolare facultativă „Per ședință" + o `incasari` legată — deci Financiar /
-- plati_inrolari / prezente rămân neatinse. Aici doar capacitatea + ciclul de viață.
--
-- Self-service din contul de client = proiect separat; statusul `rezervat` (hold
-- fără bani) e groundwork pentru el — fluxul de recepție produce mereu `platit`.

-- ============================================================
-- 1) Enum
-- ============================================================
create type status_rezervare as enum ('rezervat', 'platit', 'anulat');

-- ============================================================
-- 2) Tabele
-- ============================================================

-- O linie per (curs facultativ, dată). Capacitatea e SNAPSHOT pe sesiune (seed din
-- cursuri.capacitate_maxima): schimbarea ulterioară a limitei cursului nu corupe o
-- sesiune deja deschisă.
create table open_sesiuni (
  id          uuid primary key default gen_random_uuid(),
  curs        uuid not null references cursuri(id) on delete cascade,
  data        date not null,
  capacitate  integer not null default 35 check (capacitate > 0),
  instructor  uuid references teacheri(id) on delete set null,
  status      text not null default 'activa' check (status in ('activa', 'anulata')),
  observatii  text,
  created     timestamptz not null default now(),
  unique (curs, data)
);
create index idx_open_sesiuni_curs on open_sesiuni(curs);
create index idx_open_sesiuni_data on open_sesiuni(data);

-- O linie per (sesiune, client). `enrollment` + `incasare` leagă rezervarea de
-- mecanica standard de prezență/bani. Indexul unic parțial blochează dublarea
-- aceluiași client pe o sesiune, dar permite re-rezervarea după anulare.
create table open_rezervari (
  id           uuid primary key default gen_random_uuid(),
  sesiune      uuid not null references open_sesiuni(id) on delete cascade,
  client       uuid not null references clienti(id) on delete cascade,
  enrollment   uuid references enrollments(id) on delete set null,
  incasare     uuid references incasari(id) on delete set null,
  status       status_rezervare not null default 'platit',
  suma         numeric,
  created      timestamptz not null default now(),
  anulat_at    timestamptz,
  anulat_motiv text
);
create unique index uq_open_rez_client_active
  on open_rezervari(sesiune, client)
  where status <> 'anulat';
create index idx_open_rez_sesiune on open_rezervari(sesiune);
create index idx_open_rez_client  on open_rezervari(client);
create index idx_open_rez_status  on open_rezervari(sesiune, status);

-- ============================================================
-- 3) RLS (oglindește cursuri_teacheri: read pentru toți, write rol-gated)
--    Scrierile reale trec prin RPC-uri SECURITY DEFINER (bypass RLS); policy-urile
--    de write sunt belt-and-suspenders.
-- ============================================================
alter table open_sesiuni  enable row level security;
alter table open_rezervari enable row level security;

-- READ: tot staff-ul autentificat, inclusiv teacherii (au nevoie de roster).
create policy open_sesiuni_select on open_sesiuni
  for select to authenticated using (true);
create policy open_rezervari_select on open_rezervari
  for select to authenticated using (true);

-- WRITE: admin/owner/manager/front_desk.
create policy open_sesiuni_write on open_sesiuni
  for all to authenticated
  using (auth_role() in ('admin', 'owner', 'manager', 'front_desk'))
  with check (auth_role() in ('admin', 'owner', 'manager', 'front_desk'));
create policy open_rezervari_write on open_rezervari
  for all to authenticated
  using (auth_role() in ('admin', 'owner', 'manager', 'front_desk'))
  with check (auth_role() in ('admin', 'owner', 'manager', 'front_desk'));
