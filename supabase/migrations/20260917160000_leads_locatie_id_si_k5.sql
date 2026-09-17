-- Etapa 5 a motorului de grile KPI: punctul de lucru al unui lead devine FK,
-- iar K5 („conversie lead → client plătitor") capătă implementare.
--
-- Problema: `leads.locatia` e TEXT LIBER cu eticheta scurtă („Ștefan cel Mare"),
-- în timp ce restul aplicației lucrează cu `locatii.id`. Consecința s-a văzut pe
-- 17 sept. 2026, când pâlnia de leaduri arăta 0 în loc de 209 pentru cea mai
-- mare locație, pentru că selectorul trimitea `locatii.nume` („Galeriile Stefan
-- cel Mare"). Migrația `20260917140000` a reparat potrivirea în rapoarte; aici
-- rezolvăm cauza — un FK adevărat.
--
-- TEXTUL RĂMÂNE. Nu-l ștergem și nu-l rescriem: e eticheta scurtă pe care o văd
-- oamenii în fișa leadului, filtrele existente fac egalitate strictă pe ea, iar
-- canalele de intake (Meta, site, Sheets) o scriu. FK-ul e DERIVAT din el.
--
-- DERIVAREA SE FACE ÎN TRIGGER, nu în formulare. `leads.locatia` e scris din
-- cinci locuri: formularul din LeadModal, importul CSV și trei edge functions
-- de intake, fiecare cu deploy propriu. O regulă repetată în cinci locuri e o
-- regulă care se va rupe într-unul din ele fără să anunțe pe nimeni — iar aici
-- consecința e un lead neatribuit, adică un bonus calculat greșit.

-- ── 1. Coloana ──────────────────────────────────────────────────────────────

alter table leads add column if not exists locatie_id uuid references locatii(id) on delete set null;

create index if not exists leads_locatie_id_idx on leads (locatie_id, created desc);

comment on column leads.locatie_id is
  'Punctul de lucru al leadului, derivat automat din `locatia` (text) sau din programarea lui. Vezi trigger-ele din 20260917160000.';

-- ── 2. Derivarea din eticheta text ──────────────────────────────────────────
-- `locatie_label_match` (20260917140000) face potrivirea cu normalizare de
-- diacritice și substring bidirecțional: „galeriile stefan cel mare" ⊃
-- „stefan cel mare". Cele trei locații au nume disjuncte, deci fără fals-pozitive.
--
-- Un `locatie_id` pus EXPLICIT de apelant câștigă: derivarea umple doar golul.
-- Invers nu facem — nu scriem înapoi în `locatia` numele lung al locației,
-- fiindcă filtrele existente din /leads fac egalitate strictă pe eticheta scurtă
-- și s-ar rupe tăcut.

create or replace function trg_leads_deriva_locatie_id() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.locatia is distinct from old.locatia then
    if new.locatia is not null and btrim(new.locatia) <> ''
       and (tg_op = 'INSERT' or new.locatie_id is not distinct from old.locatie_id)
    then
      new.locatie_id := (
        select lo.id from locatii lo
        where locatie_label_match(new.locatia, lo.nume)
        order by lo.nume
        limit 1
      );
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function trg_leads_deriva_locatie_id() from anon, public;

drop trigger if exists trg_deriva_locatie_id on leads;
create trigger trg_deriva_locatie_id before insert or update of locatia, locatie_id on leads
  for each row execute function trg_leads_deriva_locatie_id();

-- ── 3. Derivarea din programare ─────────────────────────────────────────────
-- `programari_leads.locatie` e deja uuid. Un lead care n-avea etichetă, dar a
-- fost programat la o probă, ARE punct de lucru — iar ăsta e chiar momentul în
-- care recepția a lucrat cu el. Completăm doar golul: o etichetă explicită nu
-- se suprascrie de o programare ulterioară.

create or replace function trg_programare_completeaza_locatie_lead() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.locatie is not null and new.lead is not null then
    update leads set locatie_id = new.locatie
     where id = new.lead and locatie_id is null;
  end if;
  return null;
end;
$$;

revoke execute on function trg_programare_completeaza_locatie_lead() from anon, public;

drop trigger if exists trg_completeaza_locatie_lead on programari_leads;
create trigger trg_completeaza_locatie_lead after insert or update of locatie, lead on programari_leads
  for each row execute function trg_programare_completeaza_locatie_lead();

-- ── 4. Backfill ─────────────────────────────────────────────────────────────
-- Planul prevedea trei surse; pe date reale una e moartă și una e mai bună
-- decât se credea:
--   • `leads.curs_interes` → GOL în toate cele 6.604 rânduri. Sursa nu există.
--   • `programari_leads.locatie` (uuid direct) e mai bună decât ocolul prin
--     `cursul_programat → cursuri.locatie`; ăsta rămâne ca plasă pentru
--     programările fără locație.
--   • eticheta text, cu normalizare.
-- Verificat înainte de scriere: pe cele 444 de leaduri unde există și etichetă,
-- și programare, cele două surse coincid în 100% din cazuri. Deci ordinea
-- paşilor nu poate produce atribuiri diferite.

-- 4a. din eticheta text
update leads l set locatie_id = lo.id
from locatii lo
where l.locatie_id is null
  and l.locatia is not null and btrim(l.locatia) <> ''
  and locatie_label_match(l.locatia, lo.nume);

-- 4b. din locația programării (cea mai recentă)
update leads l set locatie_id = p.locatie
from (
  select distinct on (pl.lead) pl.lead, pl.locatie
  from programari_leads pl
  where pl.locatie is not null
  order by pl.lead, pl.data_programarii desc nulls last, pl.created desc
) p
where l.id = p.lead and l.locatie_id is null;

-- 4c. plasa: programări fără locație, dar cu un curs programat
update leads l set locatie_id = p.loc
from (
  select distinct on (pl.lead) pl.lead, coalesce(c.locatie, s.locatie) as loc
  from programari_leads pl
  join cursuri c on c.id = pl.cursul_programat
  left join sali s on s.id = c.sala
  where pl.locatie is null and coalesce(c.locatie, s.locatie) is not null
  order by pl.lead, pl.data_programarii desc nulls last, pl.created desc
) p
where l.id = p.lead and l.locatie_id is null;

-- ── 5. K5 · Conversie lead → client plătitor ────────────────────────────────
-- Cohorta lunii M−`decalaj` (implicit M−1), pe punctele de lucru ale grilei.
-- Decalajul există fiindcă un lead din luna curentă n-a avut încă fereastra de
-- 30 de zile în care să plătească: fără el, indicatorul ar măsura jumătate de
-- muncă și ar penaliza exact leadurile de la finalul lunii.
--
-- Convertit = are client atașat ȘI o încasare în fereastra de la crearea lui.
-- Fereastra curge de la crearea LEADULUI, nu de la finalul lunii: altfel un lead
-- din ziua 1 ar avea 60 de zile, iar unul din ziua 30 ar avea 30.
--
-- `deja_client` SE EXCLUDE din cohortă: un părinte care mai are un copil înscris
-- nu e o conversie de vânzare, iar plata lui ar exista oricum. Se raportează
-- separat, ca să se vadă că a fost scos.
--
-- LUNA SE TAIE PE FUSUL LOCAL. `created` e timestamptz, iar baza rulează pe UTC:
-- un lead intrat pe 1 septembrie la 00:30 ora României e 31 august în UTC și ar
-- cădea în cohorta greșită.

create or replace function kpi_k5(
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
    select least(greatest(coalesce((p_parametri ->> 'fereastra_zile')::int, 30), 1), 180) as fereastra,
           least(greatest(coalesce((p_parametri ->> 'decalaj_luni')::int, 1), 0), 3) as decalaj
  ),
  cohorta_luna as (
    select (make_date(p_anul, p_luna, 1)
            - make_interval(months => (select decalaj from param)))::date as prima_zi
  ),
  toti as (
    select l.id, l.id_client, l.locatie_id, l.deja_client,
           (l.created at time zone 'Europe/Bucharest')::date as zi_creare
    from leads l, cohorta_luna cl
    where (l.created at time zone 'Europe/Bucharest')::date >= cl.prima_zi
      and (l.created at time zone 'Europe/Bucharest')::date < (cl.prima_zi + interval '1 month')::date
      and l.status <> 'nurture'
  ),
  cohorta as (
    select * from toti
    where locatie_id = any(p_locatii)
      and coalesce(deja_client, false) = false
  ),
  verdict as (
    select c.id,
           c.id_client is not null and exists (
             select 1 from incasari i, param p
             where i.client = c.id_client
               and i.suma > 0
               and i.data >= c.zi_creare
               and i.data <= c.zi_creare + p.fereastra
           ) as convertit
    from cohorta c
  )
  select jsonb_build_object(
    'kpi', 'conversie_lead',
    'numitor',   (select count(*) from cohorta),
    'numarator', (select count(*) from verdict where convertit),
    'valoare', case when (select count(*) from cohorta) = 0 then null
                    else round((select count(*) from verdict where convertit)::numeric
                               / (select count(*) from cohorta) * 100, 1) end,
    'luna_cohortei',  to_char((select prima_zi from cohorta_luna), 'YYYY-MM'),
    'fereastra_zile', (select fereastra from param),
    'decalaj_luni',   (select decalaj from param),
    -- Cât din cohorta lunii n-a putut fi atribuită niciunui punct de lucru.
    -- Fără cifra asta, un indicator mic ar putea însemna ori muncă slabă, ori
    -- leaduri neatribuite — două lucruri complet diferite.
    'fara_locatie',   (select count(*) from toti where locatie_id is null),
    'deja_clienti',   (select count(*) from toti
                        where locatie_id = any(p_locatii) and coalesce(deja_client, false))
  );
$$;

revoke execute on function kpi_k5(uuid[], int, int, jsonb) from anon, public;
grant execute on function kpi_k5(uuid[], int, int, jsonb) to authenticated;

-- ── 6. Dispecerul, extras din motor ─────────────────────────────────────────
-- Etapa 4 avea lanțul IF/ELSIF înăuntrul lui `calculeaza_raport_kpi`, ceea ce
-- însemna că orice indicator nou cerea recrearea unei funcții de 200 de linii.
-- Îl scoatem afară: de acum un KPI nou = o funcție proprie + o intrare în
-- catalog + DOUĂ rânduri aici.
--
-- Rămâne CASE STATIC pe cheie, niciodată `execute` dinamic: cheia vine dintr-un
-- rând editabil din UI, iar funcția e `security definer` peste tabela care
-- produce salarii.

create or replace function kpi_dispecer(
  p_cheie     text,
  p_locatii   uuid[],
  p_anul      int,
  p_luna      int,
  p_parametri jsonb,
  p_manual    jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if    p_cheie = 'incasare_la_termen'  then return kpi_k1(p_locatii, p_anul, p_luna, p_parametri);
  elsif p_cheie = 'restante_recuperate' then return kpi_k2(p_locatii, p_anul, p_luna, p_parametri);
  elsif p_cheie = 'reactivare_21z'      then return kpi_k3(p_locatii, p_anul, p_luna, p_parametri);
  elsif p_cheie = 'raspuns_24h'         then return kpi_k4(p_manual, p_parametri);
  elsif p_cheie = 'conversie_lead'      then return kpi_k5(p_locatii, p_anul, p_luna, p_parametri);
  elsif p_cheie = 'diferente_casa'      then return kpi_diferente_casa(p_locatii, p_anul, p_luna);
  end if;
  -- Eșec zgomotos, niciodată scor 0 în tăcere. Gardul de la activarea grilei ar
  -- fi trebuit să prindă asta cu luni înainte.
  raise exception 'KPI auto fără implementare: %', p_cheie using errcode = '22023';
end;
$$;

revoke execute on function kpi_dispecer(text, uuid[], int, int, jsonb, jsonb) from anon, public;
grant execute on function kpi_dispecer(text, uuid[], int, int, jsonb, jsonb) to authenticated;

-- Lista trebuie să rămână sincronă cu dispecerul de mai sus.
create or replace function kpi_auto_implementat(p_cheie text)
returns boolean
language sql
immutable
as $$
  select p_cheie in ('incasare_la_termen','restante_recuperate','reactivare_21z',
                     'raspuns_24h','conversie_lead','diferente_casa');
$$;

revoke execute on function kpi_auto_implementat(text) from anon, public;
grant execute on function kpi_auto_implementat(text) to authenticated;


-- ── 7. Motorul, recreat ca să cheme dispecerul ──────────────────────────────
-- Identic cu 20260917120000, cu o singură schimbare: lanțul IF/ELSIF a ieșit în
-- `kpi_dispecer`. Restul (redistribuirea cu plafon, pro-rata, eliminatoriile,
-- blocantele) rămâne cuvânt cu cuvânt.

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
      -- Dispecerul e funcție separată din etapa 5 încoace: un indicator nou nu
      -- mai cere recrearea motorului.
      v_rez := kpi_dispecer(v_l.cheie, v_locatii, p_anul, p_luna, v_l.parametri, v_man_kpi);

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
