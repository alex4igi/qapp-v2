-- Motorul de grile KPI: configurația de bonus, editabilă integral din UI.
--
-- Cerința (Alex, 1 sept. 2026): TOATE numerele care produc bonusul se editează
-- de owner/admin, PENTRU FIECARE ANGAJAT — ponderi, praguri (procentuale sau
-- afirmative), condiții descriptive, sume în lei. Începem cu postul front_desk
-- („Responsabil Relații Clienți"), dar teacherii și managerii trebuie să intre
-- fără schimbare de schemă. Deci nu construim „raportul RRC", ci un motor peste
-- care RRC e prima grilă.
--
-- Trei straturi:
--   kpi_definitii    CE indicatori există și cum se măsoară (catalog global)
--   kpi_sabloane     structura pe post — „Front-desk", „Teacher", „Manager PL"
--   kpi_grile        copia editabilă a unui șablon, atribuită unui angajat
--
-- CLONARE, nu moștenire cu override. O editare de șablon nu are voie să miște
-- tăcut bonusul cuiva; grila e obiectul cu care se discută la evaluare, deci
-- trebuie să fie literalmente ce vede omul. (Precedent: `duplica_program`.)
--
-- REGULA DE TĂIERE coloană vs. jsonb, de respectat la orice KPI nou:
--   dacă motorul generic are nevoie de număr ca să decidă banda sau să calculeze
--   lei  → COLOANĂ TIPIZATĂ (pondere, praguri, sume, comision);
--   dacă îl citește doar funcția KPI-ului ca să producă valoarea brută
--        → `parametri` jsonb (ziua-termen, cele 21 de zile, fereastra de 30).
-- Altfel „motorul generic" ar trebui să știe despre fiecare KPI în parte și s-ar
-- pierde exact generalizarea pentru care există.

-- ── 1. Catalogul de indicatori ──────────────────────────────────────────────

create table if not exists kpi_definitii (
  id               uuid primary key default gen_random_uuid(),
  cheie            text not null unique,
  denumire         text not null,
  descriere        text,
  -- 'auto'   = valoarea vine dintr-o funcție SQL (dispecer CASE static)
  -- 'manual' = valoarea o completează managerul în raportul lunar
  sursa            text not null default 'manual' check (sursa in ('auto','manual')),
  tip_valoare      text not null default 'procent'
                     check (tip_valoare in ('procent','numar','bifa')),
  directie         text not null default 'mai_mare_e_bine'
                     check (directie in ('mai_mare_e_bine','mai_mic_e_bine')),
  unitate          text,
  -- Filtru de UI la construirea șabloanelor. NU face parte din cheie: postul
  -- aparține șablonului, altfel același indicator ar avea chei duplicate când
  -- intră teacherii.
  posturi_sugerate text[] not null default '{}',
  -- Descriptorii numerelor proprii indicatorului, ca UI-ul să le randeze fără
  -- cod nou: [{cheie, eticheta, tip, min, max, default, unitate}]
  parametri_schema jsonb not null default '[]',
  activ            boolean not null default true,
  ordine           int not null default 0,
  created          timestamptz not null default now()
);

-- Câmpurile manuale ale unui indicator (ex. cele 3 cifre din Meta + sondajul
-- la „răspuns sub 24h"). „Indicator compus" SE DERIVĂ din existența acestor
-- rânduri — nu se mai stochează încă o dată ca tip de sursă.
create table if not exists kpi_campuri (
  id          uuid primary key default gen_random_uuid(),
  kpi_id      uuid not null references kpi_definitii(id) on delete cascade,
  cheie       text not null,
  eticheta    text not null,
  tip         text not null default 'numar' check (tip in ('procent','numar','bifa','text')),
  unitate     text,
  obligatoriu boolean not null default true,
  ordine      int not null default 0,
  unique (kpi_id, cheie)
);

-- ── 2. Șabloane pe post ─────────────────────────────────────────────────────

create table if not exists kpi_sabloane (
  id                 uuid primary key default gen_random_uuid(),
  nume               text not null,
  post               text not null,
  -- Sezonul de bonus (sept–iun) și vara (iul–aug) au grile diferite.
  perioada           text not null default 'sezon' check (perioada in ('sezon','vara')),
  cota_manager       numeric not null default 0.15 check (cota_manager >= 0 and cota_manager < 1),
  zile_min_evaluare  int not null default 15,
  stare              text not null default 'ciorna' check (stare in ('ciorna','activ','arhivat')),
  nota               text,
  created            timestamptz not null default now(),
  updated            timestamptz not null default now(),
  unique (post, perioada, nume)
);

-- ── 3. Grile per angajat ────────────────────────────────────────────────────
-- Identitatea titularului acoperă ambele cazuri din aplicație: conturile de
-- staff trăiesc doar în auth.users (nu există tabelă de profiluri), iar
-- instructorii au rând propriu în `teacheri` cu `auth_user_id` NULLABLE — deci
-- există instructori fără cont, pe care o singură coloană i-ar exclude.
--
-- `on delete set null` + `titular_nume` denormalizat: ștergerea contului unui
-- angajat plecat NU are voie să șteargă luni închise cu salarii deja plătite.
-- Numele e oricum necesar: azi aplicația afișează emailul brut ca nume de om
-- pentru front_desk/manager (vezi PontajStaffPage).

create extension if not exists btree_gist;

create table if not exists kpi_grile (
  id                 uuid primary key default gen_random_uuid(),
  titular_user       uuid references auth.users(id) on delete set null,
  titular_teacher    uuid references teacheri(id)   on delete set null,
  titular_nume       text not null,
  titular_key        text generated always as (
                       coalesce('u:' || titular_user::text, 't:' || titular_teacher::text)
                     ) stored,
  post               text not null,
  perioada           text not null default 'sezon' check (perioada in ('sezon','vara')),
  cota_manager       numeric not null default 0.15 check (cota_manager >= 0 and cota_manager < 1),
  zile_min_evaluare  int not null default 15,
  sablon_sursa       uuid references kpi_sabloane(id) on delete set null,
  -- Grilele se schimbă doar la granița de lună: altfel acoperirea parțială se
  -- suprapune peste pro-rata pe zile lucrate și bonusul se numără de două ori.
  valabil_de_la      date not null check (extract(day from valabil_de_la) = 1),
  valabil_pana_la    date,
  stare              text not null default 'ciorna' check (stare in ('ciorna','activa','incheiata')),
  nota               text,
  creat_de           uuid references auth.users(id) on delete set null,
  created            timestamptz not null default now(),
  updated            timestamptz not null default now(),
  constraint kpi_grile_titular_unic check (num_nonnulls(titular_user, titular_teacher) = 1),
  constraint kpi_grile_interval check (valabil_pana_la is null or valabil_pana_la >= valabil_de_la),
  -- Un titular nu poate avea două grile active în aceeași perioadă. Locațiile
  -- NU intră în cheie: o grilă acoperă unul sau mai multe puncte de lucru.
  constraint kpi_grile_fara_suprapunere exclude using gist (
    titular_key with =,
    perioada with =,
    daterange(valabil_de_la, coalesce(valabil_pana_la, 'infinity'::date), '[)') with &&
  )
);

-- O grilă acoperă 1..N puncte de lucru, agregate. Cazul real: Theodora ține
-- Nicolina + Quasar 4 Kids, calculate împreună.
create table if not exists kpi_grila_locatii (
  grila_id uuid not null references kpi_grile(id) on delete cascade,
  locatie  uuid not null references locatii(id) on delete cascade,
  primary key (grila_id, locatie)
);

-- ── 4. Liniile — „fișa editabilă" ───────────────────────────────────────────
-- Un rând = un bonus, cu pondere, condiții descriptive, praguri și sume.
-- Aceeași formă la șablon și la grilă (clona copiază 1:1).

create table if not exists kpi_sablon_linii (
  id                        uuid primary key default gen_random_uuid(),
  sablon_id                 uuid not null references kpi_sabloane(id) on delete cascade,
  kpi_id                    uuid not null references kpi_definitii(id) on delete restrict,
  pondere                   numeric not null default 0 check (pondere >= 0),
  tip_prag                  text not null default 'procent'
                              check (tip_prag in ('procent','numar','afirmativ')),
  prag_standard             numeric,
  prag_peste                numeric,
  conditie_sub              text,
  conditie_standard         text,
  conditie_peste            text,
  suma_standard             numeric,
  suma_peste                numeric,
  mod_calcul                text not null default 'fix' check (mod_calcul in ('fix','comision')),
  comision_procent_standard numeric,
  comision_procent_peste    numeric,
  comision_plafon           numeric,
  -- null = toate lunile. Acoperă și „iunie exclus la reactivare", și bonusurile
  -- de proiect care apar doar în dec/apr/iun.
  luni_active               int[],
  eliminatoriu              boolean not null default false,
  are_poarta                boolean not null default false,
  parametri                 jsonb not null default '{}',
  activ                     boolean not null default true,
  ordine                    int not null default 0,
  unique (sablon_id, kpi_id)
);

create table if not exists kpi_grila_linii (
  id                        uuid primary key default gen_random_uuid(),
  grila_id                  uuid not null references kpi_grile(id) on delete cascade,
  kpi_id                    uuid not null references kpi_definitii(id) on delete restrict,
  pondere                   numeric not null default 0 check (pondere >= 0),
  tip_prag                  text not null default 'procent'
                              check (tip_prag in ('procent','numar','afirmativ')),
  prag_standard             numeric,
  prag_peste                numeric,
  conditie_sub              text,
  conditie_standard         text,
  conditie_peste            text,
  suma_standard             numeric,
  suma_peste                numeric,
  mod_calcul                text not null default 'fix' check (mod_calcul in ('fix','comision')),
  comision_procent_standard numeric,
  comision_procent_peste    numeric,
  comision_plafon           numeric,
  luni_active               int[],
  eliminatoriu              boolean not null default false,
  are_poarta                boolean not null default false,
  parametri                 jsonb not null default '{}',
  activ                     boolean not null default true,
  ordine                    int not null default 0,
  unique (grila_id, kpi_id)
);

create index if not exists kpi_grile_titular_idx on kpi_grile (titular_user, titular_teacher);
create index if not exists kpi_grila_linii_grila_idx on kpi_grila_linii (grila_id, ordine);
create index if not exists kpi_sablon_linii_sablon_idx on kpi_sablon_linii (sablon_id, ordine);

-- ── 5. Validarea parametrilor, pe trei straturi ─────────────────────────────
-- Fiecare acoperă ce celelalte nu pot:
--   (a) CHECK cu funcție immutable — doar FORMA. O funcție immutable nu poate
--       citi kpi_definitii (citirea de tabel o face volatile).
--   (b) TRIGGER — validarea conștientă de schemă: chei existente, tipuri,
--       min/max, completarea cheilor lipsă din `default`. Ăsta apără efectiv.
--   (c) RPC ca unică ușă de scriere (mai jos): fără politici UPDATE directe.

create or replace function kpi_parametri_forma_valida(p jsonb) returns boolean
language sql immutable as $$
  select p is null or (
    jsonb_typeof(p) = 'object'
    and coalesce(
      (select bool_and(jsonb_typeof(value) in ('number','boolean','string'))
       from jsonb_each(p)), true)
  );
$$;

alter table kpi_sablon_linii drop constraint if exists kpi_sablon_linii_parametri_forma;
alter table kpi_sablon_linii add constraint kpi_sablon_linii_parametri_forma
  check (kpi_parametri_forma_valida(parametri));
alter table kpi_grila_linii drop constraint if exists kpi_grila_linii_parametri_forma;
alter table kpi_grila_linii add constraint kpi_grila_linii_parametri_forma
  check (kpi_parametri_forma_valida(parametri));

create or replace function trg_kpi_linie_valideaza_parametri() returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_schema jsonb;
  v_desc   jsonb;
  v_val    jsonb;
  v_out    jsonb := '{}'::jsonb;
begin
  select parametri_schema into v_schema from kpi_definitii where id = new.kpi_id;
  if v_schema is null or jsonb_array_length(v_schema) = 0 then
    new.parametri := '{}'::jsonb;
    return new;
  end if;

  -- Cheile necunoscute se resping: o cheie scrisă greșit ar fi citită ca lipsă
  -- și indicatorul ar rula tăcut pe valoarea implicită.
  perform 1 from jsonb_object_keys(coalesce(new.parametri, '{}'::jsonb)) k
   where not exists (
     select 1 from jsonb_array_elements(v_schema) d where d ->> 'cheie' = k
   );
  if found then
    raise exception 'Parametru necunoscut pentru acest KPI' using errcode = '22023';
  end if;

  for v_desc in select * from jsonb_array_elements(v_schema) loop
    v_val := new.parametri -> (v_desc ->> 'cheie');
    if v_val is null then
      v_val := coalesce(v_desc -> 'default', 'null'::jsonb);   -- completare din schemă
    elsif (v_desc ->> 'tip') in ('numar','procent') then
      if jsonb_typeof(v_val) <> 'number' then
        raise exception 'Parametrul % trebuie să fie număr', v_desc ->> 'cheie'
          using errcode = '22023';
      end if;
      if v_desc ? 'min' and (v_val)::text::numeric < (v_desc ->> 'min')::numeric then
        raise exception 'Parametrul % e sub minimul admis (%)',
          v_desc ->> 'cheie', v_desc ->> 'min' using errcode = '22023';
      end if;
      if v_desc ? 'max' and (v_val)::text::numeric > (v_desc ->> 'max')::numeric then
        raise exception 'Parametrul % e peste maximul admis (%)',
          v_desc ->> 'cheie', v_desc ->> 'max' using errcode = '22023';
      end if;
    end if;
    if v_val <> 'null'::jsonb then
      v_out := v_out || jsonb_build_object(v_desc ->> 'cheie', v_val);
    end if;
  end loop;

  new.parametri := v_out;
  return new;
end;
$$;

drop trigger if exists trg_valideaza_parametri on kpi_grila_linii;
create trigger trg_valideaza_parametri before insert or update on kpi_grila_linii
  for each row execute function trg_kpi_linie_valideaza_parametri();

drop trigger if exists trg_valideaza_parametri on kpi_sablon_linii;
create trigger trg_valideaza_parametri before insert or update on kpi_sablon_linii
  for each row execute function trg_kpi_linie_valideaza_parametri();

-- ── 6. RLS ──────────────────────────────────────────────────────────────────
-- Citire pentru manageri și mai sus (managerul PL își vede grila oamenilor lui
-- ca să înțeleagă raportul); scriere doar owner/admin, prin RPC.

do $$
declare t text;
begin
  foreach t in array array['kpi_definitii','kpi_campuri','kpi_sabloane',
                           'kpi_sablon_linii','kpi_grile','kpi_grila_locatii',
                           'kpi_grila_linii'] loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated '
      || 'using (auth_role() in (''owner'',''admin'',''manager''))', t || '_select', t);

    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format(
      'create policy %I on public.%I for all to authenticated '
      || 'using (is_admin()) with check (is_admin())', t || '_write', t);

    -- Garduri restrictive obligatorii. ALLOWLIST, nu denylist: `auth_role()`
    -- cade pe 'front_desk' pentru requesturile fără rol.
    execute format('drop policy if exists deny_parinte_direct on public.%I', t);
    execute format(
      'create policy deny_parinte_direct on public.%I as restrictive for all to authenticated '
      || 'using (auth_role() <> %L) with check (auth_role() <> %L)', t, 'parinte', 'parinte');
    execute format('drop policy if exists deny_marketing_direct on public.%I', t);
    execute format(
      'create policy deny_marketing_direct on public.%I as restrictive for all to authenticated '
      || 'using (auth_role() <> %L) with check (auth_role() <> %L)', t, 'marketing', 'marketing');
  end loop;
end $$;

-- ── 7. Seed: catalogul celor 5 indicatori de bonus + eliminatoriile ─────────
-- Numerele proprii fiecărui indicator (ziua-termen 20, cele 21 de zile, plafonul
-- de 300 lei) devin editabile din UI — MOA-ul le marchează explicit „de ajustat
-- la ian. 2027", deci n-au ce căuta în cod.

insert into kpi_definitii (cheie, denumire, descriere, sursa, tip_valoare, unitate,
                           posturi_sugerate, parametri_schema, ordine) values
('incasare_la_termen',
 'Încasare la termen',
 'Cât din ce era scadent în luna facturată s-a încasat până în ziua-termen. Doar abonamentele cu plată lunară.',
 'auto', 'procent', '%', array['front_desk'],
 '[{"cheie":"zi_termen","eticheta":"Ziua-termen a lunii","tip":"numar","min":1,"max":28,"default":20,"unitate":"zi"}]'::jsonb,
 10),

('restante_recuperate',
 'Restanțe recuperate',
 'Din stocul de restanțe mai vechi de 30 de zile (banda peste 1 an se exclude), cât s-a recuperat în lună.',
 'auto', 'procent', '%', array['front_desk'],
 '[{"cheie":"zile_min","eticheta":"Vechime minimă a restanței","tip":"numar","min":0,"max":365,"default":30,"unitate":"zile"},
   {"cheie":"zile_max","eticheta":"Vechime maximă (peste = se exclude)","tip":"numar","min":30,"max":3650,"default":365,"unitate":"zile"}]'::jsonb,
 20),

('reactivare_21z',
 'Reactivarea absenților de 21 de zile',
 'Din cazurile intrate în jurnalul de absențe, câți au revenit la curs. Poarta de proces: toate cazurile contactate în 48h.',
 'auto', 'procent', '%', array['front_desk'],
 '[{"cheie":"zile_absenta","eticheta":"Prag de tăcere","tip":"numar","min":7,"max":90,"default":21,"unitate":"zile"},
   {"cheie":"min_sedinte","eticheta":"Ședințe ținute de grupă în fereastră (filtru vacanță)","tip":"numar","min":0,"max":10,"default":2},
   {"cheie":"poarta_ore","eticheta":"Termen de contactare","tip":"numar","min":1,"max":168,"default":48,"unitate":"ore"},
   {"cheie":"fereastra_reactivare","eticheta":"Fereastră de revenire","tip":"numar","min":7,"max":120,"default":30,"unitate":"zile"}]'::jsonb,
 30),

('raspuns_24h',
 'Răspuns sub 24 de ore',
 'Rata de răspuns la mesaje, din Meta Business Suite, plus apelurile pierdute fără revenire. Cifrele se completează manual.',
 'auto', 'procent', '%', array['front_desk'],
 '[{"cheie":"rata_sub","eticheta":"Sub acest procent = sub-standard","tip":"numar","min":0,"max":100,"default":90,"unitate":"%"},
   {"cheie":"rata_standard","eticheta":"De la acest procent = standard","tip":"numar","min":0,"max":100,"default":95,"unitate":"%"},
   {"cheie":"timp_peste_ore","eticheta":"Timp mediu pentru peste standard","tip":"numar","min":1,"max":48,"default":4,"unitate":"ore"}]'::jsonb,
 40),

('conversie_lead',
 'Conversie lead → client plătitor',
 'Din leadurile lunii precedente atribuite punctului de lucru, câte au ajuns la prima plată în fereastra dată.',
 'auto', 'procent', '%', array['front_desk'],
 '[{"cheie":"fereastra_zile","eticheta":"Fereastră de conversie","tip":"numar","min":7,"max":180,"default":30,"unitate":"zile"},
   {"cheie":"decalaj_luni","eticheta":"Decalaj față de luna raportată","tip":"numar","min":0,"max":3,"default":1,"unitate":"luni"}]'::jsonb,
 50),

('diferente_casa',
 'Diferențe de casă',
 'Se citește automat din registrul de casă: orice zi din lună cu total numărat ≠ total sistem.',
 'auto', 'bifa', null, array['front_desk'], '[]'::jsonb, 60),

('prezente_confirmate',
 'Prezențe confirmate',
 'Prezențele zilei confirmate de recepție. Până la implementarea flagului de confirmare, bifă manuală.',
 'manual', 'bifa', null, array['front_desk'], '[]'::jsonb, 70),

('reducere_peste_politica',
 'Reducere acordată peste politică',
 'Bifă a managerului. Se schimbă doar dacă s-a întâmplat ceva.',
 'manual', 'bifa', null, array['front_desk'], '[]'::jsonb, 80),

('reclamatii_48h',
 'Reclamații tratate în 48 de ore',
 'Bifă a managerului, din registrul de reclamații.',
 'manual', 'bifa', null, array['front_desk'], '[]'::jsonb, 90)
on conflict (cheie) do nothing;

-- Cele patru câmpuri manuale ale indicatorului „răspuns sub 24h".
insert into kpi_campuri (kpi_id, cheie, eticheta, tip, unitate, ordine)
select d.id, v.cheie, v.eticheta, v.tip, v.unitate, v.ordine
from kpi_definitii d
cross join (values
  ('rata_meta',        'Rata de răspuns ≤24h (Meta Business Suite)', 'procent', '%',   10),
  ('timp_mediu',       'Timp mediu de răspuns',                      'numar',   'ore', 20),
  ('apeluri_pierdute', 'Apeluri pierdute fără revenire în aceeași zi','numar',   null,  30),
  ('sondaj_real',      'Sondaj 5 conversații: primul răspuns a fost unul real?', 'bifa', null, 40)
) as v(cheie, eticheta, tip, unitate, ordine)
where d.cheie = 'raspuns_24h'
on conflict (kpi_id, cheie) do nothing;

-- ── 8. Seed: șablonul „Front-desk" ──────────────────────────────────────────
-- Ponderile și textele treptelor vin din MOA v2 (31 aug. 2026). Pragurile sunt
-- valori de PORNIRE (Ștefan cel Mare) — se ajustează per angajat, fiindcă
-- diferă pe punct de lucru. SUMELE ÎN LEI RĂMÂN GOALE: MOA nu le conține, le
-- pune Alex, iar activarea grilei le cere.

insert into kpi_sabloane (nume, post, perioada, stare, nota)
values ('Responsabil Relații Clienți', 'front_desk', 'sezon', 'activ',
        'MOA v2, 31 aug. 2026. Pragurile sunt valori de pornire (Ștefan cel Mare); '
        || 'se ajustează per angajat. Sumele în lei se completează la atribuire.')
on conflict (post, perioada, nume) do nothing;

insert into kpi_sablon_linii
  (sablon_id, kpi_id, pondere, tip_prag, prag_standard, prag_peste,
   conditie_sub, conditie_standard, conditie_peste,
   mod_calcul, comision_procent_standard, comision_procent_peste, comision_plafon,
   luni_active, eliminatoriu, are_poarta, parametri, ordine)
select s.id, d.id, v.pondere, v.tip_prag, v.prag_std, v.prag_peste,
       v.c_sub, v.c_std, v.c_peste,
       v.mod_calcul, v.com_std, v.com_peste, v.plafon,
       v.luni, v.eliminatoriu, v.poarta, '{}'::jsonb, v.ordine
from kpi_sabloane s
join (values
  ('incasare_la_termen', 30, 'procent', 70::numeric, 76::numeric,
   'Nu se urmăresc scadențele.',
   'Urmărire după scadență: cine n-a plătit e contactat.',
   'Prevenție: anunț înainte de ziua 15, nu recuperare după.',
   'fix', null::numeric, null::numeric, null::numeric, null::int[], false, false, 10),

  ('reactivare_21z', 35, 'procent', 32::numeric, 39::numeric,
   'Cazurile rămân necontactate.',
   'Contactezi fiecare caz în 48 de ore.',
   'Rezolvi: omul chiar se întoarce la curs.',
   'fix', null, null, null, array[9,10,11,12,1,2,3,4,5]::int[], false, true, 20),

  ('restante_recuperate', 15, 'procent', 12::numeric, 30::numeric,
   'Restanțele stau pe loc.',
   'Cazurile ușoare: un telefon, o promisiune ținută.',
   'Cazurile grele: 3-4 contacte, eșalonare. De aceea comisionul urcă — munca e disproporționat mai grea, nu banii mai mulți.',
   'comision', 5::numeric, 8::numeric, 300::numeric, null, false, false, 30),

  ('raspuns_24h', 10, 'procent', 95::numeric, null::numeric,
   'Sub 90% sau apeluri pierdute fără revenire.',
   'Acoperire: 95% din mesaje primesc răspuns în 24h, zero apeluri pierdute.',
   'Viteză: timp mediu sub 4 ore, iar primul răspuns e unul real, nu o bifă.',
   'fix', null, null, null, null, false, false, 40),

  ('conversie_lead', 10, 'procent', 28::numeric, 36::numeric,
   'Leadurile rămân fără răspuns final.',
   'Preiei cererea: leadurile calde ajung la probă și la plată.',
   'Creezi cererea: convertești și leadurile reci.',
   'fix', null, null, null, null, false, false, 50),

  ('diferente_casa', 0, 'afirmativ', null::numeric, null::numeric,
   'Diferență de casă ≠ 0 → tot bonusul lunii se pierde.', null, null,
   'fix', null, null, null, null, true, false, 60),

  ('prezente_confirmate', 0, 'afirmativ', null, null,
   'Sub 95% din zilele lunii cu prezențe confirmate → tot bonusul se pierde.', null, null,
   'fix', null, null, null, null, true, false, 70),

  ('reducere_peste_politica', 0, 'afirmativ', null, null,
   'Reducere acordată peste politică → tot bonusul se pierde.', null, null,
   'fix', null, null, null, null, true, false, 80),

  ('reclamatii_48h', 0, 'afirmativ', null, null,
   'Reclamație netratată în 48h → tot bonusul se pierde.', null, null,
   'fix', null, null, null, null, true, false, 90)
) as v(cheie, pondere, tip_prag, prag_std, prag_peste, c_sub, c_std, c_peste,
       mod_calcul, com_std, com_peste, plafon, luni, eliminatoriu, poarta, ordine)
  on true
join kpi_definitii d on d.cheie = v.cheie
where s.post = 'front_desk' and s.perioada = 'sezon'
  and s.nume = 'Responsabil Relații Clienți'
on conflict (sablon_id, kpi_id) do nothing;
