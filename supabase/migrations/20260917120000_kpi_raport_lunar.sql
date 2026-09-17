-- Etapa 4 a motorului de grile KPI: raportul lunar per angajat.
--
-- Până aici existau configurația (kpi_grile + linii) și doi indicatori automați
-- (kpi_k1, kpi_k2). Aici se adaugă restul indicatorilor automați ai postului
-- Responsabil Relații Clienți, MOTORUL care transformă o grilă într-o sumă în
-- lei, și ÎNGHEȚAREA lunii.
--
-- Principiul care decide fiecare detaliu de mai jos: raportul închis trebuie să
-- fie AUTO-SUFICIENT. Peste un an, când cineva întreabă „de ce a luat 690 de lei
-- în octombrie", răspunsul se citește din rândul de atunci — nu din catalogul de
-- azi, nu din grila editată între timp. De aceea `config_aplicata` conține
-- definițiile, etichetele, câmpurile și liniile, iar renderer-ul lunii închise
-- citește de acolo.

-- ── 1. Raportul lunar ───────────────────────────────────────────────────────
-- `grila_id` cu `on delete set null` + `titular_nume` denormalizat, ca la grile:
-- ștergerea unui cont de angajat plecat nu are voie să șteargă luni închise cu
-- bani deja plătiți.

create table if not exists raport_kpi_lunar (
  id           uuid primary key default gen_random_uuid(),
  grila_id     uuid references kpi_grile(id) on delete set null,
  anul         int not null check (anul between 2020 and 2100),
  luna         int not null check (luna between 1 and 12),
  titular_nume text not null,
  stare        text not null default 'draft' check (stare in ('draft','inchis')),

  -- Ce completează managerul: {cheie_kpi: {camp: valoare, ...}}.
  -- Singura coloană pe care UI-ul o scrie direct (grant pe coloană, mai jos).
  manual       jsonb not null default '{}',

  -- Zilele lucrate: pro-rata NU se aplică singură. Auto-completarea din pontaj
  -- e o SUGESTIE afișată în UI; dacă managerul n-o confirmă, ambele rămân NULL
  -- și luna se plătește întreagă. Un pontaj incomplet nu are voie să taie tăcut
  -- din bonusul cuiva.
  zile_lucrate int check (zile_lucrate is null or zile_lucrate >= 0),
  zile_baza    int check (zile_baza is null or zile_baza > 0),

  -- Rezultatul înghețat la închidere.
  kpi              jsonb,
  config_aplicata  jsonb,
  bonus_titular    numeric,
  fond_total       numeric,
  cota_manager     numeric,
  -- Σ ponderilor din grilă AȘA CUM ERA, nu cea normalizată: dacă cineva a
  -- configurat 95%, numărul trebuie să rămână vizibil după redistribuire.
  pondere_totala_configurata numeric,

  nota        text,
  creat_de    uuid references auth.users(id) on delete set null,
  inchis_de   uuid references auth.users(id) on delete set null,
  inchis_la   timestamptz,
  created     timestamptz not null default now(),
  updated     timestamptz not null default now(),
  unique (grila_id, anul, luna)
);

create index if not exists raport_kpi_lunar_luna_idx
  on raport_kpi_lunar (anul desc, luna desc);

alter table raport_kpi_lunar enable row level security;

drop policy if exists raport_kpi_lunar_select on raport_kpi_lunar;
create policy raport_kpi_lunar_select on raport_kpi_lunar
  for select to authenticated
  using (auth_role() in ('owner','admin','manager'));

-- Scrierea directă e limitată la câmpurile manuale ale unei luni în lucru.
-- Tranzițiile de stare și valorile calculate trec exclusiv prin RPC-uri.
drop policy if exists raport_kpi_lunar_update on raport_kpi_lunar;
create policy raport_kpi_lunar_update on raport_kpi_lunar
  for update to authenticated
  using (auth_role() in ('owner','admin','manager') and stare = 'draft')
  with check (stare = 'draft');

-- Gardurile restrictive obligatorii. ALLOWLIST prin egalitate negată explicit:
-- `auth_role()` cade pe 'front_desk' pentru requesturile fără rol.
drop policy if exists deny_parinte_direct on raport_kpi_lunar;
create policy deny_parinte_direct on raport_kpi_lunar
  as restrictive for all to authenticated
  using (auth_role() <> 'parinte') with check (auth_role() <> 'parinte');

drop policy if exists deny_marketing_direct on raport_kpi_lunar;
create policy deny_marketing_direct on raport_kpi_lunar
  as restrictive for all to authenticated
  using (auth_role() <> 'marketing') with check (auth_role() <> 'marketing');

-- Grant PE COLOANĂ: chiar și în 'draft', UI-ul poate atinge doar câmpurile
-- manuale. `bonus_titular` nu se editează niciodată cu un PATCH.
revoke insert, update, delete on raport_kpi_lunar from authenticated;
grant update (manual, zile_lucrate, zile_baza, nota) on raport_kpi_lunar to authenticated;

-- ── 2. K3 · Reactivarea absenților de 21 de zile ────────────────────────────
-- Populația vine din jurnalul `absente_21z` (etapa 1), nu se recalculează:
-- POARTA de proces (100% contactați în ≤48h) nu se poate reconstitui
-- retroactiv, îți trebuie ceasul pornit la intrare.
--
-- Fereastra de reactivare (30 de zile) se închide după sfârșitul lunii pentru
-- cazurile de la final. Se ia STAREA LA MOMENTUL CALCULULUI: cazurile încă
-- neevaluate intră în numitor cu rezultat „nu încă", nu se exclud. Altfel
-- închiderea în ziua 5 ar ascunde jumătate de lună de muncă.

create or replace function kpi_k3(
  p_locatii   uuid[],
  p_anul      int,
  p_luna      int,
  p_parametri jsonb default '{}'::jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with param as (
    select make_date(p_anul, p_luna, 1) as prima_zi,
           (make_date(p_anul, p_luna, 1) + interval '1 month')::date as luna_urm,
           coalesce((p_parametri ->> 'poarta_ore')::numeric, 48) as poarta_ore
  ),
  cazuri as (
    select a.id, a.contactat_la, a.created, a.reactivat, a.evaluat_la,
           extract(epoch from (a.contactat_la - a.created)) / 3600.0 as ore_pana_la_contact
    from absente_21z a, param p
    where a.data_intrare >= p.prima_zi
      and a.data_intrare <  p.luna_urm
      and a.locatie = any(p_locatii)
  )
  select jsonb_build_object(
    'kpi', 'reactivare_21z',
    'numitor',   (select count(*) from cazuri),
    'numarator', (select count(*) from cazuri where reactivat is true),
    'valoare', case when (select count(*) from cazuri) = 0 then null
                    else round((select count(*) from cazuri where reactivat is true)::numeric
                               / (select count(*) from cazuri) * 100, 1) end,
    -- Poarta: TOATE cazurile contactate în termen. Un singur caz necontactat
    -- anulează linia — de asta e „poartă", nu încă un procent.
    'poarta_ok', (select count(*) from cazuri) = 0
                 or not exists (
                   select 1 from cazuri c, param p
                   where c.contactat_la is null
                      or c.ore_pana_la_contact > p.poarta_ore),
    'contactate_la_timp', (select count(*) from cazuri c, param p
                            where c.contactat_la is not null
                              and c.ore_pana_la_contact <= p.poarta_ore),
    'necontactate',       (select count(*) from cazuri where contactat_la is null),
    'contactate_tarziu',  (select count(*) from cazuri c, param p
                            where c.contactat_la is not null
                              and c.ore_pana_la_contact > p.poarta_ore),
    -- informativ: câte cazuri mai au fereastra de revenire deschisă
    'neevaluate', (select count(*) from cazuri where evaluat_la is null),
    'poarta_ore', (select poarta_ore from param)
  );
$$;

revoke execute on function kpi_k3(uuid[], int, int, jsonb) from anon, public;
grant execute on function kpi_k3(uuid[], int, int, jsonb) to authenticated;

-- ── 3. K4 · Răspuns sub 24 de ore (indicator COMPUS) ───────────────────────
-- Singurul indicator care nu se poate măsura din baza noastră: cifrele vin din
-- Meta Business Suite și din observația directă. De aceea are altă semnătură —
-- primește valorile manuale, nu locațiile. Dispecerul e un CASE static, deci
-- știe ce argumente să dea fiecărei ramuri; uniformitatea semnăturii nu merită
-- plătită cu un parametru fals la toate celelalte.
--
-- Banda NU se poate deduce dintr-un singur procent (MOA cere trei condiții
-- simultane la „peste": viteză, zero apeluri pierdute, primul răspuns real).
-- Funcția întoarce deci și `banda`, iar motorul o respectă când există. E
-- singura portiță prin care un indicator își poate decide propria treaptă.
--
-- ⚠️ Zona dintre `rata_sub` (90%) și `rata_standard` (95%) e SUB-STANDARD:
-- MOA definește standardul ca „≥95% și zero apeluri pierdute", deci 92% nu e
-- standard. Dacă asta se dorește altfel, se mută `rata_sub` — e parametru.

create or replace function kpi_k4(
  p_manual    jsonb,
  p_parametri jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_rata      numeric := nullif(p_manual ->> 'rata_meta', '')::numeric;
  v_timp      numeric := nullif(p_manual ->> 'timp_mediu', '')::numeric;
  v_pierdute  numeric := nullif(p_manual ->> 'apeluri_pierdute', '')::numeric;
  v_sondaj    boolean := nullif(p_manual ->> 'sondaj_real', '')::boolean;
  v_sub       numeric := coalesce((p_parametri ->> 'rata_sub')::numeric, 90);
  v_std       numeric := coalesce((p_parametri ->> 'rata_standard')::numeric, 95);
  v_ore       numeric := coalesce((p_parametri ->> 'timp_peste_ore')::numeric, 4);
  v_banda     text;
begin
  if v_rata is null or v_pierdute is null then
    -- `motiv` e un COD, nu o propoziție: motorul îl citește ca să decidă dacă
    -- lipsa blochează închiderea. Textul pentru om merge separat.
    return jsonb_build_object(
      'kpi', 'raspuns_24h', 'valoare', null, 'banda', 'na',
      'motiv', 'necompletat',
      'motiv_text', 'Rata de răspuns și apelurile pierdute nu sunt completate.');
  end if;

  if v_rata < v_sub or v_pierdute > 0 then
    v_banda := 'sub';
  elsif v_rata >= v_std then
    v_banda := case
      when v_timp is not null and v_timp <= v_ore and v_sondaj is true then 'peste'
      else 'standard' end;
  else
    v_banda := 'sub';
  end if;

  return jsonb_build_object(
    'kpi', 'raspuns_24h',
    'valoare', v_rata,
    'banda', v_banda,
    'timp_mediu', v_timp,
    'apeluri_pierdute', v_pierdute,
    'sondaj_real', v_sondaj,
    'praguri', jsonb_build_object('sub', v_sub, 'standard', v_std, 'ore_peste', v_ore)
  );
end;
$$;

revoke execute on function kpi_k4(jsonb, jsonb) from anon, public;
grant execute on function kpi_k4(jsonb, jsonb) to authenticated;

-- ── 4. Eliminatoriul „diferențe de casă", citit automat ─────────────────────
-- Din registrul de casă, nu dintr-o bifă: e singurul eliminatoriu pe care baza
-- îl știe deja. `total_sistem` de pe rândul salvat e un SNAPSHOT înghețat la
-- momentul numărării — calculul merge pe view-ul `reconcilieri_cash_live`,
-- exact ca rapoartele financiare.
--
-- Zilele fără reconciliere NU se numără ca diferență (n-avem ce compara), dar
-- se raportează: o lună cu 3 reconcilieri din 26 de zile lucrate spune altceva
-- decât o lună curată.

create or replace function kpi_diferente_casa(
  p_locatii uuid[],
  p_anul    int,
  p_luna    int,
  p_toleranta numeric default 0.01
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with param as (
    select make_date(p_anul, p_luna, 1) as prima_zi,
           (make_date(p_anul, p_luna, 1) + interval '1 month')::date as luna_urm
  ),
  zile as (
    select r.data, r.locatie_nume,
           round(coalesce(r.total_numarat, 0)
                 - (coalesce(r.total_sistem_live, 0) - coalesce(r.total_cheltuieli, 0)), 2) as dif
    from reconcilieri_cash_live r, param p
    where r.data >= p.prima_zi and r.data < p.luna_urm
      and r.locatie = any(p_locatii)
  )
  select jsonb_build_object(
    'kpi', 'diferente_casa',
    -- `valoare` booleană = criteriul e ÎNDEPLINIT (nicio zi cu diferență)
    'valoare', not exists (select 1 from zile where abs(dif) >= p_toleranta),
    'zile_reconciliate', (select count(*) from zile),
    'zile_cu_diferenta', (select count(*) from zile where abs(dif) >= p_toleranta),
    'suma_diferentelor',  (select coalesce(sum(dif), 0) from zile where abs(dif) >= p_toleranta),
    'detalii', coalesce((
      select jsonb_agg(jsonb_build_object('data', data, 'locatie', locatie_nume, 'dif', dif)
                       order by data)
      from zile where abs(dif) >= p_toleranta), '[]'::jsonb)
  );
$$;

revoke execute on function kpi_diferente_casa(uuid[], int, int, numeric) from anon, public;
grant execute on function kpi_diferente_casa(uuid[], int, int, numeric) to authenticated;

-- ── 5. Ce indicatori automați au ramură în dispecer ─────────────────────────
-- Lista e statică și DUBLU folosită: aici respinge activarea unei grile care
-- conține un indicator încă neimplementat, iar în dispecer eșuează zgomotos
-- dacă totuși ajunge acolo. Fără gardul de la activare, descoperirea s-ar face
-- în ziua 5 a lunii, la închidere — adică în ziua în care se plătesc bani.

create or replace function kpi_auto_implementat(p_cheie text)
returns boolean
language sql
immutable
as $$
  select p_cheie in ('incasare_la_termen','restante_recuperate','reactivare_21z',
                     'raspuns_24h','diferente_casa');
$$;

revoke execute on function kpi_auto_implementat(text) from anon, public;
grant execute on function kpi_auto_implementat(text) to authenticated;

-- ── 6. Zilele lucrate, sugerate din pontaj ──────────────────────────────────
-- Doar SUGESTIE (vezi comentariul de la coloane). Baza = zilele în care punctul
-- de lucru a avut pe cineva în tură, nu zilele calendaristice: „ai lucrat 18
-- din 26 de zile în care recepția a fost deschisă" e o propoziție verificabilă.

create or replace function kpi_zile_pontaj(
  p_user    uuid,
  p_locatii uuid[],
  p_anul    int,
  p_luna    int
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with param as (
    select make_date(p_anul, p_luna, 1) as prima_zi,
           (make_date(p_anul, p_luna, 1) + interval '1 month')::date as luna_urm
  )
  select jsonb_build_object(
    'lucrate', case when p_user is null then null else (
      select count(distinct (sp.start_at at time zone 'Europe/Bucharest')::date)
      from staff_pontaj sp, param p
      where sp.user_id = p_user
        and sp.start_at >= p.prima_zi and sp.start_at < p.luna_urm) end,
    'baza', (
      select count(distinct (sp.start_at at time zone 'Europe/Bucharest')::date)
      from staff_pontaj sp, param p
      where sp.locatie_id = any(p_locatii)
        and sp.start_at >= p.prima_zi and sp.start_at < p.luna_urm)
  );
$$;

revoke execute on function kpi_zile_pontaj(uuid, uuid[], int, int) from anon, public;
grant execute on function kpi_zile_pontaj(uuid, uuid[], int, int) to authenticated;

-- ── 7. MOTORUL ─────────────────────────────────────────────────────────────
-- Preview live, fără scriere: aceeași funcție alimentează ecranul în lucru și
-- valoarea înghețată la închidere. Dacă ar fi două coduri, ar diverge exact în
-- luna în care nimeni nu se mai uită.
--
-- DISPECERIZARE PRIN `IF/ELSIF` STATIC PE CHEIE, niciodată `execute` dinamic:
-- cheia vine dintr-un rând editabil din UI, iar funcția e `security definer` pe
-- tabela care produce salarii. Un identificator de funcție luat din date ar fi
-- cale de escaladare fix acolo unde doare.
--
-- DOUĂ FELURI DE „N/A", tratate diferit, fiindcă înseamnă lucruri diferite:
--   • linia nu se aplică luna asta (`luni_active`) → iese din bază cu totul.
--     Banii ei nu există în luna asta, deci nu se redistribuie nimănui.
--   • numitorul e zero (n-a existat stoc de restanțe, n-a intrat nimeni în
--     jurnal) → omul n-avea ce să măsoare, nu e vina lui. Ponderea liniei se
--     REDISTRIBUIE proporțional peste liniile evaluate.
-- Σ ponderilor configurate se salvează separat, ca o grilă greșită (95%) să nu
-- fie mascată de normalizare.

create or replace function calculeaza_raport_kpi(
  p_grila uuid,
  p_anul  int,
  p_luna  int
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_g            kpi_grile;
  v_locatii      uuid[];
  v_loc_nume     text;
  v_raport       raport_kpi_lunar;
  v_manual       jsonb := '{}'::jsonb;
  v_l            record;
  v_rez          jsonb;
  v_man_kpi      jsonb;
  v_valoare      numeric;
  v_bifa         boolean;
  v_banda        text;
  v_suma         numeric;
  v_procent      numeric;
  v_poarta_ok    boolean;
  v_motiv        text;
  v_conditie     text;
  v_aplicabil    boolean;
  v_linii        jsonb := '[]'::jsonb;
  v_elim         jsonb := '[]'::jsonb;
  v_elim_picat   boolean := false;
  v_pond_total   numeric := 0;   -- Σ ponderi configurate (toate lunile)
  v_pond_luna    numeric := 0;   -- Σ ponderi aplicabile luna asta
  v_pond_eval    numeric := 0;   -- Σ ponderi care chiar au produs o valoare
  v_brut_pond    numeric := 0;
  v_brut_fix     numeric := 0;
  v_plafon_pond  numeric := 0;   -- cât s-ar fi putut câștiga la maximum
  v_factor       numeric := 1;
  v_prorata      numeric := 1;
  v_avertismente text[] := '{}';
  v_na_nume      text[] := '{}';
  v_sub_prag     boolean := false;
  v_blocante     text[] := '{}';
  v_bonus        numeric;
  v_zile_sug     jsonb;
begin
  if auth_role() not in ('owner','admin','manager') then
    raise exception 'Raportul KPI e vizibil doar managerilor' using errcode = '42501';
  end if;

  select * into v_g from kpi_grile where id = p_grila;
  if not found then
    raise exception 'Grila nu există' using errcode = 'P0002';
  end if;

  select array_agg(gl.locatie), string_agg(lo.nume, ', ' order by lo.nume)
    into v_locatii, v_loc_nume
  from kpi_grila_locatii gl join locatii lo on lo.id = gl.locatie
  where gl.grila_id = p_grila;

  if v_locatii is null then
    raise exception 'Grila nu are niciun punct de lucru' using errcode = '22023';
  end if;

  -- Grila trebuie să acopere luna. Verificare aici, nu doar la închidere:
  -- altfel previewul ar arăta cifre pentru o lună pe care grila n-o guvernează.
  if v_g.valabil_de_la > (make_date(p_anul, p_luna, 1) + interval '1 month - 1 day')::date
     or (v_g.valabil_pana_la is not null and v_g.valabil_pana_la < make_date(p_anul, p_luna, 1))
  then
    v_blocante := v_blocante || format('Grila nu acoperă %s/%s (valabilă de la %s).',
                                       p_luna, p_anul, v_g.valabil_de_la);
  end if;
  if v_g.stare <> 'activa' then
    v_blocante := v_blocante || format('Grila e în starea „%s", nu „activă".', v_g.stare);
  end if;

  select * into v_raport from raport_kpi_lunar
   where grila_id = p_grila and anul = p_anul and luna = p_luna;
  v_manual := coalesce(v_raport.manual, '{}'::jsonb);

  v_zile_sug := kpi_zile_pontaj(v_g.titular_user, v_locatii, p_anul, p_luna);

  for v_l in
    select l.*, d.cheie, d.denumire, d.sursa, d.tip_valoare, d.directie, d.unitate
    from kpi_grila_linii l
    join kpi_definitii d on d.id = l.kpi_id
    where l.grila_id = p_grila and l.activ
    order by l.ordine, d.ordine
  loop
    v_rez := null; v_valoare := null; v_bifa := null; v_banda := null;
    v_suma := 0; v_motiv := null; v_poarta_ok := null; v_conditie := null;
    v_procent := null;
    v_man_kpi := coalesce(v_manual -> v_l.cheie, '{}'::jsonb);
    v_aplicabil := v_l.luni_active is null or p_luna = any(v_l.luni_active);

    -- ── valoarea brută ──
    if v_l.sursa = 'auto' then
      if    v_l.cheie = 'incasare_la_termen'  then v_rez := kpi_k1(v_locatii, p_anul, p_luna, v_l.parametri);
      elsif v_l.cheie = 'restante_recuperate' then v_rez := kpi_k2(v_locatii, p_anul, p_luna, v_l.parametri);
      elsif v_l.cheie = 'reactivare_21z'      then v_rez := kpi_k3(v_locatii, p_anul, p_luna, v_l.parametri);
      elsif v_l.cheie = 'raspuns_24h'         then v_rez := kpi_k4(v_man_kpi, v_l.parametri);
      elsif v_l.cheie = 'diferente_casa'      then v_rez := kpi_diferente_casa(v_locatii, p_anul, p_luna);
      else
        -- Eșec zgomotos, niciodată scor 0 în tăcere. Gardul de la activare ar
        -- fi trebuit să prindă asta mai devreme.
        raise exception 'KPI auto fără implementare: %', v_l.cheie using errcode = '22023';
      end if;

      if v_l.tip_prag = 'afirmativ' then
        v_bifa := (v_rez ->> 'valoare')::boolean;
      else
        v_valoare := nullif(v_rez ->> 'valoare', '')::numeric;
      end if;
    else
      -- manual: {cheie_kpi: {"valoare": x}}
      v_rez := jsonb_build_object('kpi', v_l.cheie, 'sursa', 'manual') || v_man_kpi;
      if v_l.tip_prag = 'afirmativ' or v_l.tip_valoare = 'bifa' then
        v_bifa := nullif(v_man_kpi ->> 'valoare', '')::boolean;
      else
        v_valoare := nullif(v_man_kpi ->> 'valoare', '')::numeric;
      end if;
    end if;

    -- ── banda ──
    if v_l.tip_prag = 'afirmativ' then
      if v_bifa is null then
        v_banda := 'na';
        v_motiv := 'necompletat';
      else
        v_banda := case when v_bifa then 'standard' else 'sub' end;
      end if;
    elsif v_rez ? 'banda' and (v_rez ->> 'banda') is not null then
      -- Indicatorul compus își decide singur treapta (vezi kpi_k4).
      v_banda := v_rez ->> 'banda';
      if v_banda = 'na' then v_motiv := coalesce(v_rez ->> 'motiv', 'necompletat'); end if;
    elsif v_valoare is null then
      v_banda := 'na';
      v_motiv := case when v_l.sursa = 'auto' then 'numitor_zero' else 'necompletat' end;
    elsif v_l.directie = 'mai_mic_e_bine' then
      v_banda := case
        when v_l.prag_peste is not null and v_valoare <= v_l.prag_peste then 'peste'
        when v_l.prag_standard is not null and v_valoare <= v_l.prag_standard then 'standard'
        else 'sub' end;
    else
      v_banda := case
        when v_l.prag_peste is not null and v_valoare >= v_l.prag_peste then 'peste'
        when v_l.prag_standard is not null and v_valoare >= v_l.prag_standard then 'standard'
        else 'sub' end;
    end if;

    -- ── poarta de proces ──
    -- Nu e încă un procent: un singur caz necontactat în 48h duce linia la zero,
    -- indiferent cât de bună e rata de reactivare.
    if v_l.are_poarta and v_rez ? 'poarta_ok' then
      v_poarta_ok := (v_rez ->> 'poarta_ok')::boolean;
      if v_poarta_ok is false and v_banda <> 'na' then
        v_banda := 'sub';
      end if;
    end if;

    -- ── eliminatoriile ──
    if v_l.eliminatoriu then
      if v_banda = 'na' then
        v_blocante := v_blocante || format('„%s”: eliminatoriul nu e completat.', v_l.denumire);
      elsif v_banda = 'sub' and v_aplicabil then
        v_elim_picat := true;
      end if;

      v_elim := v_elim || jsonb_build_object(
        'kpi_id', v_l.kpi_id, 'cheie', v_l.cheie, 'denumire', v_l.denumire,
        'sursa', v_l.sursa, 'aplicabil', v_aplicabil,
        'indeplinit', case when v_banda = 'na' then null else v_banda <> 'sub' end,
        'motiv', v_motiv,
        'conditie', v_l.conditie_sub,
        'detalii', v_rez
      );
      continue;
    end if;

    -- ── banii liniei ──
    if v_aplicabil and v_banda in ('standard','peste') then
      if v_l.mod_calcul = 'comision' then
        v_procent := case when v_banda = 'peste'
                          then coalesce(v_l.comision_procent_peste, v_l.comision_procent_standard)
                          else v_l.comision_procent_standard end;
        if v_procent is null or v_l.comision_plafon is null then
          v_blocante := v_blocante || format('„%s”: comisionul n-are procent sau plafon.', v_l.denumire);
        else
          v_suma := round(least(v_l.comision_plafon,
                                coalesce(nullif(v_rez ->> 'numarator', '')::numeric, 0)
                                * v_procent / 100), 2);
        end if;
      else
        v_suma := case when v_banda = 'peste' then v_l.suma_peste else v_l.suma_standard end;
        if v_suma is null then
          v_blocante := v_blocante || format('„%s”: lipsește suma în lei pentru treapta „%s”.',
                                             v_l.denumire, v_banda);
          v_suma := 0;
        end if;
      end if;
    end if;

    if v_aplicabil and v_banda = 'na' and v_motiv = 'necompletat' then
      v_blocante := v_blocante || format('„%s”: lipsesc datele manuale.', v_l.denumire);
    end if;

    v_conditie := case v_banda
      when 'peste' then v_l.conditie_peste
      when 'standard' then v_l.conditie_standard
      when 'sub' then v_l.conditie_sub
      else null end;

    -- ── contabilitatea ponderilor ──
    v_pond_total := v_pond_total + coalesce(v_l.pondere, 0);
    if v_aplicabil then
      v_pond_luna := v_pond_luna + coalesce(v_l.pondere, 0);
      if v_banda <> 'na' then
        v_pond_eval := v_pond_eval + coalesce(v_l.pondere, 0);
      else
        v_na_nume := v_na_nume || v_l.denumire;
      end if;
      if coalesce(v_l.pondere, 0) > 0 then
        v_brut_pond := v_brut_pond + coalesce(v_suma, 0);
        -- Plafonul liniei = cât ar fi valorat la treapta maximă. Suma lor e
        -- tavanul peste care redistribuirea nu are voie să treacă.
        v_plafon_pond := v_plafon_pond + case
          when v_l.mod_calcul = 'comision' then coalesce(v_l.comision_plafon, 0)
          else greatest(coalesce(v_l.suma_peste, 0), coalesce(v_l.suma_standard, 0)) end;
      else
        -- linie forfetară (pondere 0, neeliminatorie): bonus de proiect, plătit
        -- ca atare, în afara redistribuirii
        v_brut_fix := v_brut_fix + coalesce(v_suma, 0);
      end if;
    end if;

    v_linii := v_linii || jsonb_build_object(
      'kpi_id', v_l.kpi_id, 'cheie', v_l.cheie, 'denumire', v_l.denumire,
      'sursa', v_l.sursa, 'unitate', v_l.unitate, 'tip_prag', v_l.tip_prag,
      'pondere', v_l.pondere, 'aplicabil', v_aplicabil,
      'valoare', v_valoare, 'bifa', v_bifa,
      'prag_standard', v_l.prag_standard, 'prag_peste', v_l.prag_peste,
      'banda', v_banda, 'motiv', v_motiv,
      'motiv_text', v_rez ->> 'motiv_text',
      'conditie', v_conditie,
      'conditii', jsonb_build_object('sub', v_l.conditie_sub, 'standard', v_l.conditie_standard,
                                     'peste', v_l.conditie_peste),
      'are_poarta', v_l.are_poarta, 'poarta_ok', v_poarta_ok,
      'mod_calcul', v_l.mod_calcul,
      'comision_procent', case when v_l.mod_calcul = 'comision' then v_procent end,
      'comision_plafon', v_l.comision_plafon,
      'suma', round(coalesce(v_suma, 0), 2),
      'parametri', v_l.parametri,
      'detalii', v_rez
    );
  end loop;

  -- ── redistribuirea ──
  -- Proporțional peste liniile evaluate, dar NICIODATĂ peste plafonul lunii:
  -- dacă doar o linie mică a putut fi măsurată, factorul poate ajunge la 1,8 și
  -- ar plăti mai mult decât o lună perfectă. Tavanul e Σ treptelor maxime.
  if v_pond_eval > 0 and v_pond_luna > 0 then
    v_factor := v_pond_luna / v_pond_eval;
  end if;
  if v_factor > 1.0001 then
    v_avertismente := v_avertismente || format(
      'Redistribuire ×%s: %s n-a putut fi măsurat(ă) luna asta, ponderea s-a împărțit peste restul.',
      round(v_factor, 2), array_to_string(v_na_nume, ', '));
  end if;
  -- Sub jumătate din pondere măsurată = grila nu descrie luna. Nu blochează
  -- (o locație mică poate avea legitim zero cazuri), dar trebuie văzut cu ochii.
  if v_pond_luna > 0 and v_pond_eval < v_pond_luna / 2 then
    v_avertismente := v_avertismente || format(
      'Doar %s%% din ponderea lunii a produs o valoare (din %s%%). Verifică grila înainte de închidere.',
      round(v_pond_eval, 0), round(v_pond_luna, 0));
  end if;

  -- ── pro-rata pe zile lucrate ──
  if v_raport.zile_lucrate is not null then
    if v_raport.zile_lucrate < v_g.zile_min_evaluare then
      v_sub_prag := true;
    else
      v_prorata := least(1, v_raport.zile_lucrate::numeric
                            / greatest(coalesce(v_raport.zile_baza, v_raport.zile_lucrate), 1));
    end if;
  end if;

  if abs(v_pond_total - 100) > 0.01 then
    v_blocante := v_blocante
      || format('Suma ponderilor din grilă e %s%%, nu 100%%.', round(v_pond_total, 2));
  end if;

  v_bonus := case
    when v_elim_picat or v_sub_prag then 0
    else round((least(v_brut_pond * v_factor, greatest(v_plafon_pond, v_brut_pond)) + v_brut_fix)
               * v_prorata, 2) end;

  return jsonb_build_object(
    'grila', jsonb_build_object(
      'id', v_g.id, 'titular_nume', v_g.titular_nume, 'post', v_g.post,
      'perioada', v_g.perioada, 'stare', v_g.stare,
      'cota_manager', v_g.cota_manager, 'zile_min_evaluare', v_g.zile_min_evaluare,
      'locatii', v_loc_nume, 'valabil_de_la', v_g.valabil_de_la),
    'anul', p_anul, 'luna', p_luna,
    'linii', v_linii,
    'eliminatorii', v_elim,
    'eliminatoriu_picat', v_elim_picat,
    'zile', jsonb_build_object(
      'lucrate', v_raport.zile_lucrate, 'baza', v_raport.zile_baza,
      'prag', v_g.zile_min_evaluare, 'sub_prag', v_sub_prag,
      'prorata', round(v_prorata, 4), 'sugestie', v_zile_sug),
    'pondere_totala_configurata', round(v_pond_total, 2),
    'pondere_luna', round(v_pond_luna, 2),
    'pondere_evaluata', round(v_pond_eval, 2),
    'factor_redistribuire', round(v_factor, 4),
    'bonus_brut', round(v_brut_pond + v_brut_fix, 2),
    'bonus_titular', v_bonus,
    'cota_manager', v_g.cota_manager,
    -- Fondul din care se plătește bonusul titularului; diferența e partea
    -- managerului. Apare DOAR în varianta internă și în cea de salarizare.
    'fond_total', case when v_bonus = 0 then 0
                       else round(v_bonus / (1 - v_g.cota_manager), 2) end,
    'plafon_ponderat', round(v_plafon_pond, 2),
    'blocante', to_jsonb(v_blocante),
    'avertismente', to_jsonb(v_avertismente),
    'stare_raport', coalesce(v_raport.stare, 'nedeschis'),
    'raport_id', v_raport.id
  );
end;
$$;

revoke execute on function calculeaza_raport_kpi(uuid, int, int) from anon, public;
grant execute on function calculeaza_raport_kpi(uuid, int, int) to authenticated;

-- ── 8. Deschiderea lunii ────────────────────────────────────────────────────
-- Draftul există ca să aibă unde sta câmpurile manuale; calculul nu are nevoie
-- de el. Idempotent: a doua apelare întoarce același rând.

create or replace function deschide_raport_kpi(
  p_grila uuid,
  p_anul  int,
  p_luna  int
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_g  kpi_grile;
  v_id uuid;
begin
  if auth_role() not in ('owner','admin','manager') then
    raise exception 'Doar managerii pot deschide raportul KPI' using errcode = '42501';
  end if;

  select * into v_g from kpi_grile where id = p_grila;
  if not found then
    raise exception 'Grila nu există' using errcode = 'P0002';
  end if;

  select id into v_id from raport_kpi_lunar
   where grila_id = p_grila and anul = p_anul and luna = p_luna;
  if v_id is not null then
    return v_id;
  end if;

  insert into raport_kpi_lunar (grila_id, anul, luna, titular_nume, creat_de)
  values (p_grila, p_anul, p_luna, v_g.titular_nume, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function deschide_raport_kpi(uuid, int, int) from anon, public;
grant execute on function deschide_raport_kpi(uuid, int, int) to authenticated;

-- ── 9. Închiderea: îngheață tot ce trebuie ca raportul să se explice singur ──
-- Eșuează ZGOMOTOS pe orice lipsă. O lună închisă cu „lipsea suma, deci zero"
-- e cea mai proastă variantă: omul primește zero fără să afle de ce, iar
-- greșeala se descoperă la salariu.

create or replace function inchide_raport_kpi(p_raport uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r        raport_kpi_lunar;
  v_rez      jsonb;
  v_config   jsonb;
  v_blocante text[];
begin
  if auth_role() not in ('owner','admin','manager') then
    raise exception 'Doar managerii pot închide luna' using errcode = '42501';
  end if;

  select * into v_r from raport_kpi_lunar where id = p_raport;
  if not found then
    raise exception 'Raportul nu există' using errcode = 'P0002';
  end if;
  if v_r.stare = 'inchis' then
    raise exception 'Luna e deja închisă' using errcode = '22023';
  end if;
  if v_r.grila_id is null then
    raise exception 'Raportul nu mai are grilă atașată' using errcode = '22023';
  end if;

  v_rez := calculeaza_raport_kpi(v_r.grila_id, v_r.anul, v_r.luna);

  select array_agg(value::text) into v_blocante
  from jsonb_array_elements_text(v_rez -> 'blocante');

  if array_length(v_blocante, 1) > 0 then
    raise exception 'Luna nu poate fi închisă: %', array_to_string(v_blocante, ' ')
      using errcode = '22023';
  end if;

  -- Snapshotul: antetul grilei, liniile, definițiile ȘI etichetele câmpurilor
  -- manuale. Renderer-ul unei luni închise citește de aici, nu din catalogul
  -- viu — altfel redenumirea unui indicator ar rescrie istoria.
  select jsonb_build_object(
    'grila', to_jsonb(g) - 'titular_user' - 'titular_teacher' - 'titular_key',
    'locatii', (select jsonb_agg(lo.nume order by lo.nume)
                  from kpi_grila_locatii gl join locatii lo on lo.id = gl.locatie
                 where gl.grila_id = g.id),
    'linii', (select jsonb_agg(to_jsonb(l) || jsonb_build_object(
                       'definitie', to_jsonb(d),
                       'campuri', coalesce((select jsonb_agg(to_jsonb(c) order by c.ordine)
                                              from kpi_campuri c where c.kpi_id = d.id), '[]'::jsonb))
                     order by l.ordine)
                from kpi_grila_linii l
                join kpi_definitii d on d.id = l.kpi_id
               where l.grila_id = g.id),
    'inghetat_la', now()
  ) into v_config
  from kpi_grile g where g.id = v_r.grila_id;

  update raport_kpi_lunar
     set stare = 'inchis',
         kpi = v_rez,
         config_aplicata = v_config,
         bonus_titular = (v_rez ->> 'bonus_titular')::numeric,
         fond_total    = (v_rez ->> 'fond_total')::numeric,
         cota_manager  = (v_rez ->> 'cota_manager')::numeric,
         pondere_totala_configurata = (v_rez ->> 'pondere_totala_configurata')::numeric,
         titular_nume  = coalesce(v_rez #>> '{grila,titular_nume}', titular_nume),
         inchis_de = auth.uid(),
         inchis_la = now(),
         updated   = now()
   where id = p_raport;

  insert into audit_log (actor_id, actor_role, entity_type, entity_id, action, new_value)
  values (auth.uid(), auth_role(), 'raport_kpi', p_raport, 'update',
          jsonb_build_object('stare', 'inchis', 'luna', format('%s/%s', v_r.luna, v_r.anul),
                             'bonus', (v_rez ->> 'bonus_titular')::numeric));

  return v_rez;
end;
$$;

revoke execute on function inchide_raport_kpi(uuid) from anon, public;
grant execute on function inchide_raport_kpi(uuid) to authenticated;

-- Redeschiderea e OWNER-ONLY: e singura operație care poate schimba un salariu
-- deja comunicat. Valorile înghețate se șterg — un snapshot rămas pe ecran după
-- redeschidere ar fi citit ca definitiv.
create or replace function redeschide_raport_kpi(p_raport uuid, p_motiv text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_r raport_kpi_lunar;
begin
  if not is_owner() then
    raise exception 'Doar owner-ul poate redeschide o lună închisă' using errcode = '42501';
  end if;

  select * into v_r from raport_kpi_lunar where id = p_raport;
  if not found then
    raise exception 'Raportul nu există' using errcode = 'P0002';
  end if;
  if v_r.stare <> 'inchis' then
    raise exception 'Luna nu e închisă' using errcode = '22023';
  end if;

  insert into audit_log (actor_id, actor_role, entity_type, entity_id, action, old_value, new_value, reason)
  values (auth.uid(), auth_role(), 'raport_kpi', p_raport, 'update',
          jsonb_build_object('stare', 'inchis', 'bonus', v_r.bonus_titular,
                             'kpi', v_r.kpi, 'config_aplicata', v_r.config_aplicata),
          jsonb_build_object('stare', 'draft'), p_motiv);

  update raport_kpi_lunar
     set stare = 'draft', kpi = null, config_aplicata = null,
         bonus_titular = null, fond_total = null, cota_manager = null,
         pondere_totala_configurata = null,
         inchis_de = null, inchis_la = null, updated = now()
   where id = p_raport;
end;
$$;

revoke execute on function redeschide_raport_kpi(uuid, text) from anon, public;
grant execute on function redeschide_raport_kpi(uuid, text) to authenticated;

-- ── 10. Lista lunii ─────────────────────────────────────────────────────────
-- Toate grilele care acoperă luna + starea raportului lor. Ciornele apar și ele:
-- „Petruța n-are grilă activă" e exact informația de care ai nevoie în ziua 5.

create or replace function get_rapoarte_kpi(p_anul int, p_luna int)
returns table (
  grila_id      uuid,
  titular_nume  text,
  post          text,
  perioada      text,
  locatii       text,
  grila_stare   text,
  raport_id     uuid,
  raport_stare  text,
  bonus_titular numeric,
  fond_total    numeric,
  inchis_la     timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select g.id, g.titular_nume, g.post, g.perioada,
         (select string_agg(lo.nume, ', ' order by lo.nume)
            from kpi_grila_locatii gl join locatii lo on lo.id = gl.locatie
           where gl.grila_id = g.id),
         g.stare,
         r.id, coalesce(r.stare, 'nedeschis'), r.bonus_titular, r.fond_total, r.inchis_la
  from kpi_grile g
  left join raport_kpi_lunar r
         on r.grila_id = g.id and r.anul = p_anul and r.luna = p_luna
  where g.valabil_de_la <= (make_date(p_anul, p_luna, 1) + interval '1 month - 1 day')::date
    and (g.valabil_pana_la is null or g.valabil_pana_la >= make_date(p_anul, p_luna, 1))
  order by g.stare, g.titular_nume;
$$;

revoke execute on function get_rapoarte_kpi(int, int) from anon, public;
grant execute on function get_rapoarte_kpi(int, int) to authenticated;

-- ── 11. Gardul de la activare ───────────────────────────────────────────────
-- Adaugă verificarea că fiecare indicator automat din grilă are ramură în
-- dispecer. Fără ea, greșeala se descoperă la închidere, adică în ziua în care
-- se plătesc bani. (Cazul concret azi: `conversie_lead` — K5 — așteaptă
-- `leads.locatie_id` din etapa 5.)

create or replace function kpi_grila_activeaza(p_grila uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grila    kpi_grile;
  v_pondere  numeric;
  v_probleme text[] := '{}';
  v_linie    record;
begin
  if not is_admin() then
    raise exception 'Doar owner/admin pot activa grile KPI' using errcode = '42501';
  end if;

  select * into v_grila from kpi_grile where id = p_grila;
  if not found then
    raise exception 'Grila nu există' using errcode = 'P0002';
  end if;

  if not exists (select 1 from kpi_grila_locatii where grila_id = p_grila) then
    v_probleme := v_probleme || 'Grila nu are niciun punct de lucru.';
  end if;

  select coalesce(sum(pondere), 0) into v_pondere
  from kpi_grila_linii where grila_id = p_grila and activ and not eliminatoriu;

  if abs(v_pondere - 100) > 0.01 then
    v_probleme := v_probleme
      || format('Suma ponderilor e %s%%, nu 100%%.', round(v_pondere, 2));
  end if;

  for v_linie in
    select l.*, d.denumire, d.cheie, d.sursa
    from kpi_grila_linii l
    join kpi_definitii d on d.id = l.kpi_id
    where l.grila_id = p_grila and l.activ
  loop
    if v_linie.sursa = 'auto' and not kpi_auto_implementat(v_linie.cheie) then
      v_probleme := v_probleme
        || format('„%s”: indicatorul automat nu e implementat încă. Dezactivează linia '
                  || 'și redistribuie ponderea până atunci.', v_linie.denumire);
    end if;

    continue when v_linie.eliminatoriu or v_linie.pondere <= 0;

    if v_linie.mod_calcul = 'comision' then
      if v_linie.comision_procent_standard is null or v_linie.comision_plafon is null then
        v_probleme := v_probleme
          || format('„%s": comisionul nu are procent sau plafon.', v_linie.denumire);
      end if;
    elsif v_linie.suma_standard is null or v_linie.suma_peste is null then
      v_probleme := v_probleme
        || format('„%s": lipsesc sumele în lei.', v_linie.denumire);
    end if;

    if v_linie.tip_prag <> 'afirmativ' and v_linie.prag_standard is null then
      v_probleme := v_probleme
        || format('„%s": lipsește pragul de standard.', v_linie.denumire);
    end if;
  end loop;

  if array_length(v_probleme, 1) > 0 then
    return jsonb_build_object('activata', false, 'probleme', to_jsonb(v_probleme));
  end if;

  update kpi_grile set stare = 'activa', updated = now() where id = p_grila;

  insert into audit_log (actor_id, actor_role, entity_type, entity_id, action, new_value)
  values (auth.uid(), auth_role(), 'kpi_grila', p_grila, 'update',
          jsonb_build_object('stare', 'activa'));

  return jsonb_build_object('activata', true, 'pondere_totala', v_pondere);
end;
$$;

revoke execute on function kpi_grila_activeaza(uuid) from anon, public;
grant execute on function kpi_grila_activeaza(uuid) to authenticated;
