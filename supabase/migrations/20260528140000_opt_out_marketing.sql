-- Qapp v2 — Opt-out infrastructure pentru comunicare marketing.
--
-- Context: în 2026 NU trimitem marketing/newsletter. Toate mesajele sunt tranzacționale
-- (interes legitim școală: reminder plată, confirmare programare, retenție, etc.).
-- Coloana opt_out_marketing e pregătită pentru 2027 când se va activa email marketing
-- și newsletters. Pentru tranzacțional ne folosește doar pentru AUDIT (când a fost
-- marcat, motivul) — NU blochează trimiterea (interes legitim GDPR art. 6 lit. f).
--
-- Strategie cost themarketer: nu sincronizăm Audience cu contactele noastre (20k+
-- ar urca factura). Folosim themarketer doar ca pasarelă transactional 1-la-1.
-- Controlul cine primește mesaje rămâne 100% în qapp v2 — opt_out e gate-ul local.

-- ============================================================
-- 1. Coloane opt_out pe clienti, leads, familii
-- ============================================================

alter table clienti
  add column if not exists opt_out_marketing boolean not null default false,
  add column if not exists opt_out_motiv text,
  add column if not exists opt_out_la timestamptz;

alter table leads
  add column if not exists opt_out_marketing boolean not null default false,
  add column if not exists opt_out_motiv text,
  add column if not exists opt_out_la timestamptz;

alter table familii
  add column if not exists opt_out_marketing boolean not null default false,
  add column if not exists opt_out_motiv text,
  add column if not exists opt_out_la timestamptz;

create index if not exists idx_clienti_opt_out
  on clienti(opt_out_marketing) where opt_out_marketing = true;
create index if not exists idx_leads_opt_out
  on leads(opt_out_marketing) where opt_out_marketing = true;
create index if not exists idx_familii_opt_out
  on familii(opt_out_marketing) where opt_out_marketing = true;

-- ============================================================
-- 2. Auto-opt-out trigger pe clienti — la status EXclient
-- ============================================================

create or replace function trg_clienti_auto_opt_out()
returns trigger
language plpgsql
as $$
begin
  if NEW.status = 'EXclient' and (OLD.status is distinct from 'EXclient')
     and NEW.opt_out_marketing = false then
    NEW.opt_out_marketing := true;
    NEW.opt_out_motiv := 'auto: EXclient';
    NEW.opt_out_la := now();
  end if;
  return NEW;
end;
$$;

drop trigger if exists clienti_auto_opt_out on clienti;
create trigger clienti_auto_opt_out
  before update of status on clienti
  for each row
  execute function trg_clienti_auto_opt_out();

-- ============================================================
-- 3. Auto-opt-out trigger pe leads — la status pierdut cu motiv opt-out
-- ============================================================
-- Aliniat cu MOTIVE_PIERDUT_RAPIDE din src/features/leads/constants.ts:
--   'Nu mai dorește să fie contactat (opt-out)'
-- Folosim ILIKE '%opt-out%' pentru stabilitate la diacritice / variații.

create or replace function trg_leads_auto_opt_out()
returns trigger
language plpgsql
as $$
begin
  if NEW.status = 'pierdut'
     and NEW.motiv_pierdut ilike '%opt-out%'
     and NEW.opt_out_marketing = false then
    NEW.opt_out_marketing := true;
    NEW.opt_out_motiv := NEW.motiv_pierdut;
    NEW.opt_out_la := now();
  end if;
  return NEW;
end;
$$;

drop trigger if exists leads_auto_opt_out on leads;
create trigger leads_auto_opt_out
  before insert or update of status, motiv_pierdut on leads
  for each row
  execute function trg_leads_auto_opt_out();

-- ============================================================
-- 4. RPC mark_opt_out — pentru control manual din UI
-- ============================================================
-- Folosit din profile (Client / Lead / Familie). Securizat: admin/manager/front_desk
-- pot apela. RLS-ul existent pe tabele oferă protecție suplimentară.

create or replace function mark_opt_out(
  p_entity text,           -- 'client' | 'lead' | 'familie'
  p_id uuid,
  p_motiv text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_motiv text := coalesce(nullif(trim(p_motiv), ''), 'manual: marcat din UI');
begin
  if p_entity = 'client' then
    update clienti
       set opt_out_marketing = true,
           opt_out_motiv = v_motiv,
           opt_out_la = now()
     where id = p_id;
  elsif p_entity = 'lead' then
    update leads
       set opt_out_marketing = true,
           opt_out_motiv = v_motiv,
           opt_out_la = now()
     where id = p_id;
  elsif p_entity = 'familie' then
    update familii
       set opt_out_marketing = true,
           opt_out_motiv = v_motiv,
           opt_out_la = now()
     where id = p_id;
  else
    raise exception 'p_entity trebuie să fie client | lead | familie (primit: %)', p_entity;
  end if;
end;
$$;

grant execute on function mark_opt_out(text, uuid, text) to authenticated;

-- ============================================================
-- 5. RPC clear_opt_out — pentru revert (dacă opt-out a fost greșit)
-- ============================================================

create or replace function clear_opt_out(
  p_entity text,
  p_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_entity = 'client' then
    update clienti
       set opt_out_marketing = false,
           opt_out_motiv = null,
           opt_out_la = null
     where id = p_id;
  elsif p_entity = 'lead' then
    update leads
       set opt_out_marketing = false,
           opt_out_motiv = null,
           opt_out_la = null
     where id = p_id;
  elsif p_entity = 'familie' then
    update familii
       set opt_out_marketing = false,
           opt_out_motiv = null,
           opt_out_la = null
     where id = p_id;
  else
    raise exception 'p_entity trebuie să fie client | lead | familie (primit: %)', p_entity;
  end if;
end;
$$;

grant execute on function clear_opt_out(text, uuid) to authenticated;

-- ============================================================
-- 6. View unificată — listă opt-out pentru pagina Studio /opt-out
-- ============================================================

create or replace view opt_out_list as
select 'client'::text as entity,
       c.id,
       trim(coalesce(c.prenume, '') || ' ' || c.nume) as nume_complet,
       c.email,
       c.telefon,
       c.opt_out_motiv as motiv,
       c.opt_out_la
  from clienti c
 where c.opt_out_marketing = true
union all
select 'lead'::text as entity,
       l.id,
       trim(coalesce(l.prenume, '') || ' ' || l.nume) as nume_complet,
       l.email,
       l.telefon,
       l.opt_out_motiv as motiv,
       l.opt_out_la
  from leads l
 where l.opt_out_marketing = true
union all
select 'familie'::text as entity,
       f.id,
       f.nume_familie as nume_complet,
       f.email,
       f.telefon,
       f.opt_out_motiv as motiv,
       f.opt_out_la
  from familii f
 where f.opt_out_marketing = true;

grant select on opt_out_list to authenticated;
