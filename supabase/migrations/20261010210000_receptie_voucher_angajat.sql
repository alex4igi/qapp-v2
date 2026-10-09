-- Recepția primește voucherul de angajat de 300 lei/lună, ca instructorii (Alex, 10 oct. 2026), în locul
-- „abonamentului la trupa proprie" de 290. Voucherul se folosește la orice grupă; restul din 300 rămâne pentru
-- a doua grupă din aceeași lună (trigger-ul `_enrollment_acoperire_gratuitate`). Petruța e deja pe voucher la
-- UNIQ Crew (290 → îi rămân 10); Theo nu e înrolată nicăieri (300 disponibili).

alter table public.salarizare_receptie rename column abonament_trupa to voucher_angajat;

create or replace function public.calculeaza_salariu_receptie(p_user uuid, p_anul integer, p_luna integer)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
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
  v_nume_am   text;
  v_fix       numeric;
  v_fact      numeric;
  v_fid       numeric;
  v_comp      jsonb := '[]'::jsonb;
  v_blocante  jsonb := '[]'::jsonb;
  v_avert     jsonb := '[]'::jsonb;
  v_total     numeric;
begin
  if not (is_admin() or _salariu_propriu_vizibil(p_user, p_anul, p_luna)) then
    raise exception 'Doar adminii văd salarizarea recepției.' using errcode = '42501';
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

  v_fix  := coalesce(v_cfg.fix_lunar, round((v_par ->> 'fix_norma_intreaga')::numeric * v_cfg.norma, 2));
  v_fact := case when v_cfg.facturare_la_timp then (v_par ->> 'facturare_la_timp')::numeric else 0 end;
  v_fid  := case when v_cfg.fidelitate then (v_par ->> 'fidelitate')::numeric else 0 end;

  v_comp := v_comp
    || jsonb_build_object('cheie', 'fix', 'eticheta',
         case when v_cfg.fix_lunar is not null then 'Salariu fix (stabilit)'
              when v_cfg.norma < 1 then format('Salariu fix (normă %s)', v_cfg.norma)
              else 'Salariu fix' end,
         'suma', v_fix, 'provizoriu', false, 'blocant', null)
    || jsonb_build_object('cheie', 'facturare', 'eticheta', 'Facturare la timp',
         'suma', v_fact, 'provizoriu', false, 'blocant', null)
    || jsonb_build_object('cheie', 'fidelitate', 'eticheta', 'Fidelitate',
         'suma', v_fid, 'provizoriu', false, 'blocant', null);

  if not v_vara and v_cfg.bonus_kpi then
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
      v_bonus_k2 := round(coalesce((v_kpi ->> 'bonus_amanat')::numeric,
                                   (v_kpi ->> 'bonus_provizoriu')::numeric, 0) * v_cfg.norma, 2);
      v_bonus := round(coalesce((v_kpi ->> 'bonus_titular')::numeric, 0) * v_cfg.norma, 2) - v_bonus_k2;
      v_final_k2 := coalesce(v_kpi ->> 'bonus_amanat_final_la',
                             ((v_m1 + interval '1 month')::date - 1)::text);
      select string_agg(x, ', ') into v_nume_am
        from jsonb_array_elements_text(coalesce(v_kpi -> 'bonus_amanat_linii', '[]'::jsonb)) x;

      if coalesce((v_kpi ->> 'provizoriu_in_pondere')::boolean, false) then
        v_avert := v_avert || to_jsonb('O linie provizorie are pondere: tot bonusul KPI rămâne provizoriu.'::text);
      end if;

      v_comp := v_comp
        || jsonb_build_object('cheie', 'bonus_kpi', 'eticheta', 'Bonus KPI — la finalul lunii',
             'suma', v_bonus,
             -- Se măsoară pe toată luna: definitiv abia după ce luna s-a încheiat.
             'provizoriu', v_azi < v_m1 or coalesce((v_kpi ->> 'provizoriu_in_pondere')::boolean, false),
             'final_la', (v_m1 - 1)::text,
             'blocant', case when jsonb_array_length(v_bl_def) > 0
                             then (select string_agg(x, ' ') from jsonb_array_elements_text(v_bl_def) x) end)
        || jsonb_build_object('cheie', 'bonus_kpi_m1', 'eticheta',
             'Bonus KPI — luna următoare' || coalesce(' (' || v_nume_am || ')', ''),
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
    'fix_lunar', v_cfg.fix_lunar,
    'bonus_kpi', v_cfg.bonus_kpi,
    'reguli', jsonb_build_object('parametri', v_par, 'configurare', to_jsonb(v_cfg) - 'user_id'),
    'kpi', case when v_kpi is null then null else jsonb_build_object(
             'grila_id', v_grila.id, 'raport_id', v_raport.id,
             'stare_raport', coalesce(v_raport.stare, 'nedeschis'), 'sursa', v_sursa,
             'bonus_grila', (v_kpi ->> 'bonus_titular')::numeric,
             'linii', v_kpi -> 'linii', 'avertismente', v_kpi -> 'avertismente') end,
    -- Același voucher ca la instructori: plafonul lunar; consumul îl ține înrolarea (`gratuitate = 'angajat'`).
    'beneficii', case when v_cfg.voucher_angajat
                      then jsonb_build_array(jsonb_build_object('cheie', 'voucher', 'eticheta', 'Voucher clase Quasar',
                             'suma', coalesce((_salarizare_parametri('instructor', v_m) ->> 'voucher_lunar')::numeric, 300)))
                      else '[]'::jsonb end,
    'bonusuri_ocazionale', v_cfg.bonusuri_ocazionale,
    'componente', v_comp,
    'total', v_total,
    'provizoriu', exists (select 1 from jsonb_array_elements(v_comp) c where (c ->> 'provizoriu')::boolean),
    'blocante', v_blocante,
    'avertismente', v_avert);
end;
$function$;
