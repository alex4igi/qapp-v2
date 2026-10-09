-- KPI-urile recepției explicite pe cardul de salariu (Alex, 10 oct. 2026): fiecare linie poartă și
-- sumele treptelor din grila omului, ca să se vadă ce prag aduce câți lei.

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
  v_fix       numeric;
  v_fact      numeric;
  v_fid       numeric;
  v_q4k       numeric;
  v_cod_luna  text;
  v_cod_am    text;
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
  v_q4k  := case when v_cfg.receptie_q4k then (v_par ->> 'receptie_q4k')::numeric else 0 end;

  v_comp := v_comp
    || jsonb_build_object('cheie', 'fix', 'eticheta',
         case when v_cfg.fix_lunar is not null then 'Salariu fix (stabilit)'
              when v_cfg.norma < 1 then format('Salariu fix (normă %s)', v_cfg.norma)
              else 'Salariu fix' end,
         'suma', v_fix, 'provizoriu', false, 'blocant', null);
  -- Doar ce i se aplică omului: o linie de 0 lei care nu-l privește doar încurcă cardul.
  if v_cfg.facturare_la_timp then
    v_comp := v_comp || jsonb_build_object('cheie', 'facturare', 'eticheta', 'Facturare la timp',
                'suma', v_fact, 'provizoriu', false, 'blocant', null);
  end if;
  if v_cfg.receptie_q4k then
    v_comp := v_comp || jsonb_build_object('cheie', 'q4k', 'eticheta', 'Recepție Quasar 4 Kids',
                'suma', v_q4k, 'provizoriu', false, 'blocant', null);
  end if;
  if v_cfg.fidelitate then
    v_comp := v_comp || jsonb_build_object('cheie', 'fidelitate', 'eticheta', 'Fidelitate',
                'suma', v_fid, 'provizoriu', false, 'blocant', null);
  end if;

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
      -- K1…K5 = poziția liniei în grilă; amânate = liniile care își declară `final_la` (ca în motor).
      v_kpi := jsonb_set(v_kpi, '{linii}', coalesce((
        select jsonb_agg(l || jsonb_build_object('cod', 'K' || ord,
                 'amanat', l ->> 'sursa' = 'auto' and coalesce(l -> 'detalii', '{}'::jsonb) ? 'final_la',
                 'suma_standard', gl.suma_standard, 'suma_peste', gl.suma_peste)
               order by ord)
        from jsonb_array_elements(coalesce(v_kpi -> 'linii', '[]'::jsonb)) with ordinality x(l, ord)
        left join kpi_grila_linii gl on gl.grila_id = v_grila.id and gl.kpi_id = (l ->> 'kpi_id')::uuid), '[]'::jsonb));
      select string_agg(l ->> 'cod', ' + ') filter (where not (l ->> 'amanat')::boolean),
             string_agg(l ->> 'cod', ' + ') filter (where (l ->> 'amanat')::boolean)
        into v_cod_luna, v_cod_am
        from jsonb_array_elements(v_kpi -> 'linii') l;

      if coalesce((v_kpi ->> 'provizoriu_in_pondere')::boolean, false) then
        v_avert := v_avert || to_jsonb('O linie provizorie are pondere: tot bonusul KPI rămâne provizoriu.'::text);
      end if;

      v_comp := v_comp
        || jsonb_build_object('cheie', 'bonus_kpi', 'eticheta', 'Bonus KPI' || coalesce(' ' || v_cod_luna, ''),
             'suma', v_bonus,
             -- Se măsoară pe toată luna: definitiv abia după ce luna s-a încheiat.
             'provizoriu', v_azi < v_m1 or coalesce((v_kpi ->> 'provizoriu_in_pondere')::boolean, false),
             'final_la', (v_m1 - 1)::text,
             'blocant', case when jsonb_array_length(v_bl_def) > 0
                             then (select string_agg(x, ' ') from jsonb_array_elements_text(v_bl_def) x) end)
        || jsonb_build_object('cheie', 'bonus_kpi_m1', 'eticheta',
             'Bonus KPI' || coalesce(' ' || v_cod_am, ' — luna următoare'),
             'suma', v_bonus_k2, 'provizoriu', v_prov_k2, 'final_la', v_final_k2, 'blocant', null);
      v_blocante := v_blocante || v_bl_def;
    end if;
  end if;

  if v_cfg.bonusuri_ocazionale then
    v_avert := v_avert || to_jsonb('Are bonusuri ocazionale (evenimente, campania de reînscrieri) — se stabilesc la fiecare ocazie, în afara lunii.'::text);
  end if;

  v_total := v_fix + v_fact + v_q4k + v_fid + v_bonus + v_bonus_k2;

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
    'receptie_q4k', v_cfg.receptie_q4k,
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
$function$;

revoke execute on function public.calculeaza_salariu_receptie(uuid, int, int) from anon, public;
grant execute on function public.calculeaza_salariu_receptie(uuid, int, int) to authenticated;
