-- Salariul instructorului pe grila 2026-2027 — înlocuiește modelul pe praguri de
-- cursanți (Alex, 25 sept. 2026). Reguli: docs/grila-salarizare-instructori.md.
--
-- Pe grupă, în sezon:  factor × (bază + retenție + ocupare)
--   factor   ½ la o ședință pe săptămână (bază ȘI bonus), 1 la două; trei = două
--   bază     rangul instructorului × nivelul grupei
--   retenție păstrați din plătitorii lunii trecute; prima lună a grupei = standard
--   ocupare  plătitori / capacitatea grupei; în septembrie, regula sezonului
-- Vara (iulie–august): 6 lei pe prezență (fără ½) + baza grupelor mature.
--
-- Cursantul plătitor are o singură definiție: _inrolari_platite (20260925154812),
-- același nucleu din care numără _locuri_ocupate.
--
-- Datele lipsă (rang, nivel, orar, capacitate) nu devin 0 lei: grupa primește
-- `blocant`, previzualizarea îl arată, iar confirmarea refuză până se rezolvă.

-- ── 1. Testul de maturitate (baza de vară) ────────────────────────────────────
-- Grupa trece dacă, după lunile de test de la lansare, are o serie de N luni
-- consecutive cu minim X plătitori; o lună suspendată rupe seria.
create or replace function public._grupa_matura(p_curs uuid, p_par jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_lansare date;
  v_ultima  date;
  v_de_la   date;
  v_test    int := coalesce((p_par #>> '{maturitate,luni_test}')::int, 3);
  v_nec     int := coalesce((p_par #>> '{maturitate,luni_consecutive}')::int, 5);
  v_minim   int := coalesce((p_par #>> '{maturitate,minim}')::int, 8);
  v_luni    jsonb := '[]'::jsonb;
  v_serie   int := 0;
  v_max     int := 0;
  v_m       date;
  v_n       int;
  v_activ   boolean;
begin
  select greatest(date_trunc('month', z.data_incepere), date_trunc('month', c.created))::date,
         date_trunc('month', z.data_final)::date
    into v_lansare, v_ultima
  from cursuri c join sezoane z on z.id = c.sezon
  where c.id = p_curs;
  if v_lansare is null then
    return jsonb_build_object('matur', false, 'motiv', 'fără sezon');
  end if;

  v_de_la := (v_lansare + make_interval(months => v_test))::date;
  for v_m in select m::date from generate_series(v_de_la, v_ultima, interval '1 month') m loop
    v_activ := curs_activ_in_luna(p_curs, v_m);
    v_n := case when v_activ then cursanti_platitori_luna(p_curs, v_m) else 0 end;
    if v_activ and v_n >= v_minim then
      v_serie := v_serie + 1;
      v_max := greatest(v_max, v_serie);
    else
      v_serie := 0;
    end if;
    v_luni := v_luni || jsonb_build_object('luna', to_char(v_m, 'YYYY-MM'), 'cursanti', v_n, 'activ', v_activ);
  end loop;

  return jsonb_build_object('matur', v_max >= v_nec, 'luna_lansare', v_lansare,
                            'fereastra_de_la', v_de_la, 'serie_max', v_max,
                            'necesar', v_nec, 'minim', v_minim, 'luni', v_luni);
end;
$$;

revoke execute on function public._grupa_matura(uuid, jsonb) from anon, public, authenticated;
grant execute on function public._grupa_matura(uuid, jsonb) to service_role;

-- ── 2. Calculul ───────────────────────────────────────────────────────────────
create or replace function public.calculeaza_salariu_teacher(
  p_teacher uuid,
  p_anul int,
  p_luna int
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_m          date := make_date(p_anul, p_luna, 1);
  v_m_fin      date := (make_date(p_anul, p_luna, 1) + interval '1 month - 1 day')::date;
  v_prev       date := (make_date(p_anul, p_luna, 1) - interval '1 month')::date;
  v_prev_fin   date := (make_date(p_anul, p_luna, 1) - interval '1 day')::date;
  v_azi        date := (now() at time zone 'Europe/Bucharest')::date;
  v_par        jsonb;
  v_vara       boolean;
  v_rang       text;
  v_sezon      uuid;
  v_mod        text := 'masurat';
  v_ids        uuid[];
  v_n_m        jsonb := '{}'::jsonb;
  v_ret        jsonb := '{}'::jsonb;
  v_c          record;
  v_sedinte    int;
  v_factor     numeric;
  v_cursanti   int;
  v_col        text;
  v_nivel_pl   text;
  v_baza       numeric;
  v_bl         text[];
  v_n_prev     int;
  v_pastrati   int;
  v_pct_ret    numeric;
  v_tr_ret     text;
  v_lei_ret    jsonb;
  v_suma_ret   numeric;
  v_cap        int;
  v_pr_std     int;
  v_pr_peste   int;
  v_lei_std    numeric;
  v_lei_peste  numeric;
  v_tr_mas     text;
  v_tr_oc      text;
  v_suma_oc    numeric;
  v_ocupare    jsonb;
  v_retentie   jsonb;
  v_suma       numeric;
  v_grupe      jsonb := '[]'::jsonb;
  v_prez       jsonb := '[]'::jsonb;
  v_blocante   jsonb := '[]'::jsonb;
  v_t_baza     numeric := 0;
  v_t_ret      numeric := 0;
  v_t_oc       numeric := 0;
  v_t_vara     numeric := 0;
  v_t_prez     int := 0;
  v_nr_trupe   int := 0;
  v_sez_vara   uuid;
  v_ultima     date;
  v_mat        jsonb;
  v_rot        numeric;
begin
  -- Gard: adminul (profilul instructorului), instructorul însuși („Salariul meu")
  -- sau service_role (scripturile de verificare). coalesce obligatoriu: pentru
  -- conturile fără profil my_teacher_id() e NULL și `if not NULL` nu se aprinde.
  if not (
    is_admin()
    or coalesce(p_teacher = my_teacher_id(), false)
    or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
  ) then
    raise exception 'Nu ai acces la salariul acestui instructor'
      using errcode = '42501';
  end if;

  v_par := _salarizare_parametri('instructor', v_m);
  v_vara := exists (select 1 from jsonb_array_elements_text(v_par -> 'luni_vara') x where x::int = p_luna);
  v_rot := coalesce((v_par #>> '{ocupare,rotunjire}')::numeric, 10);
  select nivelul::text into v_rang from teacheri where id = p_teacher;

  if not v_vara then
    v_sezon := _sezon_lunii(v_m);
    v_mod := _mod_ocupare('instructor', v_m);

    -- Grupele lunii: ale sezonului care deține luna, plus plasa de siguranță pentru
    -- cursurile predate efectiv în lună dar etichetate pe un sezon care nu atinge
    -- luna (20260828210000). Open Class și one-time nu intră.
    select array_agg(c.id) into v_ids
    from cursuri c
    where c.teacher = p_teacher
      and coalesce(c.stil, '') <> 'Open'
      and not coalesce(c.one_time, false)
      and curs_activ_in_luna(c.id, v_m)
      and (
        c.sezon = v_sezon
        or (
          c.sezon is not null
          and exists (select 1 from prezente p join enrollments e on e.id = p.enrollment
                      where e.cursul = c.id and p.status = 'Prezent'
                        and p.data between v_m and v_m_fin)
          and not exists (select 1 from sezoane s where s.id = c.sezon
                            and s.data_incepere <= v_m_fin and s.data_final >= v_m)
        )
      );
    v_ids := coalesce(v_ids, '{}'::uuid[]);

    -- Plătitorii lunii și retenția, pentru toate grupele deodată.
    select coalesce(jsonb_object_agg(curs_id, n), '{}'::jsonb) into v_n_m
    from (select ip.curs_id, count(*)::int as n
          from _inrolari_platite(v_m, v_m_fin, v_ids, false) ip group by ip.curs_id) x;

    select coalesce(jsonb_object_agg(curs_id, jsonb_build_object('n', n, 'pastrati', k)), '{}'::jsonb)
      into v_ret
    from (select pp.curs_id, count(*)::int as n, count(pm.client)::int as k
          from _inrolari_platite(v_prev, v_prev_fin, v_ids, false) pp
          left join _inrolari_platite(v_m, v_m_fin, v_ids, false) pm
                 on pm.curs_id = pp.curs_id and pm.client = pp.client
          group by pp.curs_id) x;

    for v_c in
      select c.id, c.numele, c.nivelul::text as nivelul, c.zile, c.capacitate_maxima
      from cursuri c where c.id = any(v_ids) order by c.numele
    loop
      v_bl := '{}';
      v_sedinte := coalesce(array_length(v_c.zile, 1), 0);
      v_factor := case when v_sedinte = 1 then 0.5 else 1 end;
      if v_sedinte = 0 then v_bl := v_bl || 'orarul grupei nu are nicio zi'::text; end if;
      v_cursanti := coalesce((v_n_m ->> v_c.id::text)::int, 0);

      -- Nivelul plătit
      v_nivel_pl := case
        when v_c.nivelul = 'Incepator' then 'incepator'
        when v_c.nivelul in ('Intermediar', 'Avansat') then 'intermediar'
        when v_c.nivelul = 'Trupa' and v_rang = 'Expert'
             and v_cursanti >= (v_par ->> 'trupa_min_platitori')::int then 'trupa'
        when v_c.nivelul = 'Trupa' then 'trupa_ca_intermediar'
      end;
      v_col := case when v_nivel_pl is null then null
                    when v_nivel_pl = 'incepator' then 'Incepator'
                    when v_nivel_pl = 'trupa' then 'Trupa'
                    else 'Intermediar' end;
      if v_c.nivelul is null then v_bl := v_bl || 'grupa n-are nivel (începător / intermediar / trupă)'::text; end if;
      if v_rang is null then v_bl := v_bl || 'instructorul n-are rang (Junior / Senior / Expert)'::text; end if;

      v_baza := (v_par -> 'baza' -> v_rang ->> v_col)::numeric;
      if v_baza is null and v_rang is not null and v_col is not null then
        v_bl := v_bl || format('grila n-are bază pentru %s × %s', v_rang, v_col);
      end if;

      -- Retenția
      v_lei_ret := v_par -> 'retentie' -> 'lei' -> v_col;
      v_n_prev := coalesce((v_ret -> v_c.id::text ->> 'n')::int, 0);
      v_pastrati := coalesce((v_ret -> v_c.id::text ->> 'pastrati')::int, 0);
      if v_n_prev = 0 or not curs_activ_in_luna(v_c.id, v_prev) then
        v_tr_ret := 'prima_luna';
        v_pct_ret := null;
      else
        v_pct_ret := round(100.0 * v_pastrati / v_n_prev, 2);
        v_tr_ret := case
          when v_pct_ret >= (v_par #>> '{retentie,prag_peste}')::numeric then 'peste'
          when v_pct_ret >= (v_par #>> '{retentie,prag_standard}')::numeric then 'standard'
          else 'sub' end;
      end if;
      v_suma_ret := case v_tr_ret
        when 'peste' then (v_lei_ret ->> 1)::numeric
        when 'sub' then 0
        else (v_lei_ret ->> 0)::numeric end;
      v_retentie := jsonb_build_object('banda', v_tr_ret, 'n_luna_trecuta', v_n_prev,
                                       'pastrati', v_pastrati, 'procent', v_pct_ret,
                                       'suma', round(coalesce(v_suma_ret, 0) * v_factor, 2));

      -- Ocuparea (nu la trupa cu statut: creșterea ei se măsoară în evenimente)
      v_ocupare := null;
      v_suma_oc := 0;
      if v_nivel_pl is distinct from 'trupa' then
        v_cap := v_c.capacitate_maxima;
        if coalesce(v_cap, 0) = 0 then
          v_bl := v_bl || 'grupa n-are capacitate'::text;
        else
          v_pr_std := ceil((v_par #>> '{ocupare,prag_standard_pct}')::numeric / 100 * v_cap)::int;
          v_pr_peste := floor((v_par #>> '{ocupare,prag_peste_pct}')::numeric / 100 * v_cap)::int + 1;
          v_lei_std := round((v_par #>> '{ocupare,coef_standard}')::numeric * v_cap / v_rot) * v_rot;
          v_lei_peste := round(((v_par #>> '{ocupare,coef_peste}')::numeric * v_cap
                                + (v_par #>> '{ocupare,adaos_peste}')::numeric) / v_rot) * v_rot;
          v_tr_mas := case when v_cursanti >= v_pr_peste then 'peste'
                           when v_cursanti >= v_pr_std then 'standard' else 'sub' end;
          v_tr_oc := case
            when v_mod = 'standard_fix' then 'standard'
            when v_mod = 'standard_podea' and v_tr_mas = 'sub' then 'standard'
            else v_tr_mas end;
          v_suma_oc := case v_tr_oc when 'peste' then v_lei_peste when 'standard' then v_lei_std else 0 end;
          v_ocupare := jsonb_build_object(
            'banda', v_tr_oc, 'banda_masurata', v_tr_mas, 'mod', v_mod,
            'cursanti', v_cursanti, 'capacitate', v_cap,
            'procent', round(100.0 * v_cursanti / v_cap, 2),
            'prag_standard', v_pr_std, 'prag_peste', v_pr_peste,
            'lei_standard', v_lei_std * v_factor, 'lei_peste', v_lei_peste * v_factor,
            'suma', round(v_suma_oc * v_factor, 2));
        end if;
      end if;

      if v_nivel_pl = 'trupa' then v_nr_trupe := v_nr_trupe + 1; end if;

      if array_length(v_bl, 1) > 0 then
        v_suma := 0;
        v_blocante := v_blocante || to_jsonb(format('%s: %s.', v_c.numele, array_to_string(v_bl, '; ')));
      else
        v_suma := round(v_factor * (v_baza + coalesce(v_suma_ret, 0) + v_suma_oc), 2);
        v_t_baza := v_t_baza + v_baza * v_factor;
        v_t_ret := v_t_ret + coalesce(v_suma_ret, 0) * v_factor;
        v_t_oc := v_t_oc + v_suma_oc * v_factor;
      end if;

      v_grupe := v_grupe || jsonb_build_object(
        'curs_id', v_c.id, 'curs_nume', v_c.numele,
        'nivel_curs', v_c.nivelul, 'nivel_plata', v_nivel_pl,
        'sedinte_per_sapt', v_sedinte, 'factor', v_factor,
        'cursanti', v_cursanti, 'capacitate', v_c.capacitate_maxima,
        'baza', round(coalesce(v_baza, 0) * v_factor, 2),
        'retentie', v_retentie, 'ocupare', v_ocupare,
        'info', case when v_nivel_pl = 'trupa'
                     then jsonb_build_object('buget_deplasari_sezon', (v_par ->> 'buget_deplasari_sezon')::numeric) end,
        'blocant', case when array_length(v_bl, 1) > 0 then array_to_string(v_bl, '; ') end,
        'suma', v_suma);
    end loop;

  else
    -- ── Vara ──
    -- Prezențele: orice grupă a lui ținută în lună (Open și one-time nu), fără ½.
    select coalesce(jsonb_agg(jsonb_build_object(
             'curs_id', x.id, 'curs_nume', x.numele, 'nr', x.nr,
             'suma', x.nr * (v_par ->> 'lei_prezenta_vara')::numeric) order by x.numele), '[]'::jsonb),
           coalesce(sum(x.nr), 0)::int
      into v_prez, v_t_prez
    from (select c.id, c.numele, count(*)::int as nr
          from prezente p
          join enrollments e on e.id = p.enrollment
          join cursuri c on c.id = e.cursul
          where c.teacher = p_teacher
            and coalesce(c.stil, '') <> 'Open'
            and not coalesce(c.one_time, false)
            and p.status = 'Prezent'
            and p.data between v_m and v_m_fin
          group by c.id, c.numele) x;
    v_t_vara := v_t_prez * (v_par ->> 'lei_prezenta_vara')::numeric;

    -- Baza: grupele sezonului lung încheiat înainte de vară care trec testul de
    -- maturitate. Sezoanele scurte (vara e și ea „principal" în date) nu contează.
    select z.id, date_trunc('month', z.data_final)::date into v_sez_vara, v_ultima
    from sezoane z
    where z.data_final < v_m and z.data_final - z.data_incepere > 200
    order by z.data_final desc limit 1;
    v_sezon := v_sez_vara;

    for v_c in
      select c.id, c.numele, c.nivelul::text as nivelul, c.zile
      from cursuri c
      where c.sezon = v_sez_vara and c.teacher = p_teacher
        and coalesce(c.stil, '') <> 'Open' and not coalesce(c.one_time, false)
      order by c.numele
    loop
      v_bl := '{}';
      v_mat := _grupa_matura(v_c.id, v_par);
      continue when not coalesce((v_mat ->> 'matur')::boolean, false);

      v_sedinte := coalesce(array_length(v_c.zile, 1), 0);
      v_factor := case when v_sedinte = 1 then 0.5 else 1 end;
      -- Statutul de trupă pentru baza de vară: ultima lună a sezonului.
      v_cursanti := cursanti_platitori_luna(v_c.id, v_ultima);
      v_nivel_pl := case
        when v_c.nivelul = 'Incepator' then 'incepator'
        when v_c.nivelul in ('Intermediar', 'Avansat') then 'intermediar'
        when v_c.nivelul = 'Trupa' and v_rang = 'Expert'
             and v_cursanti >= (v_par ->> 'trupa_min_platitori')::int then 'trupa'
        when v_c.nivelul = 'Trupa' then 'trupa_ca_intermediar'
      end;
      v_col := case when v_nivel_pl is null then null
                    when v_nivel_pl = 'incepator' then 'Incepator'
                    when v_nivel_pl = 'trupa' then 'Trupa'
                    else 'Intermediar' end;
      if v_sedinte = 0 then v_bl := v_bl || 'orarul grupei nu are nicio zi'::text; end if;
      if v_c.nivelul is null then v_bl := v_bl || 'grupa n-are nivel'::text; end if;
      if v_rang is null then v_bl := v_bl || 'instructorul n-are rang'::text; end if;
      v_baza := (v_par -> 'baza' -> v_rang ->> v_col)::numeric;
      if v_baza is null and v_rang is not null and v_col is not null then
        v_bl := v_bl || format('grila n-are bază pentru %s × %s', v_rang, v_col);
      end if;

      if array_length(v_bl, 1) > 0 then
        v_suma := 0;
        v_blocante := v_blocante || to_jsonb(format('%s: %s.', v_c.numele, array_to_string(v_bl, '; ')));
      else
        v_suma := round(v_factor * v_baza, 2);
        v_t_baza := v_t_baza + v_suma;
      end if;

      v_grupe := v_grupe || jsonb_build_object(
        'curs_id', v_c.id, 'curs_nume', v_c.numele,
        'nivel_curs', v_c.nivelul, 'nivel_plata', v_nivel_pl,
        'sedinte_per_sapt', v_sedinte, 'factor', v_factor,
        'cursanti', v_cursanti, 'baza', round(coalesce(v_baza, 0) * v_factor, 2),
        'retentie', null, 'ocupare', null, 'maturitate', v_mat,
        'blocant', case when array_length(v_bl, 1) > 0 then array_to_string(v_bl, '; ') end,
        'suma', v_suma);
    end loop;
  end if;

  return jsonb_build_object(
    'versiune', 2,
    'teacher_id', p_teacher,
    'anul', p_anul,
    'luna', p_luna,
    'sezon_id', v_sezon,
    'rang', v_rang,
    'perioada', case when v_vara then 'vara' else 'sezon' end,
    'reguli', jsonb_build_object('parametri', v_par, 'mod_ocupare', v_mod),
    'grupe', v_grupe,
    'prezente_vara', v_prez,
    'linii_persoana', jsonb_build_array(
      jsonb_build_object('cheie', 'voucher', 'eticheta', 'Voucher clase Quasar',
                         'suma', (v_par ->> 'voucher_lunar')::numeric, 'tip', 'beneficiu'),
      jsonb_build_object('cheie', 'evenimente', 'eticheta', 'Evenimente de promovare',
                         'suma', 0, 'tip', 'bani', 'nota', 'neînregistrate încă')),
    'totaluri', jsonb_build_object(
      'baza', round(v_t_baza, 2), 'retentie', round(v_t_ret, 2), 'ocupare', round(v_t_oc, 2),
      'prezente_vara', v_t_vara, 'beneficii', (v_par ->> 'voucher_lunar')::numeric,
      'info_deplasari', v_nr_trupe * (v_par ->> 'buget_deplasari_sezon')::numeric),
    'total', round(v_t_baza + v_t_ret + v_t_oc + v_t_vara, 2),
    'total_prezente', v_t_prez,
    'blocante', v_blocante,
    -- Retenția, ocuparea și prezențele se numără pe toată luna.
    'provizoriu', v_azi <= v_m_fin,
    'final_la', v_m_fin::text
  );
end;
$$;

-- ── 3. Înghețarea ─────────────────────────────────────────────────────────────
alter table public.salarii_teacher
  add column if not exists reguli       jsonb,
  add column if not exists confirmat_de uuid references auth.users(id) on delete set null,
  add column if not exists confirmat_la timestamptz,
  add column if not exists corectat_la  timestamptz,
  add column if not exists nota         text;

-- Scrierea doar prin RPC (confirmare / corecție cu motiv). RLS-ul rămâne.
revoke all on public.salarii_teacher from anon;
revoke insert, update, delete, truncate, references, trigger on public.salarii_teacher from authenticated;
grant select on public.salarii_teacher to authenticated;

create or replace function public.confirma_salariu_teacher(
  p_teacher uuid,
  p_anul int,
  p_luna int,
  p_data_plata date default current_date
) returns salarii_teacher
language plpgsql
security definer
set search_path = public
as $$
declare
  v_calc jsonb;
  v_row  salarii_teacher;
begin
  if not is_admin() then
    raise exception 'Doar adminul poate confirma salarii' using errcode = '42501';
  end if;
  -- O lună confirmată nu se mai suprascrie: corecția cere motiv (corecteaza_salariu_teacher).
  if exists (select 1 from salarii_teacher where teacher = p_teacher and anul = p_anul and luna = p_luna) then
    raise exception 'Luna e deja confirmată. O corecție se face cu motiv, de către owner.'
      using errcode = '22023';
  end if;

  v_calc := calculeaza_salariu_teacher(p_teacher, p_anul, p_luna);
  if jsonb_array_length(coalesce(v_calc -> 'blocante', '[]'::jsonb)) > 0 then
    raise exception 'Nu se poate confirma: %',
      (select string_agg(b, ' ') from jsonb_array_elements_text(v_calc -> 'blocante') b)
      using errcode = '22023';
  end if;
  if coalesce((v_calc ->> 'provizoriu')::boolean, false) then
    raise exception 'Luna nu s-a încheiat — se poate confirma după %.', v_calc ->> 'final_la'
      using errcode = '22023';
  end if;

  insert into salarii_teacher (teacher, anul, luna, total, breakdown, status, data_plata,
                               reguli, confirmat_de, confirmat_la)
  values (p_teacher, p_anul, p_luna, (v_calc ->> 'total')::numeric, v_calc - 'reguli', 'platit',
          p_data_plata, v_calc -> 'reguli', auth.uid(), now())
  returning * into v_row;

  insert into audit_log (actor_id, actor_role, entity_type, entity_id, action, new_value)
  values (auth.uid(), auth_role(), 'salariu_teacher', v_row.id, 'confirm',
          jsonb_build_object('teacher', p_teacher, 'anul', p_anul, 'luna', p_luna, 'total', v_row.total));

  return v_row;
end;
$$;

revoke execute on function public.confirma_salariu_teacher(uuid, int, int, date) from anon, public;
grant execute on function public.confirma_salariu_teacher(uuid, int, int, date) to authenticated;

create or replace function public.corecteaza_salariu_teacher(
  p_teacher uuid,
  p_anul int,
  p_luna int,
  p_motiv text
) returns salarii_teacher
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old  salarii_teacher;
  v_calc jsonb;
  v_row  salarii_teacher;
begin
  if not is_owner() then
    raise exception 'Doar owner-ul poate corecta un salariu confirmat.' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_motiv, '')), '') is null then
    raise exception 'Motivul corecției e obligatoriu.' using errcode = '22023';
  end if;
  select * into v_old from salarii_teacher where teacher = p_teacher and anul = p_anul and luna = p_luna;
  if not found then
    raise exception 'Luna nu e confirmată.' using errcode = 'P0002';
  end if;

  v_calc := calculeaza_salariu_teacher(p_teacher, p_anul, p_luna);
  if jsonb_array_length(coalesce(v_calc -> 'blocante', '[]'::jsonb)) > 0 then
    raise exception 'Nu se poate corecta: %',
      (select string_agg(b, ' ') from jsonb_array_elements_text(v_calc -> 'blocante') b)
      using errcode = '22023';
  end if;

  insert into audit_log (actor_id, actor_role, entity_type, entity_id, action, old_value, new_value, reason)
  values (auth.uid(), auth_role(), 'salariu_teacher', v_old.id, 'update',
          jsonb_build_object('total', v_old.total, 'breakdown', v_old.breakdown, 'reguli', v_old.reguli),
          jsonb_build_object('total', (v_calc ->> 'total')::numeric), p_motiv);

  update salarii_teacher
     set total = (v_calc ->> 'total')::numeric,
         breakdown = v_calc - 'reguli',
         reguli = v_calc -> 'reguli',
         corectat_la = now(),
         nota = concat_ws(' · ', nota, p_motiv),
         updated = now()
   where id = v_old.id
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.corecteaza_salariu_teacher(uuid, int, int, text) from anon, public;
grant execute on function public.corecteaza_salariu_teacher(uuid, int, int, text) to authenticated;
