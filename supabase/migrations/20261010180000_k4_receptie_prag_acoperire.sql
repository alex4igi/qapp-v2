-- K4 recepție: un canal introdus de manager (telefon, Meta) intră în medie doar dacă are
-- cel puțin 70% din zilele lucrătoare ale lunii completate (până ieri, pe luna în curs).
-- Sub prag nu intră și nu mai blochează închiderea. Înainte, o singură zi introdusă
-- (Nicolina, 30 sept.: 3 apeluri) cântărea cât o lună de leaduri și ridica K4 de la 61% la 81%,
-- iar zero zile (Ștefan) bloca luna. Alex, 10 oct. 2026.

create or replace function public.kpi_k4_receptie(
  p_locatii uuid[], p_anul integer, p_luna integer, p_parametri jsonb, p_manual jsonb)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_zile      int := coalesce((p_parametri ->> 'zile_lucru_saptamana')::int, 7);
  v_std       numeric := coalesce((p_parametri ->> 'rata_standard')::numeric, 85);
  v_peste     numeric := coalesce((p_parametri ->> 'rata_peste')::numeric, 95.01);
  v_cu_meta   boolean := coalesce((p_parametri ->> 'include_meta')::int, 0) = 1;
  v_prag_acop numeric := coalesce((p_parametri ->> 'prag_acoperire')::numeric, 70);
  v_prima     date := make_date(p_anul, p_luna, 1);
  v_urm       date := (make_date(p_anul, p_luna, 1) + interval '1 month')::date;
  v_pana      date;
  v_lucr      int;
  v_ld_numitor int; v_ld_termen int; v_ld_asteptare int; v_ld_fara_loc int;
  v_ld_rata   numeric;
  v_tel_zile  int; v_tel_lucr int; v_tel_in int; v_tel_ok int; v_tel_rata numeric; v_tel_acop numeric;
  v_meta_zile int; v_meta_lucr int; v_meta_in int; v_meta_ok int; v_meta_rata numeric; v_meta_acop numeric;
  v_rate      numeric[] := '{}';
  v_valoare   numeric;
  v_banda     text;
  v_excluse   text[] := '{}';
begin
  with cereri as (
    select l.id, l.created,
           lead_termen_raspuns(l.created, v_zile) as termen,
           -- Locația: a leadului → a ultimei programări → a grupei la care s-a înscris.
           coalesce(
             l.locatie_id,
             (select pl.locatie from programari_leads pl
               where pl.lead = l.id and pl.locatie is not null
               order by pl.created desc limit 1),
             (select c.locatie from enrollments e join cursuri c on c.id = e.cursul
               where l.id_client is not null and e.client = l.id_client
                 and e.created >= l.created
               order by e.created limit 1)
           ) as locatie
    from leads l
    where (l.created at time zone 'Europe/Bucharest')::date >= v_prima
      and (l.created at time zone 'Europe/Bucharest')::date < v_urm
      and coalesce(l.deja_client, false) = false
      -- Rândurile create direct în Nurture sunt foștii clienți puși în pool-ul de
      -- reactivare de `auto_mark_inactiv_si_exclient`, nu cereri la care să răspunzi.
      and not exists (select 1 from lead_history h
                       where h.lead_id = l.id and h.action_type = 'created'
                         and h.new_value = 'nurture')
  ),
  verdict as (
    select c.*,
           least(
             (select min(lc.created) from lead_contacte lc where lc.lead_id = c.id),
             (select min(h.created_at) from lead_history h
               where h.lead_id = c.id and h.user_id is not null
                 and h.action_type in ('created','status_change','sub_status_change','sms_sent','note_added'))
           ) as prima_atingere
    from cereri c
  )
  select count(*) filter (where locatie = any(p_locatii) and termen <= now()),
         count(*) filter (where locatie = any(p_locatii) and termen <= now() and prima_atingere <= termen),
         count(*) filter (where locatie = any(p_locatii) and termen > now()),
         count(*) filter (where locatie is null)
    into v_ld_numitor, v_ld_termen, v_ld_asteptare, v_ld_fara_loc
  from verdict;

  if v_ld_numitor > 0 then
    v_ld_rata := round(v_ld_termen::numeric / v_ld_numitor * 100, 1);
    v_rate := v_rate || v_ld_rata;
  end if;

  -- Pe luna în curs, ziua de azi nu se cere: managerul o introduce de regulă a doua zi.
  v_pana := least(v_urm, (now() at time zone 'Europe/Bucharest')::date);
  select count(*) into v_lucr
  from generate_series(v_prima, v_pana - 1, interval '1 day') g(zi)
  where extract(isodow from g.zi) <= v_zile;

  select count(*) filter (where canal = 'telefon'),
         count(distinct zi) filter (where canal = 'telefon' and zi < v_pana and extract(isodow from zi) <= v_zile),
         coalesce(sum(intrate) filter (where canal = 'telefon'), 0),
         coalesce(sum(cu_raspuns) filter (where canal = 'telefon'), 0),
         count(*) filter (where canal = 'meta'),
         count(distinct zi) filter (where canal = 'meta' and zi < v_pana and extract(isodow from zi) <= v_zile),
         coalesce(sum(intrate) filter (where canal = 'meta'), 0),
         coalesce(sum(cu_raspuns) filter (where canal = 'meta'), 0)
    into v_tel_zile, v_tel_lucr, v_tel_in, v_tel_ok, v_meta_zile, v_meta_lucr, v_meta_in, v_meta_ok
  from k4_interactiuni_zi
  where locatie_id = any(p_locatii) and zi >= v_prima and zi < v_urm;

  if v_lucr > 0 then
    v_tel_acop := round(v_tel_lucr::numeric / v_lucr * 100, 1);
    v_meta_acop := round(v_meta_lucr::numeric / v_lucr * 100, 1);
  end if;

  -- Zile completate fără nicio interacțiune intrată = n-a rămas nimeni fără răspuns.
  if v_tel_zile > 0 then
    v_tel_rata := case when v_tel_in = 0 then 100 else round(v_tel_ok::numeric / v_tel_in * 100, 1) end;
  end if;
  if coalesce(v_tel_acop, 0) >= v_prag_acop and v_tel_rata is not null then
    v_rate := v_rate || v_tel_rata;
  else
    v_excluse := v_excluse || 'telefonul'::text;
  end if;

  if v_cu_meta then
    if v_meta_zile > 0 then
      v_meta_rata := case when v_meta_in = 0 then 100 else round(v_meta_ok::numeric / v_meta_in * 100, 1) end;
    end if;
    if coalesce(v_meta_acop, 0) >= v_prag_acop and v_meta_rata is not null then
      v_rate := v_rate || v_meta_rata;
    else
      v_excluse := v_excluse || 'Meta'::text;
    end if;
  end if;

  if cardinality(v_rate) > 0 then
    select round(avg(x), 1) into v_valoare from unnest(v_rate) x;
    v_banda := case when v_valoare >= v_peste then 'peste'
                    when v_valoare >= v_std then 'standard'
                    else 'sub' end;
  end if;

  return jsonb_build_object(
    'kpi', 'raspuns_24h', 'mod', 'interactiuni_manager',
    'valoare', v_valoare,
    'banda', coalesce(v_banda, 'na'),
    'motiv', case when v_banda is null then 'numitor_zero' end,
    'motiv_text', case
      when v_banda is null then 'Nicio sursă n-are date luna asta.'
      when cardinality(v_excluse) > 0
        then 'Fără ' || array_to_string(v_excluse, ', ') || ': sub ' || v_prag_acop
             || '% din zilele lucrătoare introduse de manager (Raport KPI → Interacțiuni zilnice).'
    end,
    'banda_calculata', v_banda,
    'praguri', jsonb_build_object('standard', v_std, 'peste', v_peste),
    'zile_lucru_saptamana', v_zile,
    'zile_lucru_luna', v_lucr,
    'prag_acoperire', v_prag_acop,
    'canale_excluse', to_jsonb(v_excluse),
    'leaduri_numitor', v_ld_numitor,
    'leaduri_in_termen', v_ld_termen,
    'leaduri_in_asteptare', v_ld_asteptare,
    'leaduri_fara_locatie', v_ld_fara_loc,
    'rata_leaduri', v_ld_rata,
    'telefon_zile', v_tel_zile, 'telefon_zile_lucru', v_tel_lucr, 'telefon_acoperire', v_tel_acop,
    'telefon_intrate', v_tel_in, 'telefon_cu_raspuns', v_tel_ok,
    'rata_telefon', v_tel_rata,
    'include_meta', v_cu_meta,
    'meta_zile', v_meta_zile, 'meta_zile_lucru', v_meta_lucr, 'meta_acoperire', v_meta_acop,
    'meta_intrate', v_meta_in, 'meta_cu_raspuns', v_meta_ok,
    'rata_meta', v_meta_rata,
    'surse', cardinality(v_rate)
  );
end;
$function$;

revoke execute on function public.kpi_k4_receptie(uuid[], integer, integer, jsonb, jsonb) from anon, authenticated, public;
grant execute on function public.kpi_k4_receptie(uuid[], integer, integer, jsonb, jsonb) to service_role;
