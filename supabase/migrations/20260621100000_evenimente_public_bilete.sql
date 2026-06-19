-- STEP 2 unificare ofertă publică: biletele afișate pe portal derivă din `evenimente`
-- (sursa operațională), NU dintr-un rând manual de merch. Un eveniment cu bilet se
-- introduce O SINGURĂ DATĂ (în Evenimente); flagul `public` îl publică pe /servicii.
-- Mod identic cu Step 1 (inventar → produse_publice): tabel operațional + flag + VIEW
-- public citit de `anon`.

-- ── 1. Flag de publicare pe evenimente ───────────────────────────────────────────
-- Aditiv — coloana moștenește politicile RLS existente (authenticated select / staff write).
alter table evenimente
  add column if not exists public boolean not null default false;

create index if not exists idx_evenimente_public on evenimente(public) where public;

-- ── 2. View public `bilete_publice` ──────────────────────────────────────────────
-- Expune DOAR coloanele potrivite publicului (fără cost_organizare/organizator/notite/
-- participant). Filtrează la evenimente publice, viitoare și neanulate.
drop view if exists bilete_publice;
create view bilete_publice as
select
  e.id,
  e.nume_eveniment as nume,
  e.descriere,
  e.data,
  e.locatia        as locatie,
  e.pret_bilet,
  e.capacitate
from evenimente e
where e.public
  and coalesce(e.data::date, current_date) >= current_date
  and (e.status is null or e.status <> 'Anulat')
order by e.data asc nulls last;

-- ── 3. Securitate (punct critic, identic cu produse_publice) ──────────────────────
-- View-ul NU este `security_invoker` → rulează cu privilegiile owner-ului (postgres) și
-- expune rolului `anon` DOAR coloanele de mai sus, ocolind RLS pe `evenimente` (care
-- rămâne authenticated-only). NU adăugăm politică anon pe `evenimente`.
-- ⚠️ Dacă cineva setează `security_invoker = true`, portalul devine GOL pentru anon.
grant select on bilete_publice to anon, authenticated;

-- ── 4. Curăță rândul temporar „Bilet spectacol" din inventar ──────────────────────
-- Step 1 l-a migrat ca rând Merch public TEMPORAR ca portalul să arate identic; acum
-- biletele vin din `evenimente`, deci îl retragem. Ștergem doar dacă nu e referit de
-- vreo încasare (FK incasari.articol_inventar); altfel doar îl scoatem de pe portal.
do $$
declare v_id uuid;
begin
  select id into v_id from inventar
    where articol = 'Bilet spectacol' and categorie = 'Merch'
    limit 1;
  if v_id is null then return; end if;
  if exists (select 1 from incasari where articol_inventar = v_id) then
    update inventar set public = false where id = v_id;
  else
    delete from inventar where id = v_id;
  end if;
end $$;
