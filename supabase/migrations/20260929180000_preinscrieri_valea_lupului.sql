-- Campania „Quasar Dance vine în Valea Lupului” (deschidere noiembrie 2026, Școala Verde).
-- Brief: docs/handoff/2026-09-29-campanie-valea-lupului.md + review-ul lui; decizii Alex 29.09.2026.
--
-- 1) Locația nouă în `locatii` (adresa și telefonul vin când sunt stabilite; până atunci
--    SMS-urile cu adresă nu pleacă pentru ea — vezi _shared/sms.ts).
-- 2) `preinscrieri_campanie` — un rând per PARTICIPANT (copil sau adult), nu per formular:
--    doi frați de pe același telefon sunt două rânduri și, la nevoie, două leaduri,
--    pentru că programarea la DEMO e unică pe (lead, eveniment).
--    Preînscrierea ≠ înscriere: e interes declarat, folosit ca să decidem grupele și
--    cererea de închiriere a sălii.

-- ============================================================
-- 1) Locația
-- ============================================================
insert into public.locatii (nume)
select 'Valea Lupului'
 where not exists (select 1 from public.locatii where locatie_norm(nume) = 'valea lupului');

-- ============================================================
-- 2) Preînscrierile
-- ============================================================
create table public.preinscrieri_campanie (
  id                            uuid primary key default gen_random_uuid(),
  campanie                      text not null,
  locatie_id                    uuid not null references public.locatii(id),
  -- Un formular trimis = un `trimitere_id` (generat de pagină la încărcare). Retry-ul
  -- aceluiași POST lovește unicitatea și nu dublează nimic.
  trimitere_id                  uuid not null,
  participant_index             smallint not null check (participant_index between 0 and 9),
  -- Participantul rezolvat: leadul lui sau clientul existent (ramura p_client la DEMO).
  lead_id                       uuid references public.leads(id) on delete cascade,
  client_id                     uuid references public.clienti(id) on delete set null,
  -- Contactul așa cum l-a scris omul în formular (pe el îl sunăm).
  nume_contact                  text not null,
  telefon                       text not null,
  email                         text,
  participant                   text not null check (participant in ('copil', 'adult')),
  nume_participant              text not null,
  varsta                        smallint check (varsta between 2 and 99),
  elev_scoala_verde             boolean,
  stiluri                       text[] not null
                                check (cardinality(stiluri) > 0
                                       and stiluri <@ array['Street Dance', 'Gimnastica', 'K-Pop', 'Zumba']),
  -- Perechi zi × interval, ex. 'Lu 15-17'. Perechi, nu două liste: „luni" + „17-19"
  -- nu spune că omul poate luni la 17.
  disponibilitate               text[] not null default '{}'
                                check (disponibilitate <@ array[
                                  'Lu 13-15', 'Lu 15-17', 'Lu 17-19',
                                  'Ma 13-15', 'Ma 15-17', 'Ma 17-19',
                                  'Mi 13-15', 'Mi 15-17', 'Mi 17-19',
                                  'Jo 13-15', 'Jo 15-17', 'Jo 17-19',
                                  'Vi 13-15', 'Vi 15-17', 'Vi 17-19']),
  -- Confirmarea la telefon e separată de status: un apel poate duce și la retragere.
  disponibilitate_confirmata_la timestamptz,
  confirmata_de                 uuid references auth.users(id) on delete set null,
  observatii                    text,
  nota_staff                    text,
  acord_marketing               boolean not null default false,
  acord_text_versiune           text,
  utm_campaign                  text,
  utm_source                    text,
  utm_medium                    text,
  utm_content                   text,
  status                        text not null default 'primit'
                                check (status in ('primit', 'contactat', 'asteapta_programul',
                                                  'programat_demo', 'inrolat', 'retras')),
  created                       timestamptz not null default now(),
  updated                       timestamptz not null default now(),
  unique (trimitere_id, participant_index),
  check (lead_id is not null or client_id is not null)
);
create index preinscrieri_campanie_lead_idx on public.preinscrieri_campanie (lead_id);
create index preinscrieri_campanie_client_idx on public.preinscrieri_campanie (client_id);
create index preinscrieri_campanie_campanie_idx on public.preinscrieri_campanie (campanie, created);

create trigger trg_preinscrieri_campanie_updated before update on public.preinscrieri_campanie
  for each row execute function set_updated_timestamp();

-- Confirmarea valorează doar pentru grila confirmată: o grilă schimbată după apel
-- redevine „declarată". Cine confirmă se scrie din sesiune, nu din client.
create or replace function public.trg_preinscriere_confirmare()
returns trigger language plpgsql set search_path = public
as $$
begin
  if new.disponibilitate_confirmata_la is not null
     and old.disponibilitate_confirmata_la is null then
    new.confirmata_de := auth.uid();
  elsif new.disponibilitate is distinct from old.disponibilitate
     and new.disponibilitate_confirmata_la is not distinct from old.disponibilitate_confirmata_la then
    new.disponibilitate_confirmata_la := null;
    new.confirmata_de := null;
  end if;
  if new.disponibilitate_confirmata_la is null then
    new.confirmata_de := null;
  end if;
  return new;
end;
$$;

create trigger trg_preinscriere_confirmare before update on public.preinscrieri_campanie
  for each row execute function public.trg_preinscriere_confirmare();

-- ============================================================
-- 3) RLS, granturi, gărzi (AGENTS.md)
-- ============================================================
alter table public.preinscrieri_campanie enable row level security;

-- Inserarea vine doar din intake (service_role). Stafful citește și lucrează lista:
-- status, grila confirmată, nota lui. Restul coloanelor sunt ce a declarat omul.
revoke all on public.preinscrieri_campanie from anon, authenticated, public;
grant select on public.preinscrieri_campanie to authenticated;
grant update (status, stiluri, disponibilitate, disponibilitate_confirmata_la, nota_staff)
  on public.preinscrieri_campanie to authenticated;
grant all on public.preinscrieri_campanie to service_role;

create policy preinscrieri_campanie_select on public.preinscrieri_campanie
  for select to authenticated using (true);
create policy preinscrieri_campanie_update on public.preinscrieri_campanie
  for update to authenticated using (true) with check (true);

create policy deny_parinte_direct on public.preinscrieri_campanie as restrictive for all to authenticated
  using ((select auth_role()) <> 'parinte') with check ((select auth_role()) <> 'parinte');
create policy deny_marketing_direct on public.preinscrieri_campanie as restrictive for all to authenticated
  using ((select auth_role()) <> 'marketing') with check ((select auth_role()) <> 'marketing');
create policy deny_teacher_direct on public.preinscrieri_campanie as restrictive for all to authenticated
  using ((select auth_role()) <> 'teacher') with check ((select auth_role()) <> 'teacher');

revoke execute on function public.trg_preinscriere_confirmare() from anon, authenticated, public;

-- ============================================================
-- 4) GDPR: exportul și anonimizarea văd și preînscrierile
-- ============================================================
-- Legătura e pe participant (leadul lui sau clientul lui), nu pe telefon: un frate
-- cu același telefon nu intră în exportul celuilalt.
do $$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('gdpr_export_client(uuid, text)'::regprocedure);
  if v_def not like '%preinscrieri_campanie%' then
    v_def := replace(v_def,
      E'    ''recomandari'', (select',
      E'    ''preinscrieri'', (select coalesce(jsonb_agg(to_jsonb(p)), ''[]'') from preinscrieri_campanie p\n'
      || E'                     where client_id = p_client or lead_id = any(v_leads)),\n'
      || E'    ''recomandari'', (select');
    if v_def not like '%preinscrieri_campanie%' then
      raise exception 'gdpr_export_client: markerul nu a fost găsit';
    end if;
    execute v_def;
  end if;

  v_def := pg_get_functiondef('anonimizeaza_client(uuid, text)'::regprocedure);
  if v_def not like '%preinscrieri_campanie%' then
    v_def := replace(v_def,
      '  -- Urmele vechi din jurnal',
      E'  update preinscrieri_campanie\n'
      || E'     set nume_contact = ''Anonim'', nume_participant = ''Anonim'', telefon = '''', email = null,\n'
      || E'         observatii = null, nota_staff = null\n'
      || E'   where client_id = p_client or lead_id = any(v_leads);\n\n'
      || '  -- Urmele vechi din jurnal');
    if v_def not like '%preinscrieri_campanie%' then
      raise exception 'anonimizeaza_client: markerul nu a fost găsit';
    end if;
    execute v_def;
  end if;
end $$;
