-- Qapp v2 — listă „Tarife publice" editabilă (owner/admin/manager), citită LIVE de
-- portalul de membri pe pagina publică /servicii (înlocuiește lista hard-codată din
-- qapp-membri/src/features/legal/firma.ts → TARIFE).
--
-- Decuplată intenționat de prețurile per-curs (cursuri.pret_*): aceasta e OFERTA
-- PUBLICĂ curată (ca Anexa 1 din contract), nu sursa de facturare. Owner-ul o edita
-- într-un singur loc, iar portalul o reflectă imediat.
--
-- ⚠️ Citită de rolul `anon` (vizitator nelogat / recenzent Netopia) → SELECT public.

create table if not exists tarife_publice (
  id             uuid primary key default gen_random_uuid(),
  program        text not null,
  descriere      text,
  pret           text not null,
  taxa_rezervare text,
  ordine         integer not null default 0,
  activ          boolean not null default true,
  created        timestamptz not null default now(),
  updated        timestamptz not null default now()
);

create index if not exists idx_tarife_publice_ordine on tarife_publice(ordine);

drop trigger if exists trg_tarife_publice_updated on tarife_publice;
create trigger trg_tarife_publice_updated
  before update on tarife_publice
  for each row execute function set_updated_timestamp();

-- ============================================================
-- RLS — citire publică (anon + staff); scriere owner/admin/manager
-- ============================================================
alter table tarife_publice enable row level security;

drop policy if exists tarife_publice_select on tarife_publice;
create policy tarife_publice_select on tarife_publice
  for select using (true);

drop policy if exists tarife_publice_write on tarife_publice;
create policy tarife_publice_write on tarife_publice
  for all to authenticated
  using (auth_role() in ('owner', 'admin', 'manager'))
  with check (auth_role() in ('owner', 'admin', 'manager'));

grant select on tarife_publice to anon, authenticated;

-- ============================================================
-- Seed inițial — oferta curentă (de revizuit de owner în Setări → Tarife publice).
-- Prețuri lunare/ședință = cele afișate azi; ofertă anuală copii = Anexa 1 contract
-- 2026-2027 (după 01.06.2026) cu discount integral 5% (NU 10%, conform contractului).
-- ============================================================
insert into tarife_publice (program, descriere, pret, taxa_rezervare, ordine, activ)
select * from (values
  ('Ședință individuală 60 min', 'Pay-per-class (drop-in)',                 '50 lei',  null,    10, true),
  ('Ședință individuală 90 min', 'Pay-per-class (drop-in)',                 '60 lei',  null,    20, true),
  ('Abonament 1×/săpt. (60 min)', 'Lunar',                                  '170 lei/lună', null, 30, true),
  ('Abonament 1×/săpt. (90 min)', 'Lunar',                                  '200 lei/lună', null, 40, true),
  ('Abonament 2×/săpt. (60 min)', 'Lunar',                                  '260 lei/lună', null, 50, true),
  ('Curs copii part-time', '35 ședințe/an (sept.–iun.), 1×/săpt.', '1.800 lei/an în 10 rate · −5% la plata integrală', '50 lei', 60, true),
  ('Curs copii full',      '70 ședințe/an (sept.–iun.), 2×/săpt.', '2.700 lei/an în 10 rate · −5% la plata integrală', '50 lei', 70, true)
) as v(program, descriere, pret, taxa_rezervare, ordine, activ)
where not exists (select 1 from tarife_publice);
