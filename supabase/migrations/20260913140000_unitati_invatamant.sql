-- Qapp v2 — catalog de unități de învățământ + canonicalizare la scriere.
--
-- Problema: `clienti.unitate_invatamant` e text liber scris de recepție ȘI de
-- membri (portalul are câmpul în profil). Din 6.248 de clienți doar 6 aveau
-- valoare, dar printre ele deja „Valea Lupului" / „Valea lupului" și „UMF Iași"
-- / „UMF" — adică exact drift-ul care face imposibilă centralizarea.
--
-- Soluția are două jumătăți:
--   1) un catalog (`unitati_invatamant`) cu numele canonic, unic pe cheia
--      normalizată (fără diacritice, fără punctuație, lowercase);
--   2) un trigger pe `clienti` care rescrie textul introdus la numele canonic
--      și leagă rândul de catalog. Trigger, nu validare în UI, fiindcă ușile
--      sunt trei: recepția (qapp), membrul (portal, prin RPC) și importurile.
--      Ce nu există în catalog se adaugă automat, marcat `de_verificat`.

-- ============================================================
-- 1) Normalizare — IMMUTABLE, ca să poată sta într-un index unic.
-- ============================================================
create or replace function norm_unitate(p_text text)
returns text
language sql
immutable
as $$
  select nullif(
    regexp_replace(
      btrim(
        regexp_replace(
          lower(translate(coalesce(p_text, ''),
            'ăâîșțşţĂÂÎȘȚŞŢ',
            'aaistst' || 'aaistst')),
          '[^a-z0-9]+', ' ', 'g')
      ),
      ' +', ' ', 'g'),
    '')
$$;

revoke execute on function norm_unitate(text) from anon, public;
grant execute on function norm_unitate(text) to authenticated;

-- ============================================================
-- 2) Catalogul
-- ============================================================
create table unitati_invatamant (
  id           uuid primary key default gen_random_uuid(),
  nume         text not null,
  -- Grădiniță / Școală / Liceu / Universitate / Altele — liber, dar completat
  -- din UI dintr-o listă scurtă.
  tip          text,
  localitate   text,
  -- Intrare născută din ce a tastat cineva, nu din lista curatoriată: apare în
  -- Administrare ca „de verificat" până o confirmă un manager.
  de_verificat boolean not null default false,
  created_at   timestamptz not null default now()
);

create unique index unitati_invatamant_norm_uniq
  on unitati_invatamant (norm_unitate(nume));
create index unitati_invatamant_localitate_idx on unitati_invatamant (localitate);

alter table clienti
  add column unitate_invatamant_id uuid references unitati_invatamant(id);
create index clienti_unitate_invatamant_id_idx on clienti (unitate_invatamant_id);

comment on column clienti.unitate_invatamant is
  'Numele canonic al unității (ținut în sincron cu catalogul de trigger). Rămâne text: portalul îl citește/scrie prin get_profil_client / update_profil_client.';

-- ============================================================
-- 3) Canonicalizarea la scrierea pe client
-- ============================================================
create or replace function trg_clienti_unitate_canonic()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_norm text;
  v_id   uuid;
  v_nume text;
begin
  v_norm := norm_unitate(new.unitate_invatamant);

  if v_norm is null then
    new.unitate_invatamant := null;
    new.unitate_invatamant_id := null;
    return new;
  end if;

  select id, nume into v_id, v_nume
  from unitati_invatamant
  where norm_unitate(nume) = v_norm;

  if v_id is null then
    insert into unitati_invatamant (nume, de_verificat)
    values (btrim(new.unitate_invatamant), true)
    returning id, nume into v_id, v_nume;
  end if;

  new.unitate_invatamant := v_nume;
  new.unitate_invatamant_id := v_id;
  return new;
end;
$$;

revoke execute on function trg_clienti_unitate_canonic() from anon, public;

create trigger clienti_unitate_canonic
  before insert or update of unitate_invatamant on clienti
  for each row execute function trg_clienti_unitate_canonic();

-- Redenumirea în catalog se propagă la clienți — altfel textul de pe client ar
-- rămâne vechiul nume și raportarea s-ar rupe exact la corectura de nume.
create or replace function trg_unitate_rename_propaga()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.nume is distinct from old.nume then
    update clienti
       set unitate_invatamant = new.nume
     where unitate_invatamant_id = new.id
       and unitate_invatamant is distinct from new.nume;
  end if;
  return new;
end;
$$;

revoke execute on function trg_unitate_rename_propaga() from anon, public;

create trigger unitati_invatamant_rename
  after update of nume on unitati_invatamant
  for each row execute function trg_unitate_rename_propaga();

-- ============================================================
-- 4) Backfill — valorile existente intră în catalog prin același drum.
-- ============================================================
update clienti
   set unitate_invatamant = unitate_invatamant
 where norm_unitate(unitate_invatamant) is not null;

-- ============================================================
-- 5) RLS — staff-ul citește tot; recepția poate ADĂUGA (intrarea rămâne
--    „de_verificat"), dar redenumirea/ștergerea e a managerilor.
--    Gărzile: portalul (parinte) și agenția de ads (marketing) — deny total.
-- ============================================================
alter table unitati_invatamant enable row level security;

create policy unitati_invatamant_select on unitati_invatamant
  for select to authenticated using (true);

create policy unitati_invatamant_insert on unitati_invatamant
  for insert to authenticated
  with check ((select auth_role()) in ('owner', 'admin', 'manager', 'front_desk'));

create policy unitati_invatamant_update on unitati_invatamant
  for update to authenticated
  using ((select auth_role()) in ('owner', 'admin', 'manager'))
  with check ((select auth_role()) in ('owner', 'admin', 'manager'));

create policy unitati_invatamant_delete on unitati_invatamant
  for delete to authenticated
  using ((select auth_role()) in ('owner', 'admin', 'manager'));

create policy deny_parinte_direct on unitati_invatamant
  as restrictive for all to authenticated
  using ((select auth_role()) <> 'parinte')
  with check ((select auth_role()) <> 'parinte');

create policy deny_marketing_direct on unitati_invatamant
  as restrictive for all to authenticated
  using ((select auth_role()) <> 'marketing')
  with check ((select auth_role()) <> 'marketing');
