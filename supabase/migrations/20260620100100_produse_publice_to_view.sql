-- STEP 1 unificare: `produse_publice` (tabel manual) devine un VIEW peste `inventar`,
-- ca un articol de merch să se introducă O SINGURĂ DATĂ (în inventar) și să apară pe
-- portalul /servicii via flagul `public`. View-ul expune EXACT coloanele citite de portal
-- (id, nume, descriere, pret, ordine, activ, created, updated) → portalul nu se atinge.

-- ── 1. Migrare date existente în inventar (idempotent, generic) ──────────────────
-- NU presupunem doar seed-urile inițiale: migrăm TOATE rândurile curente.
-- Match pe articol=nume cu `not exists` → re-rulabil. „Bilet spectacol" este de fapt
-- un BILET, nu merch; îl migrăm acum ca rând Merch public TEMPORAR ca portalul să arate
-- identic după Step 1. STEP 2 îl va înlocui cu un bilet derivat din `evenimente` și va
-- șterge acest rând temporar.
insert into inventar (articol, descriere, pret, categorie,
                      public, pret_public, descriere_publica, ordine_public)
select pp.nume, pp.descriere, pp.pret, 'Merch'::categorie_inventar,
       pp.activ, pp.pret, pp.descriere, pp.ordine
from produse_publice pp
where not exists (
  select 1 from inventar i where i.articol = pp.nume
);

-- ── 2. Înlocuiește tabelul cu un view ────────────────────────────────────────────
-- Drop care funcționează și la prima rulare (e tabel) și la re-rulare (e deja view).
do $$
begin
  if exists (select 1 from information_schema.views
             where table_schema = 'public' and table_name = 'produse_publice') then
    execute 'drop view produse_publice';
  elsif exists (select 1 from information_schema.tables
                where table_schema = 'public' and table_name = 'produse_publice') then
    execute 'drop table produse_publice cascade';
  end if;
end $$;

create view produse_publice as
select
  i.id,
  i.articol                                  as nume,
  coalesce(i.descriere_publica, i.descriere) as descriere,
  coalesce(i.pret_public, i.pret)            as pret,
  i.ordine_public                            as ordine,
  i.public                                   as activ,
  i.created,
  i.updated
from inventar i
where i.public;

-- ── 3. Securitate (punct critic) ─────────────────────────────────────────────────
-- View-ul NU este `security_invoker` (INVERS față de celelalte view-uri din cod, care îl
-- au setat la true). Astfel rulează cu privilegiile owner-ului (postgres) și ocolește RLS
-- pe `inventar`, expunând rolului `anon` DOAR coloanele publice de mai sus — niciodată
-- stoc/locatie/pret intern. NU adăugăm politică anon pe `inventar`; rămâne authenticated-only.
-- ⚠️ Dacă cineva setează `security_invoker = true` pe acest view, portalul devine GOL pentru anon.
grant select on produse_publice to anon, authenticated;
