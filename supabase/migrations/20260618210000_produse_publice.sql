-- Qapp v2 — listă „Produse publice" (merchandise) editabilă (owner/admin), afișată
-- INFORMATIV pe portalul de membri (/servicii). Scopul: justifică codul CAEN secundar
-- (comerț cu amănuntul) cerut la verificarea Netopia — NU e magazin online (fără coș/
-- checkout; portalul face doar plăți abonamente + rezervări OPEN class).
--
-- Model identic cu tarife_publice: owner/admin editează într-un loc, portalul reflectă
-- imediat. ⚠️ Citită de rolul `anon` (vizitator / recenzent Netopia) → SELECT public.

create table if not exists produse_publice (
  id        uuid primary key default gen_random_uuid(),
  nume      text not null,
  descriere text,
  pret      text not null,
  ordine    integer not null default 0,
  activ     boolean not null default true,
  created   timestamptz not null default now(),
  updated   timestamptz not null default now()
);

create index if not exists idx_produse_publice_ordine on produse_publice(ordine);

drop trigger if exists trg_produse_publice_updated on produse_publice;
create trigger trg_produse_publice_updated
  before update on produse_publice
  for each row execute function set_updated_timestamp();

-- ============================================================
-- RLS — citire publică (anon + staff); scriere owner/admin
-- ============================================================
alter table produse_publice enable row level security;

drop policy if exists produse_publice_select on produse_publice;
create policy produse_publice_select on produse_publice
  for select using (true);

drop policy if exists produse_publice_write on produse_publice;
create policy produse_publice_write on produse_publice
  for all to authenticated
  using (auth_role() in ('owner', 'admin'))
  with check (auth_role() in ('owner', 'admin'));

grant select on produse_publice to anon, authenticated;

-- ============================================================
-- Seed inițial — oferta curentă (de revizuit/extins de owner în Setări → Produse publice).
-- Biletul de spectacol e momentan doar rezervare informativă; un flux cu coduri QR
-- de scanat e prevăzut pentru un update viitor (separat).
-- ============================================================
insert into produse_publice (nume, descriere, pret, ordine, activ)
select * from (values
  ('Bilet spectacol', 'Acces la spectacolele Quasar Dance',          '40 lei', 10, true),
  ('Tricou exclusiv Quasar', 'Ediție limitată, logo Quasar',         '75 lei', 20, true)
) as v(nume, descriere, pret, ordine, activ)
where not exists (select 1 from produse_publice);
