-- Un indicator care nu se poate măsura într-o lună (nicio valoare: numitor zero)
-- se plătește la STANDARD, fără redistribuire pe ceilalți (Alex, 25 sept. 2026).
-- Motivul concret: la recepție, K3 n-are încă cazuri în jurnal, iar redistribuirea
-- îi dădea Petruței 295 lei doar pe K5.
--
-- E o opțiune PE LINIE (`na_standard`), activă pe șablonul „Recepție 2026-2027" și
-- pe grilele lui; șablonul MOA păstrează redistribuirea. Coloană tipizată, nu
-- parametru: o citește motorul generic (regula din 20260901150000).
-- Datele manuale necompletate (K4) blochează în continuare închiderea lunii și, pe
-- aceste linii, nu mai mută ponderea pe ceilalți: previzualizarea n-are voie să
-- umfle restul bonusului cât timp lipsește o cifră de completat.

alter table public.kpi_sablon_linii add column if not exists na_standard boolean not null default false;
alter table public.kpi_grila_linii  add column if not exists na_standard boolean not null default false;

update public.kpi_sablon_linii set na_standard = true
 where sablon_id in (select id from public.kpi_sabloane where nume = 'Recepție 2026-2027');
update public.kpi_grila_linii set na_standard = true
 where grila_id in (select g.id from public.kpi_grile g join public.kpi_sabloane s on s.id = g.sablon_sursa
                    where s.nume = 'Recepție 2026-2027');

-- Funcțiile care copiază / rescriu liniile trebuie să poarte coloana, altfel o
-- salvare din editor ar readuce-o tăcut pe `false`.

CREATE OR REPLACE FUNCTION public.kpi_grila_seteaza_linii(p_grila uuid, p_linii jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_n int;
begin
  if not is_admin() then
    raise exception 'Doar owner/admin pot edita grilele KPI' using errcode = '42501';
  end if;
  if not exists (select 1 from kpi_grile where id = p_grila) then
    raise exception 'Grila nu există' using errcode = 'P0002';
  end if;

  delete from kpi_grila_linii where grila_id = p_grila;

  insert into kpi_grila_linii (
    grila_id, kpi_id, pondere, tip_prag, prag_standard, prag_peste,
    conditie_sub, conditie_standard, conditie_peste, suma_standard, suma_peste,
    mod_calcul, comision_procent_standard, comision_procent_peste, comision_plafon,
    luni_active, eliminatoriu, are_poarta, na_standard, parametri, activ, ordine
  )
  select p_grila,
         (l ->> 'kpi_id')::uuid,
         coalesce((l ->> 'pondere')::numeric, 0),
         coalesce(l ->> 'tip_prag', 'procent'),
         nullif(l ->> 'prag_standard', '')::numeric,
         nullif(l ->> 'prag_peste', '')::numeric,
         l ->> 'conditie_sub', l ->> 'conditie_standard', l ->> 'conditie_peste',
         nullif(l ->> 'suma_standard', '')::numeric,
         nullif(l ->> 'suma_peste', '')::numeric,
         coalesce(l ->> 'mod_calcul', 'fix'),
         nullif(l ->> 'comision_procent_standard', '')::numeric,
         nullif(l ->> 'comision_procent_peste', '')::numeric,
         nullif(l ->> 'comision_plafon', '')::numeric,
         case when l -> 'luni_active' is null or jsonb_typeof(l -> 'luni_active') = 'null'
              then null
              else (select array_agg(value::text::int)
                      from jsonb_array_elements(l -> 'luni_active')) end,
         coalesce((l ->> 'eliminatoriu')::boolean, false),
         coalesce((l ->> 'are_poarta')::boolean, false),
         coalesce((l ->> 'na_standard')::boolean, false),
         coalesce(l -> 'parametri', '{}'::jsonb),
         coalesce((l ->> 'activ')::boolean, true),
         coalesce((l ->> 'ordine')::int, 0)
  from jsonb_array_elements(p_linii) l;

  get diagnostics v_n = row_count;

  update kpi_grile set updated = now() where id = p_grila;

  insert into audit_log (actor_id, actor_role, entity_type, entity_id, action, new_value)
  values (auth.uid(), auth_role(), 'kpi_grila', p_grila, 'update',
          jsonb_build_object('linii', v_n));

  return v_n;
end;
$function$;

CREATE OR REPLACE FUNCTION public.kpi_sablon_seteaza_linii(p_sablon uuid, p_linii jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_n int;
begin
  if not is_admin() then
    raise exception 'Doar owner/admin pot edita șabloanele KPI' using errcode = '42501';
  end if;

  delete from kpi_sablon_linii where sablon_id = p_sablon;

  insert into kpi_sablon_linii (
    sablon_id, kpi_id, pondere, tip_prag, prag_standard, prag_peste,
    conditie_sub, conditie_standard, conditie_peste, suma_standard, suma_peste,
    mod_calcul, comision_procent_standard, comision_procent_peste, comision_plafon,
    luni_active, eliminatoriu, are_poarta, na_standard, parametri, activ, ordine
  )
  select p_sablon, (l ->> 'kpi_id')::uuid,
         coalesce((l ->> 'pondere')::numeric, 0),
         coalesce(l ->> 'tip_prag', 'procent'),
         nullif(l ->> 'prag_standard', '')::numeric,
         nullif(l ->> 'prag_peste', '')::numeric,
         l ->> 'conditie_sub', l ->> 'conditie_standard', l ->> 'conditie_peste',
         nullif(l ->> 'suma_standard', '')::numeric,
         nullif(l ->> 'suma_peste', '')::numeric,
         coalesce(l ->> 'mod_calcul', 'fix'),
         nullif(l ->> 'comision_procent_standard', '')::numeric,
         nullif(l ->> 'comision_procent_peste', '')::numeric,
         nullif(l ->> 'comision_plafon', '')::numeric,
         case when l -> 'luni_active' is null or jsonb_typeof(l -> 'luni_active') = 'null'
              then null
              else (select array_agg(value::text::int) from jsonb_array_elements(l -> 'luni_active')) end,
         coalesce((l ->> 'eliminatoriu')::boolean, false),
         coalesce((l ->> 'are_poarta')::boolean, false),
         coalesce((l ->> 'na_standard')::boolean, false),
         coalesce(l -> 'parametri', '{}'::jsonb),
         coalesce((l ->> 'activ')::boolean, true),
         coalesce((l ->> 'ordine')::int, 0)
  from jsonb_array_elements(p_linii) l;

  get diagnostics v_n = row_count;
  update kpi_sabloane set updated = now() where id = p_sablon;
  return v_n;
end;
$function$;

CREATE OR REPLACE FUNCTION public.kpi_atribuie_grila(p_sablon uuid, p_titular_tip text, p_titular_id uuid, p_locatii uuid[], p_valabil_de_la date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sablon kpi_sabloane;
  v_grila  uuid;
  v_nume   text;
  v_loc    uuid;
begin
  if not is_admin() then
    raise exception 'Doar owner/admin pot atribui grile KPI' using errcode = '42501';
  end if;

  select * into v_sablon from kpi_sabloane where id = p_sablon;
  if not found then
    raise exception 'Șablonul nu există' using errcode = 'P0002';
  end if;
  if v_sablon.stare = 'arhivat' then
    raise exception 'Șablonul e arhivat' using errcode = '22023';
  end if;
  if p_locatii is null or array_length(p_locatii, 1) is null then
    raise exception 'Grila trebuie să acopere cel puțin un punct de lucru'
      using errcode = '22023';
  end if;
  if extract(day from p_valabil_de_la) <> 1 then
    raise exception 'Grila poate începe doar în ziua 1 a unei luni'
      using errcode = '22023';
  end if;

  select nume_afisat into v_nume from get_titulari_kpi(true)
   where titular_id = p_titular_id and tip = p_titular_tip;
  if v_nume is null then
    raise exception 'Titularul nu a fost găsit' using errcode = 'P0002';
  end if;

  insert into kpi_grile (
    titular_user, titular_teacher, titular_nume, post, perioada,
    cota_manager, zile_min_evaluare, sablon_sursa, valabil_de_la, stare, creat_de
  ) values (
    case when p_titular_tip = 'user'    then p_titular_id end,
    case when p_titular_tip = 'teacher' then p_titular_id end,
    v_nume, v_sablon.post, v_sablon.perioada,
    v_sablon.cota_manager, v_sablon.zile_min_evaluare, v_sablon.id,
    p_valabil_de_la, 'ciorna', auth.uid()
  ) returning id into v_grila;

  foreach v_loc in array p_locatii loop
    insert into kpi_grila_locatii (grila_id, locatie) values (v_grila, v_loc)
    on conflict do nothing;
  end loop;

  insert into kpi_grila_linii (
    grila_id, kpi_id, pondere, tip_prag, prag_standard, prag_peste,
    conditie_sub, conditie_standard, conditie_peste, suma_standard, suma_peste,
    mod_calcul, comision_procent_standard, comision_procent_peste, comision_plafon,
    luni_active, eliminatoriu, are_poarta, na_standard, parametri, activ, ordine
  )
  select v_grila, l.kpi_id, l.pondere, l.tip_prag, l.prag_standard, l.prag_peste,
         l.conditie_sub, l.conditie_standard, l.conditie_peste, l.suma_standard, l.suma_peste,
         l.mod_calcul, l.comision_procent_standard, l.comision_procent_peste, l.comision_plafon,
         l.luni_active, l.eliminatoriu, l.are_poarta, l.na_standard, l.parametri, l.activ, l.ordine
  from kpi_sablon_linii l
  where l.sablon_id = p_sablon;

  insert into audit_log (actor_id, actor_role, entity_type, entity_id, action, new_value)
  values (auth.uid(), auth_role(), 'kpi_grila', v_grila, 'create',
          jsonb_build_object('sablon', p_sablon, 'titular', v_nume,
                             'de_la', p_valabil_de_la));

  return v_grila;
end;
$function$;

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

    -- Linia configurată „fără date = standard": o lună în care indicatorul n-a avut
    -- ce măsura plătește standardul, fără redistribuire (Alex, 25 sept. 2026). Doar
    -- lipsa de numitor; datele manuale necompletate blochează în continuare.
    if v_banda = 'na' and v_motiv = 'numitor_zero' and v_l.na_standard then
      v_banda := 'standard';
      v_motiv := 'numitor_zero_standard';
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
      -- Pe liniile „fără date = standard" o valoare manuală necompletată nu mută
      -- ponderea pe ceilalți: contează 0 până se completează (și blochează închiderea).
      if v_banda <> 'na' or (v_l.na_standard and v_motiv = 'necompletat') then
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
      'na_standard', v_l.na_standard,
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
$function$;
