-- Recepția pe motorul de KPI: K2 = rata de încasare a managerului, K4 „doar rata",
-- suport generic pentru valori provizorii, șablonul „Recepție 2026-2027", grilele
-- Petruței și ale lui Theo și salariul complet al recepției.
-- Reguli: docs/grila-front-desk.md + deciziile lui Alex din 25 sept. 2026.

-- ── 1. K2 nou: rata de încasare M+1, aceeași funcție ca la manager ─────────────
insert into public.kpi_definitii
  (cheie, denumire, descriere, sursa, tip_valoare, directie, unitate, posturi_sugerate, parametri_schema, ordine)
values
  ('rata_incasare_m1',
   'Rata de încasare (verificată la finalul lunii următoare)',
   'Cât din ratele lunii s-a încasat până la finalul lunii următoare, pe locație. Aceeași cifră ca la bonusul managerului; se definitivează după finalul lunii M+1.',
   'auto', 'procent', 'mai_mare_e_bine', '%', '{front_desk,manager}', '[]'::jsonb, 21);

-- CASE STATIC pe cheie, ca înainte (20260917160000 §6).
create or replace function public.kpi_dispecer(
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
  elsif p_cheie = 'rata_incasare_m1'    then return kpi_rata_incasare(p_locatii, p_anul, p_luna, p_parametri);
  elsif p_cheie = 'reactivare_21z'      then return kpi_k3(p_locatii, p_anul, p_luna, p_parametri);
  elsif p_cheie = 'raspuns_24h'         then return kpi_k4(p_manual, p_parametri);
  elsif p_cheie = 'conversie_lead'      then return kpi_k5(p_locatii, p_anul, p_luna, p_parametri);
  elsif p_cheie = 'diferente_casa'      then return kpi_diferente_casa(p_locatii, p_anul, p_luna);
  end if;
  raise exception 'KPI auto fără implementare: %', p_cheie using errcode = '22023';
end;
$$;

-- Lista trebuie să rămână sincronă cu dispecerul de mai sus.
create or replace function public.kpi_auto_implementat(p_cheie text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_cheie in ('incasare_la_termen','restante_recuperate','rata_incasare_m1','reactivare_21z',
                     'raspuns_24h','conversie_lead','diferente_casa');
$$;

-- ── 2. K4 „doar rata" ──────────────────────────────────────────────────────────
-- Grila recepției măsoară doar rata de răspuns (85–95 standard, peste 95 peste).
-- Cu `rata_peste` setat, contează doar rata; fără el, logica veche (apeluri
-- pierdute, timp mediu, sondaj) rămâne neatinsă pentru șablonul MOA.
create or replace function public.kpi_k4(p_manual jsonb, p_parametri jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_rata      numeric := nullif(p_manual ->> 'rata_meta', '')::numeric;
  v_timp      numeric := nullif(p_manual ->> 'timp_mediu', '')::numeric;
  v_pierdute  numeric := nullif(p_manual ->> 'apeluri_pierdute', '')::numeric;
  v_sondaj    boolean := nullif(p_manual ->> 'sondaj_real', '')::boolean;
  v_sub       numeric := coalesce((p_parametri ->> 'rata_sub')::numeric, 90);
  v_std       numeric := coalesce((p_parametri ->> 'rata_standard')::numeric, 95);
  v_ore       numeric := coalesce((p_parametri ->> 'timp_peste_ore')::numeric, 4);
  v_peste     numeric := (p_parametri ->> 'rata_peste')::numeric;
  v_banda     text;
begin
  if v_peste is not null then
    if v_rata is null then
      return jsonb_build_object(
        'kpi', 'raspuns_24h', 'valoare', null, 'banda', 'na',
        'motiv', 'necompletat',
        'motiv_text', 'Rata de răspuns nu e completată.');
    end if;
    v_banda := case when v_rata >= v_peste then 'peste'
                    when v_rata >= v_std then 'standard'
                    else 'sub' end;
    return jsonb_build_object(
      'kpi', 'raspuns_24h', 'valoare', v_rata, 'banda', v_banda, 'mod', 'doar_rata',
      'praguri', jsonb_build_object('standard', v_std, 'peste', v_peste));
  end if;

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

-- Fără `default`: altfel triggerul de validare l-ar completa pe fiecare linie și
-- ar trece tăcut șablonul MOA pe „doar rata". min 50 ca un câmp golit în UI
-- (care scrie 0) să fie respins, nu citit ca „toată lumea e peste standard".
update public.kpi_definitii
   set parametri_schema = parametri_schema || jsonb_build_array(jsonb_build_object(
         'cheie', 'rata_peste', 'eticheta', 'De la acest procent = peste standard (doar rata)',
         'tip', 'numar', 'min', 50, 'max', 100, 'unitate', '%'))
 where cheie = 'raspuns_24h'
   and not exists (select 1 from jsonb_array_elements(parametri_schema) d where d ->> 'cheie' = 'rata_peste');

-- ── 3. Motorul: valori provizorii ──────────────────────────────────────────────
-- Identic cu 20260917160000 §7, plus: steagul `provizoriu` al unui indicator
-- blochează închiderea lunii până se definitivează, iar suma lui (dacă e linie
-- forfetară) se întoarce separat, în `bonus_provizoriu`.
CREATE OR REPLACE FUNCTION public.calculeaza_raport_kpi(p_grila uuid, p_anul integer, p_luna integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_prov         boolean;
  v_prov_any     boolean := false;
  v_prov_pond    boolean := false;
  v_brut_prov    numeric := 0;
  v_blocante_prov text[] := '{}';
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
    v_procent := null; v_prov := false;
    v_man_kpi := coalesce(v_manual -> v_l.cheie, '{}'::jsonb);
    v_aplicabil := v_l.luni_active is null or p_luna = any(v_l.luni_active);

    -- ── valoarea brută ──
    if v_l.sursa = 'auto' then
      -- Dispecerul e funcție separată din etapa 5 încoace: un indicator nou nu
      -- mai cere recrearea motorului.
      v_rez := kpi_dispecer(v_l.cheie, v_locatii, p_anul, p_luna, v_l.parametri, v_man_kpi);
      -- Indicatorul care se definitivează după finalul lunii (ex. rata de încasare
      -- verificată la M+1) o spune singur; luna nu se închide până atunci.
      v_prov := coalesce((v_rez ->> 'provizoriu')::boolean, false);

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

    -- Suma provizorie se ține separat: salariul confirmă restul bonusului la
    -- finalul lunii și linia provizorie abia după ce se definitivează. Separarea
    -- e curată doar pentru liniile forfetare (pondere 0), care nu intră în
    -- redistribuire; o linie provizorie cu pondere ține tot bonusul provizoriu.
    if v_aplicabil and v_prov then
      v_prov_any := true;
      v_blocante_prov := v_blocante_prov || format(
        '„%s”: valoare provizorie până la %s — luna se poate închide după.',
        v_l.denumire, v_rez ->> 'final_la');
      if coalesce(v_l.pondere, 0) > 0 then
        v_prov_pond := true;
      else
        v_brut_prov := v_brut_prov + coalesce(v_suma, 0);
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
      'provizoriu', v_prov,
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

  v_blocante := v_blocante || v_blocante_prov;

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
    'blocante_provizorii', to_jsonb(v_blocante_prov),
    'provizoriu', v_prov_any,
    'provizoriu_in_pondere', v_prov_pond,
    'bonus_provizoriu', case when v_elim_picat or v_sub_prag then 0
                             else round(v_brut_prov * v_prorata, 2) end,
    'avertismente', to_jsonb(v_avertismente),
    'stare_raport', coalesce(v_raport.stare, 'nedeschis'),
    'raport_id', v_raport.id
  );
end;
$function$
;

-- ── 4. Șablonul „Recepție 2026-2027" ───────────────────────────────────────────
-- Sumele pe trepte sunt cele din grilă (sub = 0). Pragurile „peste X%" devin
-- X,01: motorul compară cu ≥, iar procentele au 2 zecimale.
-- K2 are pondere 0 (linie forfetară, în afara redistribuirii): e singurul care se
-- definitivează abia după luna următoare, iar așa restul bonusului se poate
-- confirma la finalul lunii fără el. Ponderile celorlalți — proporționale cu
-- maximul lor (240/280/140/140) — contează doar când unul nu se poate măsura.
-- Fără eliminatorii; bonusul se calculează în cele 10 luni de sezon.
do $$
declare
  v_sablon uuid;
  v_luni   int[] := '{9,10,11,12,1,2,3,4,5,6}';
begin
  insert into kpi_sabloane (nume, post, perioada, cota_manager, zile_min_evaluare, stare, nota)
  values ('Recepție 2026-2027', 'front_desk', 'sezon', 0, 15, 'activ',
          'Grila recepției (docs/grila-front-desk.md), Alex 23–25 sept. 2026. K2 = rata de încasare a managerului.')
  returning id into v_sablon;

  insert into kpi_sablon_linii (
    sablon_id, kpi_id, pondere, tip_prag, prag_standard, prag_peste,
    conditie_sub, conditie_standard, conditie_peste, suma_standard, suma_peste,
    mod_calcul, luni_active, eliminatoriu, are_poarta, parametri, activ, ordine)
  select v_sablon, d.id, x.pondere, 'procent', x.std, x.peste,
         x.c_sub, x.c_std, x.c_peste, x.lei_std, x.lei_peste,
         'fix', v_luni, false, false, x.par, true, x.ordine
  from (values
    ('incasare_la_termen', 30::numeric, 70::numeric, 76.01::numeric, 100::numeric, 240::numeric,
     'Lasă luna să curgă',
     'Reacție — îi urmărește după ce depășesc scadența',
     'Prevenție — îi anunță înainte de ziua 15',
     '{"zi_termen": 20}'::jsonb, 10),
    ('rata_incasare_m1', 0, 92, 95.01, 90, 300,
     'Ratele lunii rămân neîncasate',
     'Recuperare — urmărește ratele restante până la finalul lunii următoare',
     'Aproape nicio rată a lunii nu rămâne neîncasată',
     '{}'::jsonb, 20),
    ('reactivare_21z', 35, 32, 39.01, 120, 280,
     'Nu-i aduce înapoi',
     'Contact — îi aduce pe cei care oricum voiau să revină',
     'Rezolvare — află de ce nu mai vine și schimbă grupa, ziua sau instructorul',
     '{}'::jsonb, 30),
    ('raspuns_24h', 17.5, 85, 95.01, 60, 140,
     'Mesaje fără răspuns',
     'Acoperire — nimeni fără răspuns',
     'Viteză — răspuns în aceeași parte de zi',
     '{"rata_standard": 85, "rata_peste": 95.01}'::jsonb, 40),
    ('conversie_lead', 17.5, 28, 36.01, 60, 140,
     'Leadurile se pierd pe drum',
     'Preia cererea — leadurile calde (telefon, website, recomandări)',
     'Creează cererea — și leadurile reci (Meta Ads, evenimente)',
     '{}'::jsonb, 50)
  ) as x(cheie, pondere, std, peste, lei_std, lei_peste, c_sub, c_std, c_peste, par, ordine)
  join kpi_definitii d on d.cheie = x.cheie;

  if (select count(*) from kpi_sablon_linii where sablon_id = v_sablon) <> 5 then
    raise exception 'Șablonul recepției: lipsesc linii';
  end if;
end $$;

-- ── 5. Grilele: Petruța → Ștefan cel Mare, Theo → Nicolina, din 1 sept. 2026 ────
-- Prin kpi_atribuie_grila + kpi_grila_activeaza, ca să treacă prin aceleași
-- verificări ca din UI. Funcțiile cer owner/admin, deci rolul se setează local,
-- doar în tranzacția migrației.
do $$
declare
  v_sablon uuid := (select id from kpi_sabloane where nume = 'Recepție 2026-2027' and post = 'front_desk');
  v_p      record;
  v_grila  uuid;
  v_rez    jsonb;
begin
  perform set_config('request.jwt.claims', '{"app_metadata": {"role": "owner"}}', true);

  for v_p in
    select r.user_id, r.titular_nume, l.id as locatie
    from salarizare_receptie r
    join locatii l on l.nume = case r.titular_nume when 'Petruța' then 'Galeriile Stefan cel Mare'
                                                   when 'Theo Todica' then 'Nicolina' end
  loop
    v_grila := kpi_atribuie_grila(v_sablon, 'user', v_p.user_id, array[v_p.locatie], '2026-09-01');
    update kpi_grile set titular_nume = v_p.titular_nume where id = v_grila;
    v_rez := kpi_grila_activeaza(v_grila);
    if not coalesce((v_rez ->> 'activata')::boolean, false) then
      raise exception 'Grila lui % nu s-a activat: %', v_p.titular_nume, v_rez -> 'probleme';
    end if;
  end loop;

  if (select count(*) from kpi_grile where sablon_sursa = v_sablon and stare = 'activa') <> 2 then
    raise exception 'Grilele recepției: trebuiau 2 active';
  end if;

  perform set_config('request.jwt.claims', '', true);
end $$;

-- ── 6. Salariul complet al recepției ───────────────────────────────────────────
-- fix × normă + facturare + fidelitate + bonusul grilei KPI × normă (grila §2).
-- Bonusul: cel înghețat dacă raportul lunii e închis, altfel cel live. Se împarte
-- în partea definitivă (la finalul lunii) și K2 (după finalul lunii următoare).
-- Doar admin: motorul KPI cere oricum rol de staff, deci service_role nu merge aici.
create or replace function public.calculeaza_salariu_receptie(p_user uuid, p_anul int, p_luna int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_m         date := make_date(p_anul, p_luna, 1);
  v_m1        date := (make_date(p_anul, p_luna, 1) + interval '1 month')::date;
  v_azi       date := (now() at time zone 'Europe/Bucharest')::date;
  v_par       jsonb;
  v_vara      boolean;
  v_cfg       salarizare_receptie;
  v_grila     kpi_grile;
  v_raport    raport_kpi_lunar;
  v_kpi       jsonb;
  v_sursa     text;
  v_bonus     numeric := 0;
  v_bonus_k2  numeric := 0;
  v_bl_def    jsonb := '[]'::jsonb;
  v_prov_k2   boolean := false;
  v_final_k2  text;
  v_fix       numeric;
  v_fact      numeric;
  v_fid       numeric;
  v_comp      jsonb := '[]'::jsonb;
  v_blocante  jsonb := '[]'::jsonb;
  v_avert     jsonb := '[]'::jsonb;
  v_total     numeric;
begin
  if not is_admin() then
    raise exception 'Acces refuzat.' using errcode = '42501';
  end if;

  v_par := _salarizare_parametri('receptie', v_m);
  v_vara := exists (select 1 from jsonb_array_elements_text(v_par -> 'luni_vara') x where x::int = p_luna);

  select * into v_cfg from salarizare_receptie r
  where r.user_id = p_user and r.valabil_de_la <= v_m
    and (r.valabil_pana_la is null or v_m < r.valabil_pana_la);
  if not found then
    return jsonb_build_object('user_id', p_user, 'anul', p_anul, 'luna', p_luna,
                              'receptie', false, 'total', 0, 'componente', '[]'::jsonb);
  end if;

  v_fix  := round((v_par ->> 'fix_norma_intreaga')::numeric * v_cfg.norma, 2);
  v_fact := case when v_cfg.facturare_la_timp then (v_par ->> 'facturare_la_timp')::numeric else 0 end;
  v_fid  := case when v_cfg.fidelitate then (v_par ->> 'fidelitate')::numeric else 0 end;

  v_comp := v_comp
    || jsonb_build_object('cheie', 'fix', 'eticheta',
         case when v_cfg.norma < 1 then format('Salariu fix (normă %s)', v_cfg.norma) else 'Salariu fix' end,
         'suma', v_fix, 'provizoriu', false, 'blocant', null)
    || jsonb_build_object('cheie', 'facturare', 'eticheta', 'Facturare la timp',
         'suma', v_fact, 'provizoriu', false, 'blocant', null)
    || jsonb_build_object('cheie', 'fidelitate', 'eticheta', 'Fidelitate',
         'suma', v_fid, 'provizoriu', false, 'blocant', null);

  if not v_vara then
    select * into v_grila from kpi_grile g
    where g.titular_user = p_user and g.perioada = 'sezon' and g.stare = 'activa'
      and g.valabil_de_la < v_m1
      and (g.valabil_pana_la is null or g.valabil_pana_la >= v_m)
    order by g.valabil_de_la desc limit 1;

    if not found then
      v_blocante := v_blocante || to_jsonb('Nu are grilă KPI activă pentru luna asta.'::text);
      v_comp := v_comp || jsonb_build_object('cheie', 'bonus_kpi', 'eticheta', 'Bonus KPI',
                  'suma', 0, 'provizoriu', false, 'blocant', 'fără grilă KPI activă');
    else
      select * into v_raport from raport_kpi_lunar
       where grila_id = v_grila.id and anul = p_anul and luna = p_luna;
      if found and v_raport.stare = 'inchis' and v_raport.kpi is not null then
        v_kpi := v_raport.kpi;
        v_sursa := 'inghetat';
      else
        v_kpi := calculeaza_raport_kpi(v_grila.id, p_anul, p_luna);
        v_sursa := 'live';
      end if;

      -- Blocantele părții definitive = toate, fără cele care spun doar „provizoriu".
      select coalesce(jsonb_agg(b), '[]'::jsonb) into v_bl_def
      from jsonb_array_elements_text(v_kpi -> 'blocante') b
      where b not in (select jsonb_array_elements_text(coalesce(v_kpi -> 'blocante_provizorii', '[]'::jsonb)));

      v_prov_k2 := coalesce((v_kpi ->> 'provizoriu')::boolean, false);
      v_bonus_k2 := round(coalesce((v_kpi ->> 'bonus_provizoriu')::numeric, 0) * v_cfg.norma, 2);
      v_bonus := round(coalesce((v_kpi ->> 'bonus_titular')::numeric, 0) * v_cfg.norma, 2) - v_bonus_k2;
      select l ->> 'detalii' into v_final_k2 from jsonb_array_elements(v_kpi -> 'linii') l
       where l ->> 'cheie' = 'rata_incasare_m1';
      v_final_k2 := coalesce((v_final_k2::jsonb) ->> 'final_la', ((v_m1 + interval '1 month')::date - 1)::text);

      if coalesce((v_kpi ->> 'provizoriu_in_pondere')::boolean, false) then
        v_avert := v_avert || to_jsonb('O linie provizorie are pondere: tot bonusul KPI rămâne provizoriu.'::text);
      end if;

      v_comp := v_comp
        || jsonb_build_object('cheie', 'bonus_kpi', 'eticheta', 'Bonus KPI (K1, K3, K4, K5)',
             'suma', v_bonus,
             -- Se măsoară pe toată luna: definitiv abia după ce luna s-a încheiat.
             'provizoriu', v_azi < v_m1 or coalesce((v_kpi ->> 'provizoriu_in_pondere')::boolean, false),
             'final_la', (v_m1 - 1)::text,
             'blocant', case when jsonb_array_length(v_bl_def) > 0
                             then (select string_agg(x, ' ') from jsonb_array_elements_text(v_bl_def) x) end)
        || jsonb_build_object('cheie', 'bonus_k2', 'eticheta', 'Bonus K2 (rata de încasare)',
             'suma', v_bonus_k2, 'provizoriu', v_prov_k2, 'final_la', v_final_k2, 'blocant', null);
      v_blocante := v_blocante || v_bl_def;
    end if;
  end if;

  if v_cfg.bonusuri_ocazionale then
    v_avert := v_avert || to_jsonb('Are bonusuri ocazionale (evenimente, campania de reînscrieri) — se stabilesc la fiecare ocazie, în afara lunii.'::text);
  end if;

  v_total := v_fix + v_fact + v_fid + v_bonus + v_bonus_k2;

  return jsonb_build_object(
    'user_id', p_user,
    'titular_nume', v_cfg.titular_nume,
    'receptie', true,
    'anul', p_anul,
    'luna', p_luna,
    'perioada', case when v_vara then 'vara' else 'sezon' end,
    'norma', v_cfg.norma,
    'reguli', jsonb_build_object('parametri', v_par, 'configurare', to_jsonb(v_cfg) - 'user_id'),
    'kpi', case when v_kpi is null then null else jsonb_build_object(
             'grila_id', v_grila.id, 'raport_id', v_raport.id,
             'stare_raport', coalesce(v_raport.stare, 'nedeschis'), 'sursa', v_sursa,
             'bonus_grila', (v_kpi ->> 'bonus_titular')::numeric,
             'linii', v_kpi -> 'linii', 'avertismente', v_kpi -> 'avertismente') end,
    'beneficii', case when v_cfg.abonament_trupa
                      then jsonb_build_array(jsonb_build_object('cheie', 'abonament_trupa',
                             'eticheta', 'Abonament la trupa proprie', 'suma', (v_par ->> 'abonament_trupa')::numeric))
                      else '[]'::jsonb end,
    'bonusuri_ocazionale', v_cfg.bonusuri_ocazionale,
    'componente', v_comp,
    'total', v_total,
    'provizoriu', exists (select 1 from jsonb_array_elements(v_comp) c where (c ->> 'provizoriu')::boolean),
    'blocante', v_blocante,
    'avertismente', v_avert);
end;
$$;

revoke execute on function public.calculeaza_salariu_receptie(uuid, int, int) from anon, public;
grant execute on function public.calculeaza_salariu_receptie(uuid, int, int) to authenticated;
