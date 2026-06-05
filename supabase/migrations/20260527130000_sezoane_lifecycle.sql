-- Qapp v2 — Sezoane lifecycle (stare/tip), enrollments.sezon_id, vacanțe
--
-- 1. sezoane.stare ('planificat' / 'activ' / 'arhivat') sincronizat cu legacy `activ`
-- 2. sezoane.tip ('principal' / 'extra')
-- 3. enrollments.sezon_id (FK + auto-derive din cursuri.sezon)
-- 4. Tabela `vacante` (interval în interiorul unui sezon)
-- 5. Triggeri:
--    - sezoane: menține `activ` <-> `stare` în sync
--    - cursuri: dacă sezonul are tip='extra', forțează facultativ=true
--    - enrollments: la INSERT, dacă sezon_id e null derivă din cursuri.sezon
--    - vacante: intervalul trebuie să fie în interiorul sezonului
-- ============================================================================

-- ============================================================================
-- 1. SEZOANE.STARE + SEZOANE.TIP
-- ============================================================================

alter table sezoane add column if not exists stare text not null default 'planificat'
  check (stare in ('planificat', 'activ', 'arhivat'));

alter table sezoane add column if not exists tip text not null default 'principal'
  check (tip in ('principal', 'extra'));

-- Backfill stare din `activ` + `data_final`
update sezoane set stare = case
  when activ is true then 'activ'
  when data_final is not null and data_final < current_date then 'arhivat'
  else 'planificat'
end;

-- Index unique parțial pe stare='activ' (în plus față de cel pe activ=true)
-- Garantează că max 1 sezon e în stare activă, indiferent de tip.
create unique index if not exists sezoane_unique_stare_activ
  on sezoane(stare) where stare = 'activ';

-- ============================================================================
-- 2. TRIGGER SYNC activ <-> stare
-- ============================================================================

create or replace function _sezon_sync_activ_stare()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.activ is true then
      new.stare := 'activ';
    elsif new.stare = 'activ' then
      new.activ := true;
    end if;
    return new;
  end if;

  -- UPDATE: dacă unul a fost schimbat, sincronizează celălalt
  if new.activ is distinct from old.activ then
    new.stare := case
      when new.activ then 'activ'
      when old.stare = 'activ' then 'planificat'
      else old.stare
    end;
  end if;
  if new.stare is distinct from old.stare then
    new.activ := (new.stare = 'activ');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sezon_sync_activ_stare on sezoane;
create trigger trg_sezon_sync_activ_stare
  before insert or update on sezoane
  for each row execute function _sezon_sync_activ_stare();

-- ============================================================================
-- 3. TRIGGER cursuri: extra-sezon ⇒ facultativ=true
-- ============================================================================

create or replace function _curs_check_extra_sezon()
returns trigger
language plpgsql
as $$
declare
  v_tip text;
begin
  if new.sezon is null then
    return new;
  end if;
  select tip into v_tip from sezoane where id = new.sezon;
  if v_tip = 'extra' and new.facultativ is not true then
    raise exception 'Cursurile dintr-un extra-sezon trebuie să fie facultative.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_curs_check_extra_sezon on cursuri;
create trigger trg_curs_check_extra_sezon
  before insert or update of sezon, facultativ on cursuri
  for each row execute function _curs_check_extra_sezon();

-- ============================================================================
-- 4. ENROLLMENTS.SEZON_ID
-- ============================================================================

alter table enrollments add column if not exists sezon_id uuid;

alter table enrollments drop constraint if exists fk_enrollments_sezon;
alter table enrollments add constraint fk_enrollments_sezon
  foreign key (sezon_id) references sezoane(id) on delete set null;

create index if not exists idx_enrollments_sezon on enrollments(sezon_id);

-- Backfill: ia sezonul din cursul asociat
update enrollments e
set sezon_id = c.sezon
from cursuri c
where e.cursul = c.id
  and e.sezon_id is null
  and c.sezon is not null;

-- Trigger: la INSERT, dacă sezon_id e null derivă din cursuri.sezon
create or replace function _enrollment_derive_sezon()
returns trigger
language plpgsql
as $$
begin
  if new.sezon_id is null and new.cursul is not null then
    select sezon into new.sezon_id from cursuri where id = new.cursul;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enrollment_derive_sezon on enrollments;
create trigger trg_enrollment_derive_sezon
  before insert on enrollments
  for each row execute function _enrollment_derive_sezon();

-- ============================================================================
-- 5. VACANȚE
-- ============================================================================

create table if not exists vacante (
  id             uuid primary key default gen_random_uuid(),
  sezon_id       uuid not null references sezoane(id) on delete cascade,
  nume           text not null,
  data_incepere  date not null,
  data_final     date not null,
  created        timestamptz not null default now(),
  updated        timestamptz not null default now(),
  check (data_final >= data_incepere)
);

create index if not exists idx_vacante_sezon on vacante(sezon_id);
create index if not exists idx_vacante_interval on vacante(data_incepere, data_final);

-- Trigger: intervalul vacanței trebuie să fie în interiorul sezonului
create or replace function _vacanta_check_interval()
returns trigger
language plpgsql
as $$
declare
  v_start date;
  v_end date;
begin
  select data_incepere, data_final into v_start, v_end
  from sezoane where id = new.sezon_id;

  if v_start is null or v_end is null then
    raise exception 'Sezonul trebuie să aibă data_incepere și data_final setate înainte de a adăuga vacanțe.'
      using errcode = 'check_violation';
  end if;

  if new.data_incepere < v_start or new.data_final > v_end then
    raise exception 'Intervalul vacanței (% – %) trebuie să fie în interiorul sezonului (% – %).',
      new.data_incepere, new.data_final, v_start, v_end
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_vacanta_check_interval on vacante;
create trigger trg_vacanta_check_interval
  before insert or update on vacante
  for each row execute function _vacanta_check_interval();

-- Trigger updated
drop trigger if exists trg_vacante_updated on vacante;
create trigger trg_vacante_updated
  before update on vacante
  for each row execute function set_updated_timestamp();

-- ============================================================================
-- 6. RLS pentru vacante
-- ============================================================================

alter table vacante enable row level security;

drop policy if exists vacante_select on vacante;
create policy vacante_select on vacante for select using (true);

drop policy if exists vacante_admin_write on vacante;
create policy vacante_admin_write on vacante for all
  using (is_admin())
  with check (is_admin());
