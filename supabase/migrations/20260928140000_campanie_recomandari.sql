-- Campania de recomandări (toamna 2026) — decizii Alex 28.09.2026, vezi
-- docs/handoff/2026-09-27-campanie-recomandari-varsity-teens.md și docs/reguli-domeniu.md §Recomandări.
--
-- 1) campanii_recomandare   — o campanie = recompensă + fereastră (termen = ziua dinaintea primei vacanțe)
-- 2) recomandari            — registrul: cine a invitat pe cine, cu starea verificabilă
-- 3) credit_familie_miscari — registrul creditului de familie (acordat / consumat / anulat / restituit)
-- 4) enrollments.credit_recomandare + datorii.credit_recomandare
--      Creditul NU e încasare: se scade din suma datorată a rândului. Toate calculele
--      de rest (suma − Σincasari, ~55 de funcții) îl văd corect fără să fie atinse.
--      Funcțiile care rescriu `suma` o scriu brută (din preț) → triggerul o scade la loc.

-- ============================================================
-- 1) Campania
-- ============================================================
create table public.campanii_recomandare (
  id             uuid primary key default gen_random_uuid(),
  nume           text not null unique,
  sezon_id       uuid not null references public.sezoane(id),
  recompensa_lei numeric not null check (recompensa_lei > 0),
  data_start     date not null,
  data_limita    date not null,
  created        timestamptz not null default now(),
  check (data_limita >= data_start)
);

insert into public.campanii_recomandare (nume, sezon_id, recompensa_lei, data_start, data_limita)
select 'Recomandări toamna 2026', s.id, 60, date '2026-09-28',
       (select min(v.data_incepere) - 1 from vacante v
         where v.sezon_id = s.id and v.data_incepere > date '2026-09-28')
  from sezoane s
 where s.numele_sezonului = 'Sezon 2026-2027';

-- Campania în curs (cel mult una activă la o dată).
create or replace function public.campanie_recomandare_activa()
returns public.campanii_recomandare
language sql stable security definer set search_path = public
as $$
  select c.* from campanii_recomandare c
   where (now() at time zone 'Europe/Bucharest')::date between c.data_start and c.data_limita
   order by c.data_start desc limit 1;
$$;

-- ============================================================
-- 2) Registrul recomandărilor
-- ============================================================
create table public.recomandari (
  id                     uuid primary key default gen_random_uuid(),
  campanie_id            uuid not null references public.campanii_recomandare(id),
  lead_id                uuid not null references public.leads(id) on delete cascade,
  nume_declarat          text,
  canal                  text not null check (canal in ('site', 'telefon', 'receptie')),
  familie_recomandatoare uuid references public.familii(id) on delete set null,
  client_recomandator    uuid references public.clienti(id) on delete set null,
  curs_recomandator      uuid references public.cursuri(id) on delete set null,
  invitat_client_id      uuid references public.clienti(id) on delete set null,
  status                 text not null default 'declarat'
                         check (status in ('declarat', 'verificat', 'proba', 'inrolat',
                                           'eligibil', 'recompensat', 'anulat')),
  enrollment_calificant  uuid references public.enrollments(id) on delete set null,
  recompensat_la         timestamptz,
  -- Credit deja consumat de familie când plata invitatului a fost anulată: nu se cere înapoi,
  -- doar se semnalează managerului.
  credit_pierdut         numeric not null default 0,
  verificat_de           uuid references auth.users(id) on delete set null,
  verificat_la           timestamptz,
  motiv_anulare          text,
  created                timestamptz not null default now(),
  updated                timestamptz not null default now(),
  unique (campanie_id, lead_id)
);
create index recomandari_invitat_idx on public.recomandari (invitat_client_id);
create index recomandari_familie_idx on public.recomandari (familie_recomandatoare);

create trigger trg_recomandari_updated before update on public.recomandari
  for each row execute function set_updated_timestamp();

-- ============================================================
-- 3) Registrul creditului de familie (doar adăugări; soldul = Σ suma)
-- ============================================================
create table public.credit_familie_miscari (
  id             uuid primary key default gen_random_uuid(),
  familie        uuid not null references public.familii(id) on delete cascade,
  suma           numeric not null check (suma <> 0),
  tip            text not null check (tip in ('acordat', 'consumat', 'anulat', 'restituit')),
  recomandare_id uuid references public.recomandari(id) on delete set null,
  enrollment_id  uuid references public.enrollments(id) on delete set null,
  datorie_id     uuid references public.datorii(id) on delete set null,
  motiv          text,
  actor_id       uuid,
  created        timestamptz not null default now(),
  check ((tip in ('acordat', 'restituit') and suma > 0) or (tip in ('consumat', 'anulat') and suma < 0))
);
create index credit_familie_miscari_familie_idx on public.credit_familie_miscari (familie);
create index credit_familie_miscari_enrollment_idx on public.credit_familie_miscari (enrollment_id);
create index credit_familie_miscari_datorie_idx on public.credit_familie_miscari (datorie_id);

create view public.credit_familie_sold with (security_invoker = true) as
  select familie, sum(suma) as sold
    from public.credit_familie_miscari
   group by familie;
revoke all on public.credit_familie_sold from anon, public;
grant select on public.credit_familie_sold to authenticated;

alter table public.enrollments add column credit_recomandare numeric not null default 0
  check (credit_recomandare >= 0);
alter table public.datorii add column credit_recomandare numeric not null default 0
  check (credit_recomandare >= 0);

-- ============================================================
-- 4) RLS, granturi, gărzi (AGENTS.md)
-- ============================================================
alter table public.campanii_recomandare enable row level security;
alter table public.recomandari enable row level security;
alter table public.credit_familie_miscari enable row level security;

-- Scrierea trece doar prin RPC-urile de mai jos (security definer) și prin edge function (service_role).
revoke all on public.campanii_recomandare, public.recomandari, public.credit_familie_miscari
  from anon, authenticated, public;
grant select on public.campanii_recomandare, public.recomandari, public.credit_familie_miscari
  to authenticated;
grant all on public.campanii_recomandare, public.recomandari, public.credit_familie_miscari
  to service_role;

create policy campanii_recomandare_select on public.campanii_recomandare
  for select to authenticated using (true);
create policy recomandari_select on public.recomandari
  for select to authenticated using (true);
create policy credit_familie_miscari_select on public.credit_familie_miscari
  for select to authenticated using (true);

do $$
declare t text;
begin
  foreach t in array array['campanii_recomandare', 'recomandari', 'credit_familie_miscari'] loop
    execute format($f$create policy deny_parinte_direct on public.%I as restrictive for all to authenticated
      using ((select auth_role()) <> 'parinte') with check ((select auth_role()) <> 'parinte')$f$, t);
    execute format($f$create policy deny_marketing_direct on public.%I as restrictive for all to authenticated
      using ((select auth_role()) <> 'marketing') with check ((select auth_role()) <> 'marketing')$f$, t);
    execute format($f$create policy deny_teacher_direct on public.%I as restrictive for all to authenticated
      using ((select auth_role()) <> 'teacher') with check ((select auth_role()) <> 'teacher')$f$, t);
  end loop;
end $$;

-- ============================================================
-- 5) Creditul pe rânduri: suma rămâne mereu (brut − credit)
-- ============================================================
-- Ultima familie care a pus credit pe rând — la ea se întoarce creditul rămas fără obiect.
create or replace function public._credit_familie_pe_rand(p_enrollment uuid, p_datorie uuid)
returns uuid language sql stable set search_path = public
as $$
  select m.familie from credit_familie_miscari m
   where m.tip = 'consumat'
     and (m.enrollment_id = p_enrollment or m.datorie_id = p_datorie)
   order by m.created desc limit 1;
$$;

create or replace function public.trg_enrollment_pastreaza_credit()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_net numeric;
  v_fam uuid;
begin
  if tg_op = 'DELETE' then
    if old.credit_recomandare > 0 then
      v_fam := _credit_familie_pe_rand(old.id, null);
      if v_fam is not null then
        insert into credit_familie_miscari (familie, suma, tip, motiv, actor_id)
        values (v_fam, old.credit_recomandare, 'restituit', 'Înrolare ștearsă', auth.uid());
      end if;
    end if;
    return old;
  end if;

  -- RPC-ul de consum schimbă creditul și suma împreună → suma dată e deja netă.
  if new.credit_recomandare is distinct from old.credit_recomandare then
    return new;
  end if;
  if new.credit_recomandare = 0 then
    return new;
  end if;

  -- Triggerul e `of suma`: a pornit pentru că UPDATE-ul a scris suma, chiar cu aceeași valoare.
  -- Toate funcțiile care o rescriu (recalcul reduceri, ajustare preț, conversie, suspendare…)
  -- o scriu brută din preț, deci creditul se scade la loc.
  v_net := coalesce(new.suma, 0) - new.credit_recomandare;
  if v_net >= 0 then
    new.suma := v_net;
  else
    v_fam := _credit_familie_pe_rand(new.id, null);
    if v_fam is not null then
      insert into credit_familie_miscari (familie, suma, tip, enrollment_id, motiv, actor_id)
      values (v_fam, -v_net, 'restituit', new.id, 'Rata a scăzut sub creditul folosit', auth.uid());
    end if;
    new.credit_recomandare := coalesce(new.suma, 0);
    new.suma := 0;
  end if;
  return new;
end;
$$;
revoke execute on function public.trg_enrollment_pastreaza_credit() from anon, authenticated, public;

create trigger trg_enrollment_pastreaza_credit
  before update of suma, credit_recomandare or delete on public.enrollments
  for each row execute function trg_enrollment_pastreaza_credit();

create or replace function public.trg_datorie_restituie_credit()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_fam uuid;
begin
  if old.credit_recomandare > 0 then
    v_fam := _credit_familie_pe_rand(null, old.id);
    if v_fam is not null then
      insert into credit_familie_miscari (familie, suma, tip, motiv, actor_id)
      values (v_fam, old.credit_recomandare, 'restituit', 'Datorie ștearsă', auth.uid());
    end if;
  end if;
  return old;
end;
$$;
revoke execute on function public.trg_datorie_restituie_credit() from anon, authenticated, public;

create trigger trg_datorie_restituie_credit
  before delete on public.datorii
  for each row execute function trg_datorie_restituie_credit();

-- ============================================================
-- 6) Evaluarea unei recomandări (starea + acordarea / anularea creditului)
-- ============================================================
create or replace function public.evalueaza_recomandare(p_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare
  r        recomandari%rowtype;
  c        campanii_recomandare%rowtype;
  v_client uuid;
  v_fam_inv uuid;
  v_proba  boolean := false;
  v_enr    enrollments%rowtype;
  v_platit boolean := false;
  v_status text;
  v_sold   numeric;
  v_anul   numeric;
begin
  select * into r from recomandari where id = p_id for update;
  if not found or r.status = 'anulat' then return; end if;
  select * into c from campanii_recomandare where id = r.campanie_id;

  v_client := coalesce(r.invitat_client_id, (select l.id_client from leads l where l.id = r.lead_id));
  if v_client is not null and r.invitat_client_id is null then
    update recomandari set invitat_client_id = v_client where id = r.id;
    r.invitat_client_id := v_client;
  end if;

  v_proba := exists (select 1 from programari_leads p where p.lead = r.lead_id and p.prezenta = 'prezent')
    or (v_client is not null and exists (
          select 1 from prezente pz where pz.client = v_client and pz.status = 'Prezent'
             and pz.data between r.created::date and c.data_limita));

  if v_client is not null then
    select fam.familia into v_fam_inv from clienti fam where fam.id = v_client;

    -- Rata care califică: prima înrolare a invitatului în sezonul campaniei, făcută după
    -- recomandare și cu start până la termen. Cine era deja înscris în sezon nu califică.
    if not exists (select 1 from enrollments e
                    where e.client = v_client and e.sezon_id = c.sezon_id and e.created < r.created) then
      select e.* into v_enr from enrollments e
       where e.client = v_client and e.sezon_id = c.sezon_id
         and e.tip_plata in ('Per luna', 'Per an')
         and e.data_incepere <= c.data_limita
       order by e.data_incepere, e.created limit 1;
    end if;

    if v_enr.id is not null then
      -- Valoarea întreagă (Alex, 28.09): o primă rată prorată nu califică — la invitați
      -- pro-rata se mută în luna a doua, deci rata 1 nu e mai mică decât celelalte.
      v_platit := coalesce(v_enr.suma, 0) > 0
        and (v_enr.tip_plata = 'Per an' or coalesce(v_enr.suma_baza, 0) >= coalesce((
              select max(e2.suma_baza) from enrollments e2
               where e2.client = v_enr.client and e2.cursul = v_enr.cursul
                 and e2.sezon_id = v_enr.sezon_id and e2.tip_plata = 'Per luna'), 0))
        and coalesce((select sum(i.suma) from incasari i
                       where i.inregistrare = v_enr.id
                         and coalesce(i.data, i.created::date) <= c.data_limita), 0) >= v_enr.suma;
    end if;
  end if;

  -- Recompensa a fost dată: se retrage doar dacă dispar banii de pe rata care a calificat
  -- (ștergere, restituire, mutare). Plecarea ulterioară a invitatului nu o atinge.
  if r.status = 'recompensat' then
    if exists (select 1 from enrollments e where e.id = r.enrollment_calificant
                 and coalesce((select sum(i.suma) from incasari i where i.inregistrare = e.id), 0)
                     >= coalesce(e.suma, 0)) then
      return;
    end if;
    select coalesce(sum(suma), 0) into v_sold from credit_familie_miscari where familie = r.familie_recomandatoare;
    v_anul := least(c.recompensa_lei, greatest(v_sold, 0));
    if v_anul > 0 then
      insert into credit_familie_miscari (familie, suma, tip, recomandare_id, motiv, actor_id)
      values (r.familie_recomandatoare, -v_anul, 'anulat', r.id, 'Plata invitatului a fost anulată', auth.uid());
    end if;
    update recomandari
       set status = 'anulat', motiv_anulare = 'Plata invitatului a fost anulată',
           credit_pierdut = c.recompensa_lei - v_anul
     where id = r.id;
    insert into audit_log (actor_id, actor_role, action, entity_type, entity_id, old_value, new_value, reason)
    values (auth.uid(), (select auth_role()), 'recomandare_anulata_automat', 'recomandare', r.id,
            jsonb_build_object('status', 'recompensat'),
            jsonb_build_object('credit_anulat', v_anul, 'credit_pierdut', c.recompensa_lei - v_anul),
            'Plata invitatului a fost anulată');
    return;
  end if;

  v_status := case
    when v_platit and r.familie_recomandatoare is not null and v_proba
         and v_fam_inv is distinct from r.familie_recomandatoare then 'recompensat'
    when v_platit then 'eligibil'
    when v_enr.id is not null then 'inrolat'
    when v_proba then 'proba'
    when r.familie_recomandatoare is not null then 'verificat'
    else 'declarat'
  end;

  if v_status = 'recompensat' then
    insert into credit_familie_miscari (familie, suma, tip, recomandare_id, enrollment_id, motiv, actor_id)
    values (r.familie_recomandatoare, c.recompensa_lei, 'acordat', r.id, v_enr.id,
            'Recomandare: ' || c.nume, auth.uid());
    update recomandari
       set status = 'recompensat', enrollment_calificant = v_enr.id, recompensat_la = now()
     where id = r.id;
  elsif v_status is distinct from r.status then
    update recomandari set status = v_status, enrollment_calificant = v_enr.id where id = r.id;
  end if;
end;
$$;
revoke execute on function public.evalueaza_recomandare(uuid) from anon, authenticated, public;
grant execute on function public.evalueaza_recomandare(uuid) to service_role;

create or replace function public._evalueaza_recomandari_client(p_client uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if p_client is null then return; end if;
  for v_id in
    select r.id from recomandari r
      left join leads l on l.id = r.lead_id
     where (r.invitat_client_id = p_client or (r.invitat_client_id is null and l.id_client = p_client))
       and r.status <> 'anulat'
  loop
    perform evalueaza_recomandare(v_id);
  end loop;
end;
$$;
revoke execute on function public._evalueaza_recomandari_client(uuid) from anon, authenticated, public;

-- Triggerii ies imediat când nu există nicio recomandare — tabela e mică, verificarea e ieftină.
create or replace function public.trg_recomandare_din_incasare()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_client uuid;
begin
  if not exists (select 1 from recomandari where status <> 'anulat') then return null; end if;
  if tg_op in ('INSERT', 'UPDATE') and new.inregistrare is not null then
    select client into v_client from enrollments where id = new.inregistrare;
    perform _evalueaza_recomandari_client(v_client);
  end if;
  if tg_op in ('UPDATE', 'DELETE') and old.inregistrare is not null then
    select client into v_client from enrollments where id = old.inregistrare;
    perform _evalueaza_recomandari_client(v_client);
  end if;
  return null;
end;
$$;
revoke execute on function public.trg_recomandare_din_incasare() from anon, authenticated, public;
create trigger trg_recomandare_din_incasare
  after insert or update or delete on public.incasari
  for each row execute function trg_recomandare_din_incasare();

create or replace function public.trg_recomandare_din_enrollment()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from recomandari where status <> 'anulat') then return null; end if;
  perform _evalueaza_recomandari_client(coalesce(new.client, old.client));
  return null;
end;
$$;
revoke execute on function public.trg_recomandare_din_enrollment() from anon, authenticated, public;
create trigger trg_recomandare_din_enrollment
  after insert or update of reziliat, suma, data_incepere on public.enrollments
  for each row execute function trg_recomandare_din_enrollment();

create or replace function public.trg_recomandare_din_proba()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  for v_id in select id from recomandari where lead_id = new.lead and status <> 'anulat' loop
    perform evalueaza_recomandare(v_id);
  end loop;
  return null;
end;
$$;
revoke execute on function public.trg_recomandare_din_proba() from anon, authenticated, public;
create trigger trg_recomandare_din_proba
  after insert or update of prezenta on public.programari_leads
  for each row when (new.prezenta = 'prezent')
  execute function trg_recomandare_din_proba();

create or replace function public.trg_recomandare_din_lead_client()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  for v_id in select id from recomandari where lead_id = new.id and status <> 'anulat' loop
    update recomandari set invitat_client_id = new.id_client where id = v_id;
    perform evalueaza_recomandare(v_id);
  end loop;
  return null;
end;
$$;
revoke execute on function public.trg_recomandare_din_lead_client() from anon, authenticated, public;
create trigger trg_recomandare_din_lead_client
  after update of id_client on public.leads
  for each row when (new.id_client is distinct from old.id_client and new.id_client is not null)
  execute function trg_recomandare_din_lead_client();

-- ============================================================
-- 7) RPC-uri pentru aplicația de staff
-- ============================================================

-- Recepția creează / confirmă recomandarea unui lead: cine a invitat (cursantul → familia lui).
create or replace function public.atribuie_recomandare(
  p_lead                uuid,
  p_client_recomandator uuid,
  p_curs                uuid default null,
  p_nume_declarat       text default null,
  p_canal               text default 'receptie'
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_rol  text := (select auth_role());
  c      campanii_recomandare%rowtype;
  v_id   uuid;
  v_fam  uuid;
  v_lead leads%rowtype;
  v_old  recomandari%rowtype;
begin
  if v_rol not in ('owner', 'admin', 'manager', 'front_desk') then
    raise exception 'Acces refuzat.' using errcode = '42501';
  end if;

  select * into v_lead from leads where id = p_lead;
  if not found then raise exception 'Leadul nu există.'; end if;

  select * into v_old from recomandari where lead_id = p_lead order by created desc limit 1;
  if v_old.id is not null then
    select * into c from campanii_recomandare where id = v_old.campanie_id;
    if v_old.status in ('recompensat', 'anulat') then
      raise exception 'Recomandarea e deja %; nu se mai poate schimba.', v_old.status;
    end if;
  else
    c := campanie_recomandare_activa();
    if c.id is null then raise exception 'Nu există o campanie de recomandări activă.'; end if;
  end if;

  if p_client_recomandator is not null then
    select familia into v_fam from clienti where id = p_client_recomandator;
    if v_fam is null then
      select a.familie_id into v_fam from asigura_familie_client(p_client_recomandator) a;
    end if;
    if v_fam is null then
      raise exception 'Cursantul care a invitat nu are familie și nu i se poate crea una automat (fără telefon/email pe fișă).';
    end if;
    if v_lead.id_client is not null
       and (select familia from clienti where id = v_lead.id_client) = v_fam then
      raise exception 'Invitatul e din aceeași familie cu cel care l-a invitat.';
    end if;
  end if;

  if v_old.id is null then
    insert into recomandari (campanie_id, lead_id, nume_declarat, canal, invitat_client_id)
    values (c.id, p_lead, nullif(btrim(p_nume_declarat), ''),
            case when p_canal in ('site', 'telefon', 'receptie') then p_canal else 'receptie' end,
            v_lead.id_client)
    returning id into v_id;
  else
    v_id := v_old.id;
    if nullif(btrim(p_nume_declarat), '') is not null then
      update recomandari set nume_declarat = btrim(p_nume_declarat) where id = v_id;
    end if;
  end if;

  if p_client_recomandator is not null then
    update recomandari
       set familie_recomandatoare = v_fam,
           client_recomandator    = p_client_recomandator,
           curs_recomandator      = coalesce(p_curs, curs_recomandator),
           verificat_de           = auth.uid(),
           verificat_la           = now()
     where id = v_id;
  end if;

  insert into audit_log (actor_id, actor_role, action, entity_type, entity_id, old_value, new_value)
  values (auth.uid(), v_rol, 'recomandare_atribuita', 'recomandare', v_id,
          case when v_old.id is null then null
               else jsonb_build_object('familie', v_old.familie_recomandatoare, 'client', v_old.client_recomandator) end,
          jsonb_build_object('familie', v_fam, 'client', p_client_recomandator, 'lead', p_lead));

  perform evalueaza_recomandare(v_id);
  return v_id;
end;
$$;
revoke execute on function public.atribuie_recomandare(uuid, uuid, uuid, text, text) from anon, public;

-- Manager+: anulează o recomandare (fraudă, atribuire greșită). Creditul nefolosit se anulează.
create or replace function public.anuleaza_recomandare(p_id uuid, p_motiv text)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_rol   text := (select auth_role());
  v_motiv text := nullif(btrim(p_motiv), '');
  r       recomandari%rowtype;
  v_acord numeric;
  v_sold  numeric;
  v_anul  numeric := 0;
begin
  if v_rol not in ('owner', 'admin', 'manager') then
    raise exception 'Acces refuzat.' using errcode = '42501';
  end if;
  if v_motiv is null then raise exception 'Motivul anulării e obligatoriu.'; end if;

  select * into r from recomandari where id = p_id for update;
  if not found then raise exception 'Recomandarea nu există.'; end if;
  if r.status = 'anulat' then return; end if;

  if r.status = 'recompensat' then
    perform 1 from familii where id = r.familie_recomandatoare for update;
    select coalesce(sum(suma), 0) into v_acord from credit_familie_miscari
     where recomandare_id = r.id and tip = 'acordat';
    select coalesce(sum(suma), 0) into v_sold from credit_familie_miscari
     where familie = r.familie_recomandatoare;
    v_anul := least(v_acord, greatest(v_sold, 0));
    if v_anul > 0 then
      insert into credit_familie_miscari (familie, suma, tip, recomandare_id, motiv, actor_id)
      values (r.familie_recomandatoare, -v_anul, 'anulat', r.id, v_motiv, auth.uid());
    end if;
    update recomandari set credit_pierdut = v_acord - v_anul where id = r.id;
  end if;

  update recomandari set status = 'anulat', motiv_anulare = v_motiv where id = r.id;

  insert into audit_log (actor_id, actor_role, action, entity_type, entity_id, old_value, new_value, reason)
  values (auth.uid(), v_rol, 'recomandare_anulata', 'recomandare', r.id,
          jsonb_build_object('status', r.status),
          jsonb_build_object('credit_anulat', v_anul), v_motiv);
end;
$$;
revoke execute on function public.anuleaza_recomandare(uuid, text) from anon, public;

-- Folosește creditul familiei pe o rată (abonament, OPEN class, ședințe) sau pe o datorie
-- de workshop / concurs. Nu creează încasare: scade suma datorată și lasă urma în registru.
create or replace function public.consuma_credit_familie(
  p_familie    uuid,
  p_suma       numeric,
  p_enrollment uuid default null,
  p_datorie    uuid default null
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_rol    text := (select auth_role());
  v_suma   numeric := round(p_suma, 2);
  v_sold   numeric;
  v_client uuid;
  v_rest   numeric;
  v_cat    text;
begin
  if v_rol not in ('owner', 'admin', 'manager', 'front_desk') then
    raise exception 'Acces refuzat.' using errcode = '42501';
  end if;
  if v_suma is null or v_suma <= 0 then raise exception 'Suma trebuie să fie pozitivă.'; end if;
  if (p_enrollment is null) = (p_datorie is null) then
    raise exception 'Alege exact o țintă: o rată sau o datorie.';
  end if;

  perform 1 from familii where id = p_familie for update;
  if not found then raise exception 'Familia nu există.'; end if;
  select coalesce(sum(suma), 0) into v_sold from credit_familie_miscari where familie = p_familie;
  if v_sold < v_suma then
    raise exception 'Credit insuficient: familia are % lei.', v_sold;
  end if;

  if p_enrollment is not null then
    select e.client, coalesce(e.suma, 0) - coalesce((select sum(i.suma) from incasari i where i.inregistrare = e.id), 0)
      into v_client, v_rest
      from enrollments e where e.id = p_enrollment for update;
  else
    select d.client, d.categorie::text,
           d.suma_datorata - coalesce((select sum(i.suma) from incasari i where i.datorie = d.id), 0)
      into v_client, v_cat, v_rest
      from datorii d where d.id = p_datorie for update;
    if v_cat not in ('Workshop', 'Auditie') then
      raise exception 'Creditul de recomandare se folosește doar la abonamente, OPEN class, ședințe, workshopuri și concursuri.';
    end if;
  end if;
  if v_client is null then raise exception 'Ținta nu există.'; end if;
  if (select familia from clienti where id = v_client) is distinct from p_familie then
    raise exception 'Ținta nu aparține unui membru al familiei.';
  end if;
  if v_suma > v_rest then
    raise exception 'Creditul (% lei) depășește restul de plată (% lei).', v_suma, v_rest;
  end if;

  if p_enrollment is not null then
    update enrollments
       set credit_recomandare = credit_recomandare + v_suma, suma = suma - v_suma
     where id = p_enrollment;
  else
    update datorii
       set credit_recomandare = credit_recomandare + v_suma, suma_datorata = suma_datorata - v_suma
     where id = p_datorie;
  end if;

  insert into credit_familie_miscari (familie, suma, tip, enrollment_id, datorie_id, motiv, actor_id)
  values (p_familie, -v_suma, 'consumat', p_enrollment, p_datorie, 'Folosit la plată', auth.uid());

  insert into audit_log (actor_id, actor_role, action, entity_type, entity_id, new_value)
  values (auth.uid(), v_rol, 'credit_familie_consumat',
          case when p_enrollment is not null then 'enrollment' else 'datorie' end,
          coalesce(p_enrollment, p_datorie),
          jsonb_build_object('familie', p_familie, 'suma', v_suma, 'sold_ramas', v_sold - v_suma));
end;
$$;
revoke execute on function public.consuma_credit_familie(uuid, numeric, uuid, uuid) from anon, public;

-- Pentru formularul de înrolare: clientul are o recomandare vie → prima rată întreagă,
-- pro-rata în luna a doua (Alex, 28.09 — doar la invitați).
create or replace function public.client_are_recomandare(p_client uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select (select auth_role()) in ('owner', 'admin', 'manager', 'front_desk')
     and exists (
       select 1 from recomandari r
         join campanii_recomandare c on c.id = r.campanie_id
         left join leads l on l.id = r.lead_id
        where (r.invitat_client_id = p_client or l.id_client = p_client)
          and r.status not in ('anulat', 'recompensat')
          and (now() at time zone 'Europe/Bucharest')::date <= c.data_limita);
$$;
revoke execute on function public.client_are_recomandare(uuid) from anon, public;

-- Raportul campaniei: o linie per recomandare, cu urmărirea pe cele două luni de după.
create or replace function public.raport_recomandari(p_campanie uuid default null)
returns table (
  id uuid, created timestamptz, status text, canal text, nume_declarat text,
  lead_id uuid, lead_nume text, lead_telefon text, lead_status text,
  invitat_client_id uuid, invitat_nume text, invitat_tip text,
  familie_id uuid, familie_nume text, recomandator_nume text,
  curs_recomandator text, curs_ales text, locatie text,
  proba boolean, prima_plata date, credit_acordat numeric, credit_pierdut numeric,
  prezente_luna1 bigint, prezente_luna2 bigint, platit_luna1 boolean, platit_luna2 boolean,
  motiv_anulare text, data_limita date
)
language plpgsql stable security definer set search_path = public
as $$
declare c campanii_recomandare%rowtype;
begin
  if (select auth_role()) not in ('owner', 'admin', 'manager', 'front_desk') then
    raise exception 'Acces refuzat.' using errcode = '42501';
  end if;
  if p_campanie is null then
    select * into c from campanii_recomandare order by data_start desc limit 1;
  else
    select * into c from campanii_recomandare where campanii_recomandare.id = p_campanie;
  end if;

  return query
  with base as (
    select r.*, coalesce(r.invitat_client_id, l.id_client) as inv,
           l.nume as l_nume, l.prenume as l_prenume, l.telefon as l_tel, l.status::text as l_status
      from recomandari r join leads l on l.id = r.lead_id
     where r.campanie_id = c.id
  )
  select b.id, b.created, b.status, b.canal, b.nume_declarat,
         b.lead_id, trim(concat_ws(' ', b.l_prenume, b.l_nume)), b.l_tel, b.l_status,
         b.inv, trim(concat_ws(' ', ci.prenume, ci.nume)),
         case when b.inv is null then null
              when exists (select 1 from enrollments e where e.client = b.inv and e.sezon_id <> c.sezon_id)
                then 'revenit' else 'nou' end,
         b.familie_recomandatoare, f.nume_familie, trim(concat_ws(' ', cr.prenume, cr.nume)),
         kr.numele, ke.numele, lo.nume,
         exists (select 1 from programari_leads p where p.lead = b.lead_id and p.prezenta = 'prezent'),
         (select min(coalesce(i.data, i.created::date)) from incasari i where i.inregistrare = b.enrollment_calificant),
         coalesce((select sum(m.suma) from credit_familie_miscari m where m.recomandare_id = b.id and m.tip = 'acordat'), 0),
         b.credit_pierdut,
         (select count(*) from prezente pz where pz.client = b.inv and pz.status = 'Prezent'
            and date_trunc('month', pz.data) = date_trunc('month', c.data_limita) + interval '1 month'),
         (select count(*) from prezente pz where pz.client = b.inv and pz.status = 'Prezent'
            and date_trunc('month', pz.data) = date_trunc('month', c.data_limita) + interval '2 month'),
         (select bool_and(coalesce(e.suma, 0) <= coalesce((select sum(i.suma) from incasari i where i.inregistrare = e.id), 0))
            from enrollments e where e.client = b.inv and not e.reziliat and e.tip_plata = 'Per luna'
             and date_trunc('month', e.data_incepere) = date_trunc('month', c.data_limita) + interval '1 month'),
         (select bool_and(coalesce(e.suma, 0) <= coalesce((select sum(i.suma) from incasari i where i.inregistrare = e.id), 0))
            from enrollments e where e.client = b.inv and not e.reziliat and e.tip_plata = 'Per luna'
             and date_trunc('month', e.data_incepere) = date_trunc('month', c.data_limita) + interval '2 month'),
         b.motiv_anulare, c.data_limita
    from base b
    left join clienti ci on ci.id = b.inv
    left join familii f on f.id = b.familie_recomandatoare
    left join clienti cr on cr.id = b.client_recomandator
    left join cursuri kr on kr.id = b.curs_recomandator
    left join enrollments en on en.id = b.enrollment_calificant
    left join cursuri ke on ke.id = en.cursul
    left join sali sa on sa.id = ke.sala
    left join locatii lo on lo.id = sa.locatie
   order by b.created desc;
end;
$$;
revoke execute on function public.raport_recomandari(uuid) from anon, public;

-- Starea publică a campaniei, pentru site (serverul site-ului o cere prin edge function).
revoke execute on function public.campanie_recomandare_activa() from anon, authenticated, public;
grant execute on function public.campanie_recomandare_activa() to service_role;
