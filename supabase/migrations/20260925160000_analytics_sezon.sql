-- /analytics, primul ecran: „ce se schimbă față de aceeași dată de anul trecut”.
-- Se aplică DUPĂ 20260925154812 și după ce `_inrolari_platite` a fost verificat
-- identic cu `_locuri_ocupate` (lunar 2024-09..2026-09 și zilnic în modul 30 de zile).

-- 1) `_locuri_ocupate` numără din nucleu. Semnătura, securitatea (invoker) și
--    drepturile rămân — o citesc cronul pragului minim, Overview, fișa cursului și
--    view-ul `lista_cursuri`, deci NU primește gard de rol.
create or replace function public._locuri_ocupate(
  p_de date,
  p_pana date,
  p_cursuri uuid[],
  p_sedinta_30_zile boolean
)
returns table(curs_id uuid, ocupate integer)
language sql
stable
set search_path to 'public'
as $function$
  select ip.curs_id, count(distinct ip.client)::int
  from _inrolari_platite(p_de, p_pana, p_cursuri, p_sedinta_30_zile) ip
  group by ip.curs_id;
$function$;

-- 2) Pragurile testelor de comparabilitate, într-un singur loc.
--    acoperire: % din cei prezenți la grupe recurente care au loc în lună. Sub el,
--      luna are înrolări lipsă (sept. 2025: 68%) și nu e bază de comparație.
--    fara_prezenta_pp: din 2026-2027 contractul creează rândurile până în iunie și
--      plecarea apare abia la reziliere; locurile fără prezență de 30 de zile erau
--      0,7% în nov. 2025. Peste +5 pp, comparația primește notă.
--    plata_in_luna_pp: diferența admisă între ani la ponderea banilor „Per lună”
--      plătiți în luna ratei (calendarul de plată).
create or replace function public._analytics_prag(p_test text)
returns numeric
language sql
immutable
set search_path to 'public'
as $function$
  select case p_test
    when 'acoperire' then 95
    when 'fara_prezenta_pp' then 5
    when 'plata_in_luna_pp' then 10
  end::numeric;
$function$;

-- T1: câți dintre cei prezenți la grupele recurente ale sezonului au loc în fereastră.
create or replace function public._analytics_acoperire(
  p_sezon uuid,
  p_de date,
  p_pana date,
  p_locatie uuid
)
returns numeric
language sql
stable
set search_path to 'public'
as $function$
  with prezenti as (
    select distinct p.client
    from prezente p
    join enrollments e on e.id = p.enrollment
    join cursuri c on c.id = e.cursul
    left join sali sa on sa.id = c.sala
    where p.status = 'Prezent'
      and p.client is not null
      and not coalesce(c.facultativ, false)
      and c.sezon = p_sezon
      and p.data between p_de and p_pana
      and (p_locatie is null or coalesce(c.locatie, sa.locatie) = p_locatie)
  ),
  cu_loc as (
    select distinct ip.client
    from _inrolari_platite(
      p_de, p_pana,
      array(select c.id from cursuri c where c.sezon = p_sezon and not coalesce(c.one_time, false)),
      false
    ) ip
  )
  select case when count(*) = 0 then null
              else round(100.0 * count(*) filter (where pr.client in (select cl.client from cu_loc cl)) / count(*), 1)
         end
  from prezenti pr;
$function$;

-- T2: locurile de la grupele date fără nicio prezență în ultimele 30 de zile.
create or replace function public._analytics_locuri_fara_prezenta(p_la date, p_cursuri uuid[])
returns table(locuri integer, fara_prezenta integer)
language sql
stable
set search_path to 'public'
as $function$
  select count(*)::int,
         (count(*) filter (where not exists (
           select 1
           from prezente p
           join enrollments e on e.id = p.enrollment
           where p.client = ip.client
             and e.cursul = ip.curs_id
             and p.status = 'Prezent'
             and p.data > p_la - 30
             and p.data <= p_la
         )))::int
  from _inrolari_platite(p_la, p_la, p_cursuri, true) ip;
$function$;

-- T3: ponderea banilor „Per lună” plătiți în luna ratei.
create or replace function public._analytics_plata_in_luna(p_de date, p_pana date, p_locatie uuid)
returns numeric
language sql
stable
set search_path to 'public'
as $function$
  select case when sum(i.suma) > 0
              then round(100.0 * sum(i.suma) filter (
                     where date_trunc('month', i.data) = date_trunc('month', e.data_incepere)) / sum(i.suma), 1)
         end
  from incasari i
  join enrollments e on e.id = i.inregistrare
  where e.tip_plata = 'Per luna'
    and i.data between p_de and p_pana
    and (p_locatie is null or i.locatie = p_locatie);
$function$;

-- 3) Indicatorii pentru o locație (sau tot clubul). Reperul e aceeași dată
--    calendaristică de anul trecut; fiecare indicator își are testele lui.
create or replace function public._analytics_indicatori(p_locatie uuid, p_cu_restante boolean)
returns jsonb
language plpgsql
stable
set search_path to 'public'
set plan_cache_mode to 'force_custom_plan'
as $function$
declare
  v_azi date := current_date;
  v_ref date := (current_date - interval '1 year')::date;
  v_sezon uuid;
  v_sezon_start date;
  v_sezon_final date;
  v_sezon_ref uuid;
  v_grupe uuid[];
  v_grupe_rec uuid[];
  v_cap int;
  v_grupe_ref uuid[];
  v_grupe_rec_ref uuid[];
  v_cap_ref int;
  v_fara_cap_ref int := 0;
  v_ocupate int;
  v_ocupate_ref int;
  v_cursanti int;
  v_cursanti_ref int;
  v_cu_rate int;
  v_t1_azi numeric;
  v_t1_ref numeric;
  v_t2_locuri int;
  v_t2_fara int;
  v_t2_locuri_ref int;
  v_t2_fara_ref int;
  v_t2_pct numeric;
  v_t2_pct_ref numeric;
  v_nota text;
  v_oameni_comp boolean := true;
  v_oameni_motiv text;
  v_ocup_comp boolean;
  v_ocup_motiv text;
  v_luna date;
  v_prima date;
  v_inc_de date;
  v_inc numeric;
  v_inc_ab numeric;
  v_inc_ref numeric;
  v_t3_azi numeric;
  v_t3_ref numeric;
  v_inc_comp boolean := true;
  v_inc_motiv text;
  v_rest jsonb;
  v_rest_suma numeric;
  v_rest_rate int;
  v_rest_clienti int;
  v_datornici uuid[];
  v_oneoff numeric;
  v_luna_rest numeric;
  v_luna_de_incasat numeric;
begin
  if not is_admin() then
    raise exception 'Acces refuzat.' using errcode = '42501';
  end if;

  select s.id, s.data_incepere, s.data_final
    into v_sezon, v_sezon_start, v_sezon_final
  from sezoane s where s.activ
  order by s.data_incepere desc nulls last limit 1;

  -- În iunie se suprapun sezonul școlar și cel de vară: reperul e cel mai lung.
  select s.id into v_sezon_ref
  from sezoane s
  where v_ref between s.data_incepere and s.data_final
  order by (s.data_final - s.data_incepere) desc
  limit 1;

  -- Grupele de azi = exact setul din get_ocupare_locatii (Overview).
  select array_agg(c.id),
         array_agg(c.id) filter (where not coalesce(c.facultativ, false)),
         coalesce(sum(c.capacitate_maxima), 0)::int
    into v_grupe, v_grupe_rec, v_cap
  from cursuri c
  left join sali sa on sa.id = c.sala
  where c.sezon = v_sezon
    and not coalesce(c.one_time, false)
    and coalesce(c.capacitate_maxima, 0) > 0
    and curs_activ_in_luna(c.id, v_azi)
    and coalesce(c.locatie, sa.locatie) is not null
    and (p_locatie is null or coalesce(c.locatie, sa.locatie) = p_locatie);

  select array_agg(c.id),
         array_agg(c.id) filter (where not coalesce(c.facultativ, false)),
         coalesce(sum(c.capacitate_maxima), 0)::int
    into v_grupe_ref, v_grupe_rec_ref, v_cap_ref
  from cursuri c
  left join sali sa on sa.id = c.sala
  where c.sezon = v_sezon_ref
    and not coalesce(c.one_time, false)
    and coalesce(c.capacitate_maxima, 0) > 0
    and curs_activ_in_luna(c.id, v_ref)
    and coalesce(c.locatie, sa.locatie) is not null
    and (p_locatie is null or coalesce(c.locatie, sa.locatie) = p_locatie);

  v_grupe := coalesce(v_grupe, '{}');
  v_grupe_rec := coalesce(v_grupe_rec, '{}');
  v_grupe_ref := coalesce(v_grupe_ref, '{}');
  v_grupe_rec_ref := coalesce(v_grupe_rec_ref, '{}');

  -- ── Ocupare și cursanți: aceeași regulă de loc (30 de zile pentru ședințe) ──
  select coalesce(sum(lo.ocupate), 0)::int into v_ocupate
  from locuri_ocupate(v_azi, v_azi, v_grupe) lo;
  select coalesce(sum(lo.ocupate), 0)::int into v_ocupate_ref
  from locuri_ocupate(v_ref, v_ref, v_grupe_ref) lo;

  select count(distinct ip.client)::int into v_cursanti
  from _inrolari_platite(v_azi, v_azi, v_grupe, true) ip;
  select count(distinct ip.client)::int into v_cursanti_ref
  from _inrolari_platite(v_ref, v_ref, v_grupe_ref, true) ip;

  -- T1 pe luna de azi (până azi) și pe luna de referință (întreagă).
  v_t1_azi := _analytics_acoperire(v_sezon, date_trunc('month', v_azi)::date, v_azi, p_locatie);
  if v_sezon_ref is not null then
    v_t1_ref := _analytics_acoperire(
      v_sezon_ref,
      date_trunc('month', v_ref)::date,
      (date_trunc('month', v_ref) + interval '1 month' - interval '1 day')::date,
      p_locatie);
  end if;

  -- T2 pe grupele recurente, azi și la referință.
  select x.locuri, x.fara_prezenta into v_t2_locuri, v_t2_fara
  from _analytics_locuri_fara_prezenta(v_azi, v_grupe_rec) x;
  select x.locuri, x.fara_prezenta into v_t2_locuri_ref, v_t2_fara_ref
  from _analytics_locuri_fara_prezenta(v_ref, v_grupe_rec_ref) x;
  v_t2_pct := case when v_t2_locuri > 0 then round(100.0 * v_t2_fara / v_t2_locuri, 1) end;
  v_t2_pct_ref := case when v_t2_locuri_ref > 0 then round(100.0 * v_t2_fara_ref / v_t2_locuri_ref, 1) end;

  if v_sezon_ref is null then
    v_oameni_comp := false; v_oameni_motiv := 'fara_sezon_ref';
  elsif v_t1_ref is null or v_t1_ref < _analytics_prag('acoperire') then
    v_oameni_comp := false; v_oameni_motiv := 'luna_ref_incompleta';
  elsif v_t1_azi is not null and v_t1_azi < _analytics_prag('acoperire') then
    v_oameni_comp := false; v_oameni_motiv := 'luna_curenta_incompleta';
  end if;

  if v_oameni_comp and v_t2_pct is not null
     and v_t2_pct - coalesce(v_t2_pct_ref, 0) > _analytics_prag('fara_prezenta_pp') then
    v_nota := 'locuri_fara_prezenta';
  end if;

  -- T4: grupele de referință cu locuri, dar fără capacitate, strică numitorul.
  if v_sezon_ref is not null then
    select count(*)::int into v_fara_cap_ref
    from cursuri c
    left join sali sa on sa.id = c.sala
    where c.sezon = v_sezon_ref
      and not coalesce(c.one_time, false)
      and coalesce(c.capacitate_maxima, 0) = 0
      and (p_locatie is null or coalesce(c.locatie, sa.locatie) = p_locatie)
      and exists (select 1 from _inrolari_platite(v_ref, v_ref, array[c.id], true));
  end if;
  v_ocup_comp := v_oameni_comp and v_fara_cap_ref = 0 and v_cap_ref > 0;
  v_ocup_motiv := case
    when not v_oameni_comp then v_oameni_motiv
    when v_fara_cap_ref > 0 or v_cap_ref = 0 then 'fara_capacitate_ref'
  end;

  -- ── Încasări: cumulat de la prima lună comparabilă a sezonului ────────────────
  if v_sezon_ref is not null then
    for v_luna in
      select gs::date
      from generate_series(date_trunc('month', v_sezon_start),
                           date_trunc('month', coalesce(v_sezon_final, v_azi)),
                           interval '1 month') gs
      where extract(month from gs) not in (7, 8)
    loop
      if coalesce(_analytics_acoperire(
           v_sezon_ref,
           (v_luna - interval '1 year')::date,
           (v_luna - interval '1 year' + interval '1 month' - interval '1 day')::date,
           p_locatie), 0) >= _analytics_prag('acoperire') then
        v_prima := v_luna;
        exit;
      end if;
    end loop;
  end if;

  if v_prima is not null and v_prima <= v_azi then
    v_inc_de := v_prima;
  else
    v_inc_de := date_trunc('month', v_azi)::date;
    v_inc_comp := false;
    v_inc_motiv := case when v_sezon_ref is null then 'fara_sezon_ref' else 'fereastra_viitoare' end;
  end if;

  select k.incasari into v_inc from get_kpis_financiar(v_inc_de, v_azi, p_locatie) k;
  select coalesce(sum(i.suma), 0) into v_inc_ab
  from incasari i
  where i.categorie = 'Abonament'
    and i.data between v_inc_de and v_azi
    and (p_locatie is null or i.locatie = p_locatie);

  if v_inc_comp then
    select k.incasari into v_inc_ref
    from get_kpis_financiar((v_inc_de - interval '1 year')::date, v_ref, p_locatie) k;
    v_t3_azi := _analytics_plata_in_luna(date_trunc('month', v_azi)::date, v_azi, p_locatie);
    v_t3_ref := _analytics_plata_in_luna(date_trunc('month', v_ref)::date, v_ref, p_locatie);
    if v_t3_azi is not null and v_t3_ref is not null
       and abs(v_t3_azi - v_t3_ref) > _analytics_prag('plata_in_luna_pp') then
      v_inc_comp := false; v_inc_motiv := 'calendar_plata';
    end if;
  end if;

  -- ── Restanțe scadente = lista /datorii → Restanțe pe rate (doar depășite) ─────
  if p_cu_restante then
    select coalesce(sum(w.rest), 0), count(*)::int, count(distinct w.client_id)::int,
           coalesce(array_agg(distinct w.client_id), '{}')
      into v_rest_suma, v_rest_rate, v_rest_clienti, v_datornici
    from get_restante_worklist_rate(p_locatie, null, null, null, true) w;

    select coalesce(sum(d.rest_oneoff), 0) into v_oneoff
    from get_datorii_dashboard(p_locatie) d;

    select coalesce(sum(r.rest), 0), coalesce(sum(r.de_incasat), 0)
      into v_luna_rest, v_luna_de_incasat
    from get_rata_restante(v_azi, p_locatie) r;

    select count(distinct ip.client)::int into v_cu_rate
    from _inrolari_platite(v_azi, v_azi, v_grupe, true) ip
    where ip.client = any(v_datornici);

    v_rest := jsonb_build_object(
      'suma', v_rest_suma,
      'rate', v_rest_rate,
      'clienti', v_rest_clienti,
      'oneoff', v_oneoff,
      'rest_luna', v_luna_rest,
      'de_incasat_luna', v_luna_de_incasat
    );
  end if;

  return jsonb_build_object(
    'azi', v_azi,
    'referinta', v_ref,
    'praguri', jsonb_build_object(
      'acoperire', _analytics_prag('acoperire'),
      'fara_prezenta_pp', _analytics_prag('fara_prezenta_pp'),
      'plata_in_luna_pp', _analytics_prag('plata_in_luna_pp')),
    'cursanti', jsonb_build_object(
      'valoare', v_cursanti,
      'cu_rate_scadente', v_cu_rate,
      'referinta', v_cursanti_ref,
      'comparabil', v_oameni_comp,
      'motiv', v_oameni_motiv,
      'nota', v_nota,
      'acoperire', v_t1_azi,
      'acoperire_ref', v_t1_ref,
      'fara_prezenta', v_t2_fara,
      'fara_prezenta_pct', v_t2_pct,
      'fara_prezenta_pct_ref', v_t2_pct_ref),
    'ocupare', jsonb_build_object(
      'ocupate', v_ocupate,
      'capacitate', v_cap,
      'ocupate_ref', v_ocupate_ref,
      'capacitate_ref', v_cap_ref,
      'comparabil', v_ocup_comp,
      'motiv', v_ocup_motiv,
      'nota', v_nota,
      'grupe_fara_capacitate_ref', v_fara_cap_ref),
    'incasari', jsonb_build_object(
      'de_la', v_inc_de,
      'valoare', coalesce(v_inc, 0),
      'abonamente', v_inc_ab,
      'ref_de_la', case when v_inc_comp then (v_inc_de - interval '1 year')::date end,
      'referinta', v_inc_ref,
      'comparabil', v_inc_comp,
      'motiv', v_inc_motiv,
      'prima_luna_comparabila', v_prima,
      'plata_in_luna', v_t3_azi,
      'plata_in_luna_ref', v_t3_ref),
    'restante', v_rest
  );
end;
$function$;

-- 4) RPC-ul primului ecran: indicatorii pentru selecție + (pe tot clubul) variația pe locații.
create or replace function public.get_analytics_sezon(p_locatie uuid default null)
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $function$
begin
  if not is_admin() then
    raise exception 'Acces refuzat.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'selectie', _analytics_indicatori(p_locatie, true),
    'locatii', case when p_locatie is null then (
      select jsonb_agg(
               jsonb_build_object('locatie_id', l.id, 'locatie_nume', l.nume)
               || _analytics_indicatori(l.id, false)
               order by l.nume)
      from locatii l
      where exists (
        select 1
        from cursuri c
        left join sali sa on sa.id = c.sala
        where coalesce(c.locatie, sa.locatie) = l.id
          and c.sezon = (select s.id from sezoane s where s.activ
                         order by s.data_incepere desc nulls last limit 1))
    ) end
  );
end;
$function$;

-- 5) Graficul: cursanți plătitori pe lună, sezonul curent vs cel de acum un an,
--    fără iulie–august. Luna în curs se numără până azi.
create or replace function public.get_cursanti_lunar(p_locatie uuid default null)
returns table(
  sezon_id uuid,
  sezon_nume text,
  luna date,
  cursanti integer,
  acoperire numeric,
  incomplet boolean,
  in_curs boolean
)
language plpgsql
stable
set search_path to 'public'
set plan_cache_mode to 'force_custom_plan'
as $function$
begin
  if not is_admin() then
    raise exception 'Acces refuzat.' using errcode = '42501';
  end if;

  return query
  with sez as (
    select s.id, s.numele_sezonului, s.data_incepere, s.data_final
    from sezoane s
    where s.id = (select s1.id from sezoane s1 where s1.activ
                  order by s1.data_incepere desc nulls last limit 1)
       or s.id = (select s2.id from sezoane s2
                  where (current_date - interval '1 year')::date between s2.data_incepere and s2.data_final
                  order by (s2.data_final - s2.data_incepere) desc limit 1)
  ),
  luni as (
    select z.id as sid, z.numele_sezonului as snume, gs::date as m,
           least((gs + interval '1 month' - interval '1 day')::date, current_date) as me
    from sez z,
         generate_series(date_trunc('month', z.data_incepere), date_trunc('month', z.data_final), interval '1 month') gs
    where extract(month from gs) not in (7, 8)
      and gs::date <= current_date
  ),
  calc as (
    select l.sid, l.snume, l.m,
      (select count(distinct ip.client)::int
       from _inrolari_platite(
         l.m, l.me,
         array(select c.id
               from cursuri c
               left join sali sa on sa.id = c.sala
               where c.sezon = l.sid
                 and not coalesce(c.one_time, false)
                 and coalesce(c.capacitate_maxima, 0) > 0
                 and curs_activ_in_luna(c.id, l.m)
                 and coalesce(c.locatie, sa.locatie) is not null
                 and (p_locatie is null or coalesce(c.locatie, sa.locatie) = p_locatie)),
         false) ip) as n,
      _analytics_acoperire(l.sid, l.m, l.me, p_locatie) as acop,
      l.m = date_trunc('month', current_date)::date as curenta
    from luni l
  )
  select c.sid, c.snume, c.m, c.n, c.acop,
         (c.acop is null and not c.curenta) or c.acop < _analytics_prag('acoperire'),
         c.curenta
  from calc c
  order by c.m;
end;
$function$;

-- Drepturi: invoker peste tot (RLS-ul rămâne în vigoare), fără anon. Doar cele
-- două RPC-uri expuse și `_analytics_indicatori` au gard owner/admin; ajutoarele
-- întorc doar procente agregate și trebuie să fie apelabile din lanțul invoker.
revoke all on function public._analytics_prag(text) from public, anon;
revoke all on function public._analytics_acoperire(uuid, date, date, uuid) from public, anon;
revoke all on function public._analytics_locuri_fara_prezenta(date, uuid[]) from public, anon;
revoke all on function public._analytics_plata_in_luna(date, date, uuid) from public, anon;
revoke all on function public._analytics_indicatori(uuid, boolean) from public, anon;
revoke all on function public.get_analytics_sezon(uuid) from public, anon;
revoke all on function public.get_cursanti_lunar(uuid) from public, anon;

grant execute on function public._analytics_prag(text) to authenticated, service_role;
grant execute on function public._analytics_acoperire(uuid, date, date, uuid) to authenticated, service_role;
grant execute on function public._analytics_locuri_fara_prezenta(date, uuid[]) to authenticated, service_role;
grant execute on function public._analytics_plata_in_luna(date, date, uuid) to authenticated, service_role;
grant execute on function public._analytics_indicatori(uuid, boolean) to authenticated, service_role;
grant execute on function public.get_analytics_sezon(uuid) to authenticated, service_role;
grant execute on function public.get_cursanti_lunar(uuid) to authenticated, service_role;
