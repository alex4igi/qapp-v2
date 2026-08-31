-- Inscrierea la o clasa demo: capacitate reala, participanti-clienti cu prezenta,
-- walk-in fara fisa si „adus de un cursant".
--
-- Doua tabele poarta inscrierile:
--   • lead   -> `programari_leads` (NEATINS ca model: alimenteaza coada de SMS,
--               cron-morning, follow-up-ul de no-show, get_lead_funnel,
--               prune_expired_leads si triggerul sync_lead_neprezentari)
--   • client -> `evenimente_participanti` (nou)
--
-- De ce un tabel si nu `evenimente.participant uuid[]`: array-ul n-are unde tine
-- prezenta, iar `prezente` cere `enrollment` (unique pe (enrollment, data)) —
-- un cursant care incearca alt stil n-are inrolare pe grupa tinta. Deci nu exista
-- azi niciun loc in care sa scrii „cursantul X a venit la demo".

-- ============================================================
-- 1) Participanti-clienti, cu prezenta
-- ============================================================
create table if not exists evenimente_participanti (
  id              uuid primary key default gen_random_uuid(),
  eveniment       uuid not null references evenimente(id) on delete cascade,
  client          uuid not null references clienti(id)    on delete cascade,
  -- Acelasi enum ca la leaduri: aceleasi trei stari, aceeasi mapare in UI.
  prezenta        prezenta_lead not null default 'programat',
  sursa_inscriere text check (sursa_inscriere is null
                              or sursa_inscriere in ('receptie', 'walk_in', 'recomandare')),
  adus_de         uuid references clienti(id) on delete set null,
  observatii      text,
  created         timestamptz not null default now(),
  updated         timestamptz not null default now(),
  unique (eveniment, client)
);

create index if not exists idx_ev_participanti_eveniment on evenimente_participanti (eveniment);
create index if not exists idx_ev_participanti_client    on evenimente_participanti (client);

alter table evenimente_participanti enable row level security;

create policy evenimente_participanti_select on evenimente_participanti
  for select to authenticated using (true);
create policy evenimente_participanti_write on evenimente_participanti
  for all to authenticated
  using (auth_role() in ('owner', 'admin', 'manager', 'front_desk'))
  with check (auth_role() in ('owner', 'admin', 'manager', 'front_desk'));

-- Garduri obligatorii (vezi CLAUDE.md). `marketing` primeste deny TOTAL: sunt
-- date de client (PII), nu date de atribuire.
create policy deny_parinte_direct on evenimente_participanti
  as restrictive for all to authenticated
  using (auth_role() <> 'parinte') with check (auth_role() <> 'parinte');
create policy deny_marketing_direct on evenimente_participanti
  as restrictive for all to authenticated
  using (auth_role() <> 'marketing') with check (auth_role() <> 'marketing');

drop trigger if exists trg_ev_participanti_updated on evenimente_participanti;
create trigger trg_ev_participanti_updated
  before update on evenimente_participanti
  for each row execute function set_updated_timestamp();

-- Backfill din array. `participant[]` ramane sincronizat (dual-write mai jos) ca
-- cititorii vechi — getEvenimentRoster, getDashboardEvents — sa nu se rupa.
insert into evenimente_participanti (eveniment, client, sursa_inscriere)
select e.id, c.client_id, 'receptie'
  from evenimente e
  cross join lateral unnest(coalesce(e.participant, '{}'::uuid[])) as c(client_id)
 where exists (select 1 from clienti cl where cl.id = c.client_id)
on conflict (eveniment, client) do nothing;

-- ============================================================
-- 2) Inscrierea leadului capata provenienta
-- ============================================================
alter table programari_leads
  add column if not exists sursa_inscriere text,
  add column if not exists adus_de uuid references clienti(id) on delete set null;

alter table programari_leads drop constraint if exists programari_leads_sursa_inscriere_check;
alter table programari_leads
  add constraint programari_leads_sursa_inscriere_check
  check (sursa_inscriere is null
         or sursa_inscriere in ('receptie', 'walk_in', 'recomandare'));

-- `<= 1`, nu `= 1`: randurile istorice au ambele coloane null.
-- Audit 2026-08-31: 0 randuri au ambele setate, deci constrangerea e valida acum.
alter table programari_leads drop constraint if exists programari_leads_curs_xor_eveniment;
alter table programari_leads
  add constraint programari_leads_curs_xor_eveniment
  check (num_nonnulls(cursul_programat, eveniment_programat) <= 1);

-- O singura inscriere per (lead, eveniment): reinscrierea devine idempotenta si
-- rosterul nu mai poate arata acelasi om de doua ori.
-- Audit 2026-08-31: 0 perechi duplicate.
create unique index if not exists uq_programare_lead_eveniment
  on programari_leads (lead, eveniment_programat) where eveniment_programat is not null;

-- ============================================================
-- 3) Numaratoarea de locuri
-- ============================================================
create or replace function locuri_ocupate_eveniment(p_eveniment uuid)
returns integer
language sql stable security definer set search_path = public as $$
  select (select count(*) from programari_leads      where eveniment_programat = p_eveniment)
       + (select count(*) from evenimente_participanti where eveniment = p_eveniment);
$$;

revoke execute on function locuri_ocupate_eveniment(uuid) from anon, public;
grant  execute on function locuri_ocupate_eveniment(uuid) to authenticated;

-- ============================================================
-- 4) Inscrierea, atomica, cu verificare de capacitate
--
-- RPC si nu trigger: inscrierile vin pe DOUA tabele (ar insemna doua triggere cu
-- aceeasi invarianta duplicata), iar override-ul de suprarezervare ar cere un GUC
-- de sesiune. Acelasi tipar ca `rezerva_loc_open(..., p_permite_overbook)`.
-- ============================================================
create or replace function inscrie_la_demo(
  p_eveniment        uuid,
  p_lead             uuid    default null,
  p_client           uuid    default null,
  p_sursa            text    default 'receptie',
  p_adus_de          uuid    default null,
  p_permite_overbook boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  e         record;
  v_ocupat  int;
  v_id      uuid;
begin
  if auth_role() not in ('owner', 'admin', 'manager', 'front_desk') then
    raise exception 'Acces interzis.';
  end if;
  if num_nonnulls(p_lead, p_client) <> 1 then
    raise exception 'Trebuie exact un lead SAU un client.';
  end if;

  -- Serializeaza inscrierile concurente pe acelasi slot.
  select * into e from evenimente where id = p_eveniment for update;
  if not found then
    raise exception 'Evenimentul nu exista.';
  end if;
  if e.status = 'Anulat' then
    raise exception 'Evenimentul e anulat.';
  end if;

  -- Idempotent: reinscrierea nu dubleaza si nu reseteaza prezenta deja marcata.
  if p_lead is not null then
    select id into v_id from programari_leads
     where lead = p_lead and eveniment_programat = p_eveniment limit 1;
  else
    select id into v_id from evenimente_participanti
     where client = p_client and eveniment = p_eveniment limit 1;
  end if;

  if v_id is null then
    v_ocupat := locuri_ocupate_eveniment(p_eveniment);
    if e.capacitate is not null and v_ocupat >= e.capacitate and not p_permite_overbook then
      raise exception 'Clasa e completa (% / % locuri).', v_ocupat, e.capacitate
        using errcode = 'check_violation';
    end if;
  end if;

  if p_lead is not null then
    if v_id is null then
      insert into programari_leads (
        lead, eveniment_programat, locatie, data_programarii, ora,
        prezenta, sursa_inscriere, adus_de
      ) values (
        p_lead, p_eveniment, e.locatie_id, e.data, e.ora,
        'programat', p_sursa, p_adus_de
      ) returning id into v_id;
    else
      update programari_leads
         set sursa_inscriere = coalesce(p_sursa, sursa_inscriere),
             adus_de = coalesce(p_adus_de, adus_de),
             updated = now()
       where id = v_id;
    end if;

    -- Leadul intra in coloana „Programat" doar daca nu e deja mai departe in
    -- pipeline (a_venit / convertit nu se dau inapoi).
    update leads
       set status = 'programat', data_programare = e.data, updated = now()
     where id = p_lead
       and status in ('nou', 'contactat', 'waiting_list', 'nurture', 'nu_a_venit');
  else
    if v_id is null then
      insert into evenimente_participanti (eveniment, client, sursa_inscriere, adus_de)
      values (p_eveniment, p_client, p_sursa, p_adus_de)
      returning id into v_id;
    else
      update evenimente_participanti
         set sursa_inscriere = coalesce(p_sursa, sursa_inscriere),
             adus_de = coalesce(p_adus_de, adus_de),
             updated = now()
       where id = v_id;
    end if;
    -- Dual-write: cititorii vechi citesc inca array-ul.
    update evenimente
       set participant = case
             when p_client = any(coalesce(participant, '{}'::uuid[])) then participant
             else coalesce(participant, '{}'::uuid[]) || p_client
           end,
           updated = now()
     where id = p_eveniment;
  end if;

  return v_id;
end;
$$;

create or replace function anuleaza_inscriere_demo(
  p_eveniment uuid,
  p_lead      uuid default null,
  p_client    uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth_role() not in ('owner', 'admin', 'manager', 'front_desk') then
    raise exception 'Acces interzis.';
  end if;
  if num_nonnulls(p_lead, p_client) <> 1 then
    raise exception 'Trebuie exact un lead SAU un client.';
  end if;

  if p_lead is not null then
    delete from programari_leads
     where lead = p_lead and eveniment_programat = p_eveniment;
  else
    delete from evenimente_participanti
     where client = p_client and eveniment = p_eveniment;
    update evenimente
       set participant = array_remove(coalesce(participant, '{}'::uuid[]), p_client),
           updated = now()
     where id = p_eveniment;
  end if;
end;
$$;

create or replace function marcheaza_prezenta_client_demo(
  p_eveniment uuid,
  p_client    uuid,
  p_prezenta  prezenta_lead
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth_role() not in ('owner', 'admin', 'manager', 'front_desk', 'teacher') then
    raise exception 'Acces interzis.';
  end if;
  update evenimente_participanti
     set prezenta = p_prezenta, updated = now()
   where eveniment = p_eveniment and client = p_client;
  if not found then
    raise exception 'Cursantul nu e inscris la acest eveniment.';
  end if;
end;
$$;

revoke execute on function inscrie_la_demo(uuid, uuid, uuid, text, uuid, boolean) from anon, public;
revoke execute on function anuleaza_inscriere_demo(uuid, uuid, uuid) from anon, public;
revoke execute on function marcheaza_prezenta_client_demo(uuid, uuid, prezenta_lead) from anon, public;
grant  execute on function inscrie_la_demo(uuid, uuid, uuid, text, uuid, boolean) to authenticated;
grant  execute on function anuleaza_inscriere_demo(uuid, uuid, uuid) to authenticated;
grant  execute on function marcheaza_prezenta_client_demo(uuid, uuid, prezenta_lead) to authenticated;

-- ============================================================
-- 5) Dual-write pe RPC-urile vechi de participanti
--    Semnaturi neschimbate — apelantii existenti nu se ating.
-- ============================================================
create or replace function add_eveniment_participant(p_eveniment uuid, p_client uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth_role() not in ('owner', 'admin', 'manager', 'front_desk') then
    raise exception 'Acces interzis';
  end if;
  insert into evenimente_participanti (eveniment, client, sursa_inscriere)
  values (p_eveniment, p_client, 'receptie')
  on conflict (eveniment, client) do nothing;
  update evenimente
  set participant = case
        when p_client = any(coalesce(participant, '{}'::uuid[])) then participant
        else coalesce(participant, '{}'::uuid[]) || p_client
      end,
      updated = now()
  where id = p_eveniment;
end;
$$;

create or replace function remove_eveniment_participant(p_eveniment uuid, p_client uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth_role() not in ('owner', 'admin', 'manager', 'front_desk') then
    raise exception 'Acces interzis';
  end if;
  delete from evenimente_participanti where eveniment = p_eveniment and client = p_client;
  update evenimente
  set participant = array_remove(coalesce(participant, '{}'::uuid[]), p_client),
      updated = now()
  where id = p_eveniment;
end;
$$;
