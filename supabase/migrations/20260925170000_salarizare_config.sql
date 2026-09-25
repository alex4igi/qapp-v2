-- Grilele de salarizare (instructori, manageri, recepție) — configurarea.
--
-- Regulile: docs/grila-salarizare-instructori.md, docs/bonus-manager-studio.md,
-- docs/grila-front-desk.md. Deciziile din 25 sept. 2026 (Alex) sunt în seed-uri.
--
-- Cifrele stau în DB ca o schimbare de sumă să nu ceară deploy. Le citesc doar
-- funcțiile de salariu, deci jsonb (regula „coloană tipizată vs jsonb" din
-- 20260901150000): niciun motor generic nu decide pe ele.
--
-- Atribuirile (manager ↔ locații, recepția) au tabele proprii, nu app_metadata:
-- locația din cont e o setare de acces, iar schimbarea ei n-are voie să mute
-- tăcut salariul cuiva.

-- ── 1. Parametrii grilelor, versionați pe luna de la care se aplică ─────────────
create table public.salarizare_grila (
  id            uuid primary key default gen_random_uuid(),
  post          text not null check (post in ('instructor', 'manager', 'receptie')),
  valabil_de_la date not null check (extract(day from valabil_de_la) = 1),
  parametri     jsonb not null check (jsonb_typeof(parametri) = 'object'),
  nota          text,
  creat_de      uuid references auth.users(id) on delete set null,
  created       timestamptz not null default now(),
  unique (post, valabil_de_la)
);

-- ── 2. Regula de septembrie, pe sezon ──────────────────────────────────────────
-- Se aplică doar în septembrie (vezi _mod_ocupare). `campanie` e cârligul pentru
-- regula campaniei de reînscrieri (din sept. 2027); până se implementează, ridică
-- eroare în loc să plătească 0 în tăcere.
create table public.salarizare_sezon (
  sezon_id                 uuid primary key references public.sezoane(id) on delete cascade,
  mod_ocupare_instructori  text not null default 'masurat'
    check (mod_ocupare_instructori in ('masurat', 'standard_fix', 'standard_podea', 'campanie')),
  mod_ocupare_manageri     text not null default 'masurat'
    check (mod_ocupare_manageri in ('masurat', 'standard_fix', 'standard_podea', 'campanie')),
  campanie_id              uuid references public.campanii_reinscriere(id) on delete set null,
  nota                     text,
  updated                  timestamptz not null default now()
);

-- ── 3. Managerul de studio ↔ locațiile lui ─────────────────────────────────────
create table public.manageri_locatii (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete set null,
  titular_nume    text not null,
  locatie_id      uuid not null references public.locatii(id),
  valabil_de_la   date not null check (extract(day from valabil_de_la) = 1),
  valabil_pana_la date,
  created         timestamptz not null default now(),
  check (valabil_pana_la is null or valabil_pana_la >= valabil_de_la),
  -- O locație are un singur manager la un moment dat.
  constraint manageri_locatii_fara_suprapunere exclude using gist (
    locatie_id with =,
    daterange(valabil_de_la, coalesce(valabil_pana_la, 'infinity'::date), '[)') with &&
  )
);

-- ── 4. Recepția: partea fixă, pe om ────────────────────────────────────────────
-- Sumele stau în grilă; aici doar ce diferă de la om la om. Norma parțială
-- reduce fixul și bonusul KPI, nu și pragurile (grila recepției §2).
create table public.salarizare_receptie (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users(id) on delete set null,
  titular_nume        text not null,
  norma               numeric not null default 1 check (norma > 0 and norma <= 1),
  facturare_la_timp   boolean not null default true,
  fidelitate          boolean not null default false,
  abonament_trupa     boolean not null default true,
  bonusuri_ocazionale boolean not null default false,
  valabil_de_la       date not null check (extract(day from valabil_de_la) = 1),
  valabil_pana_la     date,
  created             timestamptz not null default now(),
  updated             timestamptz not null default now(),
  check (valabil_pana_la is null or valabil_pana_la >= valabil_de_la),
  constraint salarizare_receptie_fara_suprapunere exclude using gist (
    user_id with =,
    daterange(valabil_de_la, coalesce(valabil_pana_la, 'infinity'::date), '[)') with &&
  )
);

create trigger trg_salarizare_sezon_updated before update on public.salarizare_sezon
  for each row execute function set_updated_timestamp();
create trigger trg_salarizare_receptie_updated before update on public.salarizare_receptie
  for each row execute function set_updated_timestamp();

-- ── Securitate: salariile le vede și le schimbă doar owner/admin ────────────────
do $$
declare t text;
begin
  foreach t in array array['salarizare_grila', 'salarizare_sezon', 'manageri_locatii', 'salarizare_receptie'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated '
      || 'using ((select auth_role()) in (''owner'', ''admin'')) '
      || 'with check ((select auth_role()) in (''owner'', ''admin''))', t || '_admin', t);
    execute format(
      'create policy deny_parinte_direct on public.%I as restrictive for all to authenticated '
      || 'using (auth_role() <> %L) with check (auth_role() <> %L)', t, 'parinte', 'parinte');
    execute format(
      'create policy deny_marketing_direct on public.%I as restrictive for all to authenticated '
      || 'using (auth_role() <> %L) with check (auth_role() <> %L)', t, 'marketing', 'marketing');
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke truncate, references, trigger on public.%I from authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- ── Helperi (îi cheamă doar funcțiile de salariu, care sunt definer) ────────────
create or replace function public._salarizare_parametri(p_post text, p_luna date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v jsonb;
begin
  select parametri into v
  from salarizare_grila
  where post = p_post and valabil_de_la <= date_trunc('month', p_luna)::date
  order by valabil_de_la desc
  limit 1;
  if v is null then
    raise exception 'Nu există grilă de salarizare „%" valabilă în %', p_post, to_char(p_luna, 'YYYY-MM')
      using errcode = 'P0002';
  end if;
  return v;
end;
$$;

-- Sezonul care deține luna: cel în care cade ziua 1; în pauza dintre sezoane
-- (ex. 1–11 sept. 2026), cel mai recent care se suprapune cu luna. Aceeași logică
-- pe care o folosea calculeaza_salariu_teacher (20260913180000).
create or replace function public._sezon_lunii(p_luna date)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select id from sezoane
      where date_trunc('month', p_luna)::date between data_incepere and data_final
      order by data_incepere desc limit 1),
    (select id from sezoane
      where data_incepere <= (date_trunc('month', p_luna) + interval '1 month - 1 day')::date
        and data_final >= date_trunc('month', p_luna)::date
      order by data_incepere desc limit 1)
  );
$$;

-- Modul de ocupare al lunii. Regula sezonului se aplică DOAR în septembrie; în
-- orice altă lună ocuparea se măsoară.
create or replace function public._mod_ocupare(p_post text, p_luna date)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_mod text;
begin
  if extract(month from p_luna) <> 9 then
    return 'masurat';
  end if;
  select case p_post when 'instructor' then mod_ocupare_instructori
                     when 'manager' then mod_ocupare_manageri end
    into v_mod
  from salarizare_sezon
  where sezon_id = _sezon_lunii(p_luna);
  v_mod := coalesce(v_mod, 'masurat');
  if v_mod = 'campanie' then
    raise exception 'Regula campaniei de reînscrieri nu e implementată încă — alege alt mod pentru sezon'
      using errcode = '0A000';
  end if;
  return v_mod;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['_salarizare_parametri(text, date)', '_sezon_lunii(date)', '_mod_ocupare(text, date)'] loop
    execute format('revoke execute on function public.%s from anon, public, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- ── Seed: grilele de la 1 sept. 2026 ───────────────────────────────────────────
insert into public.salarizare_grila (post, valabil_de_la, parametri, nota) values
('instructor', '2026-09-01', $j${
  "baza": {
    "Junior": {"Incepator": 300, "Intermediar": 410},
    "Senior": {"Incepator": 350, "Intermediar": 480},
    "Expert": {"Incepator": 400, "Intermediar": 550, "Trupa": 700}
  },
  "trupa_min_platitori": 14,
  "retentie": {
    "prag_standard": 85,
    "prag_peste": 95.01,
    "lei": {"Incepator": [105, 210], "Intermediar": [75, 150], "Trupa": [50, 100]}
  },
  "ocupare": {"prag_standard_pct": 60, "prag_peste_pct": 80,
              "coef_standard": 6, "coef_peste": 8, "adaos_peste": 20, "rotunjire": 10},
  "luni_vara": [7, 8],
  "lei_prezenta_vara": 6,
  "maturitate": {"luni_test": 3, "luni_consecutive": 5, "minim": 8},
  "voucher_lunar": 300,
  "buget_deplasari_sezon": 1200,
  "lei_eveniment": 150
}$j$::jsonb, 'Grila 2026-2027 (Alex, 8–25 sept. 2026). Junior × Intermediar 410 confirmat pe 25 sept.'),
('manager', '2026-09-01', $j${
  "baza_pe_nr_locatii": [1000, 1700, 2400, 2900, 3400],
  "incasare": {"peste": {"de_la": 95.01, "procent": 1},
               "standard": {"de_la": 92, "procent": 0.7},
               "sub": {"de_la": 90, "procent": 0.5}},
  "ocupare": {"peste": {"de_la": 80.01, "lei": 3},
              "standard": {"de_la": 60, "lei": 2},
              "sub": {"de_la": 40, "lei": 1}},
  "luni_vara": [7, 8]
}$j$::jsonb, 'Salarizarea managerului de studio (Alex, 14–25 sept. 2026).'),
('receptie', '2026-09-01', $j${
  "fix_norma_intreaga": 2722,
  "facturare_la_timp": 200,
  "fidelitate": 100,
  "abonament_trupa": 290,
  "luni_vara": [7, 8]
}$j$::jsonb, 'Grila recepției (Alex, 23–25 sept. 2026). Bonusul KPI vine din grila KPI a omului.');

-- Septembrie 2026: ocuparea la standard la toți (campania n-a avut target) —
-- înlocuire la instructori, standard și la manageri (Alex, 25 sept. 2026).
insert into public.salarizare_sezon (sezon_id, mod_ocupare_instructori, mod_ocupare_manageri, nota)
select id, 'standard_fix', 'standard_fix',
       'Sept. 2026: ocuparea la standard pentru toți (Alex, 25 sept. 2026) — campania 2026 n-a avut target.'
from public.sezoane where numele_sezonului = 'Sezon 2026-2027';

-- ── Seed: atribuirile. Ridică eroare dacă nu găsește exact un om/o locație ──────
do $$
declare
  v_loc_stefan uuid;
  v_loc_nicolina uuid;
  v_andrei uuid;
  v_alin uuid;
  v_petruta uuid;
  v_theo uuid;
  v_n int;
begin
  if (select count(*) from sezoane where numele_sezonului = 'Sezon 2026-2027') <> 1
     or not exists (select 1 from salarizare_sezon) then
    raise exception 'Seed salarizare: sezonul 2026-2027 nu e unic';
  end if;

  select count(*), min(id::text)::uuid into v_n, v_loc_stefan from locatii where nume = 'Galeriile Stefan cel Mare';
  if v_n <> 1 then raise exception 'Seed salarizare: locația Ștefan cel Mare (% potriviri)', v_n; end if;
  select count(*), min(id::text)::uuid into v_n, v_loc_nicolina from locatii where nume = 'Nicolina';
  if v_n <> 1 then raise exception 'Seed salarizare: locația Nicolina (% potriviri)', v_n; end if;

  select count(*), min(t.auth_user_id::text)::uuid into v_n, v_andrei
  from teacheri t join auth.users u on u.id = t.auth_user_id
  where t.prenume = 'Andrei' and t.nume = 'Chiriac' and u.raw_app_meta_data ->> 'role' = 'manager';
  if v_n <> 1 then raise exception 'Seed salarizare: Andrei Chiriac manager (% potriviri)', v_n; end if;

  select count(*), min(t.auth_user_id::text)::uuid into v_n, v_alin
  from teacheri t join auth.users u on u.id = t.auth_user_id
  where t.prenume = 'Alin' and t.nume = 'Stoleru' and u.raw_app_meta_data ->> 'role' = 'manager';
  if v_n <> 1 then raise exception 'Seed salarizare: Alin Stoleru manager (% potriviri)', v_n; end if;

  select count(*), min(id::text)::uuid into v_n, v_petruta
  from auth.users where lower(email) = 'pnitisor16@gmail.com' and raw_app_meta_data ->> 'role' = 'front_desk';
  if v_n <> 1 then raise exception 'Seed salarizare: Petruța recepție (% potriviri)', v_n; end if;

  select count(*), min(id::text)::uuid into v_n, v_theo
  from auth.users where lower(email) = 'todicatheodora@gmail.com' and raw_app_meta_data ->> 'role' = 'front_desk';
  if v_n <> 1 then raise exception 'Seed salarizare: Theo Todica recepție (% potriviri)', v_n; end if;

  -- Q4K fără manager deocamdată (Alex, 25 sept. 2026).
  insert into manageri_locatii (user_id, titular_nume, locatie_id, valabil_de_la) values
    (v_andrei, 'Andrei Chiriac', v_loc_stefan, '2026-09-01'),
    (v_alin, 'Alin Stoleru', v_loc_nicolina, '2026-09-01');

  -- Bonusurile ocazionale sunt ale postului întreg, doar ale Petruței (grila §4).
  insert into salarizare_receptie (user_id, titular_nume, norma, bonusuri_ocazionale, valabil_de_la) values
    (v_petruta, 'Petruța', 1, true, '2026-09-01'),
    (v_theo, 'Theo Todica', 1, false, '2026-09-01');
end $$;
