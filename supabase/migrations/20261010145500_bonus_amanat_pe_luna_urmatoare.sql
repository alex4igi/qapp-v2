-- Bonusurile verificate la finalul lunii următoare se plătesc cu salariul lunii următoare (Alex, 9 oct. 2026).
--
-- Cardul lunii M (manager / recepție) = ce se plătește pentru M: componentele lui M care se închid
-- odată cu luna, plus componentele lui M-1 care s-au închis abia la finalul lui M (bonusul pe
-- încasări al managerului, bonusul KPI pe luna următoare al recepției). În cardul lui M-1 ele rămân
-- vizibile ca „reportat", în afara totalului. Rândul confirmat stă tot pe luna lucrată (anul/luna = M-1);
-- `platit_in_luna` spune cu ce salariu a plecat.
-- Criteriul e `final_la` după ultima zi a lunii — nu `provizoriu`, ca împărțirea să fie aceeași
-- oricând deschizi luna.

create or replace function public._luna_ro(p_luna int)
returns text
language sql
immutable
set search_path = public
as $$
  select (array['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august',
                'septembrie', 'octombrie', 'noiembrie', 'decembrie'])[p_luna];
$$;

revoke execute on function public._luna_ro(int) from anon, public;

-- Ca înainte, plus `final_la` pe componentele confirmate (din calculul înghețat).
create or replace function public._staff_cu_confirmari(
  p_calc jsonb, p_user uuid, p_post text, p_anul int, p_luna int
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with live as (
    select c, ord from jsonb_array_elements(coalesce(p_calc -> 'componente', '[]'::jsonb)) with ordinality x(c, ord)
  ),
  conf as (
    select * from salarii_staff_componente s
    where s.user_id = p_user and s.post = p_post and s.anul = p_anul and s.luna = p_luna
  ),
  unite as (
    select coalesce(l.ord, 1000) as ord,
           case when cf.id is not null then
             jsonb_build_object('cheie', cf.componenta, 'eticheta', cf.eticheta, 'suma', cf.suma,
                                'stare', cf.stare, 'confirmat_la', cf.confirmat_la,
                                'platit_in_luna', cf.platit_in_luna, 'id', cf.id,
                                'final_la', coalesce(cf.detalii ->> 'final_la', l.c ->> 'final_la'))
           else
             l.c || jsonb_build_object('stare', case
               when (l.c ->> 'blocant') is not null then 'blocat'
               when coalesce((l.c ->> 'provizoriu')::boolean, false) then 'provizoriu'
               else 'de_confirmat' end)
           end as c
    from live l
    full join conf cf on cf.componenta = l.c ->> 'cheie'
  )
  select p_calc || jsonb_build_object(
    'componente', coalesce((select jsonb_agg(c order by ord) from unite), '[]'::jsonb),
    'total', coalesce((select sum((c ->> 'suma')::numeric) from unite), 0),
    'confirmat_tot', not exists (select 1 from unite where c ->> 'stare' not in ('confirmat', 'corectat')),
    'confirmat_partial', exists (select 1 from unite where c ->> 'stare' in ('confirmat', 'corectat')));
$$;

-- Cardul de plată al lunii M pentru un om, pe un post.
create or replace function public._staff_luna_platita(p_user uuid, p_post text, p_anul int, p_luna int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_m    date := make_date(p_anul, p_luna, 1);
  v_urm  date := (make_date(p_anul, p_luna, 1) + interval '1 month')::date;
  v_p    date := (make_date(p_anul, p_luna, 1) - interval '1 month')::date;
  v_py   int := extract(year from (make_date(p_anul, p_luna, 1) - interval '1 month'))::int;
  v_pm   int := extract(month from (make_date(p_anul, p_luna, 1) - interval '1 month'))::int;
  v_cur  jsonb;
  v_prev jsonb;
  v_comp jsonb;
begin
  v_cur := _staff_cu_confirmari(_calcul_salariu_staff(p_user, p_post, p_anul, p_luna),
                                p_user, p_post, p_anul, p_luna);

  select coalesce(jsonb_agg(
           case when coalesce((c ->> 'final_la')::date >= v_urm, false)
                then c || jsonb_build_object('stare', 'reportat', 'stare_reala', c ->> 'stare',
                                             'platit_cu', _luna_ro(extract(month from v_urm)::int))
                else c end
           order by ord), '[]'::jsonb)
    into v_comp
  from jsonb_array_elements(coalesce(v_cur -> 'componente', '[]'::jsonb)) with ordinality x(c, ord);

  -- Înainte de prima grilă (sept. 2026) nu există lună trecută de adus.
  if exists (select 1 from salarizare_grila g where g.post = p_post and g.valabil_de_la <= v_p) then
    v_prev := _staff_cu_confirmari(_calcul_salariu_staff(p_user, p_post, v_py, v_pm),
                                   p_user, p_post, v_py, v_pm);
    v_comp := v_comp || coalesce((
      select jsonb_agg(c || jsonb_build_object(
               'cheie', format('%s-%s:%s', v_py, v_pm, c ->> 'cheie'),
               'eticheta', (c ->> 'eticheta') || ' · ' || _luna_ro(v_pm),
               'din_anul', v_py, 'din_luna', v_pm)
             order by ord)
      from jsonb_array_elements(coalesce(v_prev -> 'componente', '[]'::jsonb)) with ordinality x(c, ord)
      where coalesce((c ->> 'final_la')::date >= v_m, false)), '[]'::jsonb);
  end if;

  -- Omul care a plecat după M-1 primește un card doar cu ce i-a rămas de încasat.
  return v_cur || jsonb_build_object(
    'titular_nume', coalesce(v_cur ->> 'titular_nume', v_prev ->> 'titular_nume'),
    'norma', coalesce(v_cur -> 'norma', v_prev -> 'norma'),
    'beneficii', coalesce(v_cur -> 'beneficii', '[]'::jsonb),
    'blocante', coalesce(v_cur -> 'blocante', '[]'::jsonb),
    'avertismente', coalesce(v_cur -> 'avertismente', '[]'::jsonb),
    'componente', v_comp,
    'total', coalesce((select sum((c ->> 'suma')::numeric) from jsonb_array_elements(v_comp) c
                       where c ->> 'stare' <> 'reportat'), 0),
    'confirmat_tot', not exists (select 1 from jsonb_array_elements(v_comp) c
                                 where c ->> 'stare' not in ('confirmat', 'corectat', 'reportat')),
    'confirmat_partial', exists (select 1 from jsonb_array_elements(v_comp) c
                                 where c ->> 'stare' in ('confirmat', 'corectat')));
end;
$$;

revoke execute on function public._staff_luna_platita(uuid, text, int, int) from anon, public, authenticated;
grant execute on function public._staff_luna_platita(uuid, text, int, int) to service_role;

-- Confirmarea lunii M: ce se închide odată cu M, plus ce a rămas din M-1 și s-a închis între timp.
-- Ce se închide abia după M nu se confirmă de aici — trece pe confirmarea lunii următoare.
create or replace function public.confirma_salariu_staff(
  p_user           uuid,
  p_post           text,
  p_anul           int,
  p_luna           int,
  p_platit_in_luna date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p        date := (make_date(p_anul, p_luna, 1) - interval '1 month')::date;
  v_l        record;
  v_calc     jsonb;
  v_c        jsonb;
  v_amanat   boolean;
  v_eti      text;
  v_titular  text;
  v_gasit    boolean := false;
  v_conf     jsonb := '[]'::jsonb;
  v_ramase   jsonb := '[]'::jsonb;
  v_blocate  jsonb := '[]'::jsonb;
  v_deja     jsonb := '[]'::jsonb;
begin
  if not is_admin() then
    raise exception 'Doar adminii pot confirma salarii.' using errcode = '42501';
  end if;

  for v_l in
    select y, m, propria from (values
      (extract(year from v_p)::int, extract(month from v_p)::int, false),
      (p_anul, p_luna, true)) v(y, m, propria)
  loop
    continue when not v_l.propria
              and not exists (select 1 from salarizare_grila g where g.post = p_post and g.valabil_de_la <= v_p);

    v_calc := _calcul_salariu_staff(p_user, p_post, v_l.y, v_l.m);
    if v_l.propria then
      v_titular := coalesce(v_calc ->> 'titular_nume', v_titular);
    else
      v_titular := v_calc ->> 'titular_nume';
    end if;

    for v_c in select * from jsonb_array_elements(coalesce(v_calc -> 'componente', '[]'::jsonb)) loop
      v_amanat := coalesce((v_c ->> 'final_la')::date >= (make_date(v_l.y, v_l.m, 1) + interval '1 month')::date, false);
      continue when not v_l.propria and not v_amanat;
      if v_l.propria and v_amanat then
        v_ramase := v_ramase || jsonb_build_object(
          'eticheta', format('%s (cu salariul din %s)', v_c ->> 'eticheta', _luna_ro(case when p_luna = 12 then 1 else p_luna + 1 end)),
          'final_la', null);
        continue;
      end if;

      v_gasit := true;
      v_eti := case when v_l.propria then v_c ->> 'eticheta' else (v_c ->> 'eticheta') || ' · ' || _luna_ro(v_l.m) end;
      if exists (select 1 from salarii_staff_componente s
                  where s.user_id = p_user and s.post = p_post and s.anul = v_l.y
                    and s.luna = v_l.m and s.componenta = v_c ->> 'cheie') then
        v_deja := v_deja || to_jsonb(v_eti);
      elsif (v_c ->> 'blocant') is not null then
        v_blocate := v_blocate || jsonb_build_object('eticheta', v_eti, 'motiv', v_c ->> 'blocant');
      elsif coalesce((v_c ->> 'provizoriu')::boolean, false) then
        v_ramase := v_ramase || jsonb_build_object('eticheta', v_eti, 'final_la', v_c ->> 'final_la');
      else
        insert into salarii_staff_componente (
          user_id, titular_nume, post, anul, luna, componenta, eticheta, suma,
          detalii, reguli, confirmat_de, platit_in_luna)
        values (
          p_user, coalesce(v_calc ->> 'titular_nume', '—'), p_post, v_l.y, v_l.m,
          v_c ->> 'cheie', v_c ->> 'eticheta', (v_c ->> 'suma')::numeric,
          v_c || jsonb_build_object('calcul', v_calc - 'reguli'),
          coalesce(v_calc -> 'reguli', '{}'::jsonb), auth.uid(), p_platit_in_luna);
        v_conf := v_conf || jsonb_build_object('eticheta', v_eti, 'suma', (v_c ->> 'suma')::numeric,
                                               'anul', v_l.y, 'luna', v_l.m);
      end if;
    end loop;
  end loop;

  if not v_gasit and jsonb_array_length(v_ramase) = 0 then
    raise exception 'Omul nu are salariu de % în luna asta.', p_post using errcode = '22023';
  end if;

  if jsonb_array_length(v_conf) > 0 then
    insert into audit_log (actor_id, actor_role, entity_type, entity_id, action, new_value)
    values (auth.uid(), auth_role(), 'salariu_staff', p_user, 'confirm',
            jsonb_build_object('post', p_post, 'anul', p_anul, 'luna', p_luna,
                               'titular', v_titular, 'confirmate', v_conf));
  end if;

  return jsonb_build_object('confirmate', v_conf, 'ramase', v_ramase,
                            'blocate', v_blocate, 'deja_confirmate', v_deja);
end;
$$;

revoke execute on function public.confirma_salariu_staff(uuid, text, int, int, date) from anon, public;
grant execute on function public.confirma_salariu_staff(uuid, text, int, int, date) to authenticated;

create or replace function public.get_salarizare_luna(p_anul int, p_luna int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_m      date := make_date(p_anul, p_luna, 1);
  v_p      date := (make_date(p_anul, p_luna, 1) - interval '1 month')::date;
  v_instr  jsonb := '[]'::jsonb;
  v_mgr    jsonb := '[]'::jsonb;
  v_rec    jsonb := '[]'::jsonb;
  v_t      record;
  v_calc   jsonb;
  v_snap   salarii_teacher;
  v_u      record;
begin
  if not is_admin() then
    raise exception 'Doar adminii văd salarizarea.' using errcode = '42501';
  end if;

  -- Instructorii: toți cei cu rang sau cu o lună confirmată; cei fără nicio
  -- grupă și fără prezențe de vară nu apar.
  for v_t in
    select t.id, t.auth_user_id, btrim(concat_ws(' ', t.prenume, t.nume)) as nume, t.nivelul::text as rang,
           t.in_afara_grilei
    from teacheri t
    where not coalesce(t.arhivat, false)
      and (t.nivelul is not null
           or exists (select 1 from salarii_teacher s where s.teacher = t.id and s.anul = p_anul and s.luna = p_luna))
    order by t.prenume, t.nume
  loop
    select * into v_snap from salarii_teacher s where s.teacher = v_t.id and s.anul = p_anul and s.luna = p_luna;
    if found then
      v_calc := v_snap.breakdown;
    else
      v_calc := calculeaza_salariu_teacher(v_t.id, p_anul, p_luna);
      continue when jsonb_array_length(coalesce(v_calc -> 'grupe', '[]'::jsonb)) = 0
                and jsonb_array_length(coalesce(v_calc -> 'prezente_vara', '[]'::jsonb)) = 0;
    end if;
    v_instr := v_instr || jsonb_build_object(
      'teacher_id', v_t.id, 'user_id', v_t.auth_user_id, 'nume', v_t.nume, 'rang', v_t.rang,
      'in_afara_grilei', v_t.in_afara_grilei,
      'nr_grupe', jsonb_array_length(coalesce(v_calc -> 'grupe', '[]'::jsonb)),
      'totaluri', v_calc -> 'totaluri',
      'total', coalesce((v_snap.total)::numeric, (v_calc ->> 'total')::numeric),
      'blocante', coalesce(v_calc -> 'blocante', '[]'::jsonb),
      'provizoriu', v_snap.id is null and coalesce((v_calc ->> 'provizoriu')::boolean, false),
      'final_la', v_calc ->> 'final_la',
      'confirmat', v_snap.id is not null,
      'data_plata', v_snap.data_plata);
  end loop;

  -- Managerii și recepția din M sau din M-1 (cine a plecat are de încasat bonusul amânat).
  for v_u in
    select distinct ml.user_id from manageri_locatii ml
    where ml.user_id is not null and ml.valabil_de_la <= v_m
      and (ml.valabil_pana_la is null or v_p < ml.valabil_pana_la)
  loop
    v_calc := _staff_luna_platita(v_u.user_id, 'manager', p_anul, p_luna);
    continue when jsonb_array_length(v_calc -> 'componente') = 0;
    v_mgr := v_mgr || (v_calc - 'reguli');
  end loop;

  for v_u in
    select distinct r.user_id from salarizare_receptie r
    where r.user_id is not null and r.valabil_de_la <= v_m
      and (r.valabil_pana_la is null or v_p < r.valabil_pana_la)
  loop
    v_calc := _staff_luna_platita(v_u.user_id, 'receptie', p_anul, p_luna);
    continue when jsonb_array_length(v_calc -> 'componente') = 0;
    v_rec := v_rec || (v_calc - 'reguli');
  end loop;

  -- Cine e în afara grilei apare în listă (orientativ), dar nu intră în totaluri.
  return jsonb_build_object(
    'anul', p_anul,
    'luna', p_luna,
    'instructori', v_instr,
    'manageri', v_mgr,
    'receptie', v_rec,
    'total_instructori', coalesce((select sum((x ->> 'total')::numeric) from jsonb_array_elements(v_instr) x
                                   where not (x ->> 'in_afara_grilei')::boolean), 0),
    'total_manageri', coalesce((select sum((x ->> 'total')::numeric) from jsonb_array_elements(v_mgr) x), 0),
    'total_receptie', coalesce((select sum((x ->> 'total')::numeric) from jsonb_array_elements(v_rec) x), 0),
    'beneficii', coalesce((select sum((x #>> '{totaluri,beneficii}')::numeric) from jsonb_array_elements(v_instr) x
                           where not (x ->> 'in_afara_grilei')::boolean), 0)
               + coalesce((select sum((b ->> 'suma')::numeric)
                           from jsonb_array_elements(v_rec) x, jsonb_array_elements(coalesce(x -> 'beneficii', '[]'::jsonb)) b), 0));
end;
$$;

revoke execute on function public.get_salarizare_luna(int, int) from anon, public;
grant execute on function public.get_salarizare_luna(int, int) to authenticated;

create or replace function public.get_salariul_meu_staff(p_anul int, p_luna int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_m   date := make_date(p_anul, p_luna, 1);
  v_p   date := (make_date(p_anul, p_luna, 1) - interval '1 month')::date;
  v_mgr jsonb;
  v_rec jsonb;
begin
  if v_uid is null or (select auth_role()) in ('parinte', 'marketing') then
    raise exception 'Doar echipa școlii își vede salariul aici.' using errcode = '42501';
  end if;
  if not _salariu_propriu_vizibil(v_uid, p_anul, p_luna) then
    raise exception 'Simularea unei luni apare după ce luna s-a încheiat.' using errcode = '22023';
  end if;

  if exists (select 1 from manageri_locatii ml
             where ml.user_id = v_uid and ml.valabil_de_la <= v_m
               and (ml.valabil_pana_la is null or v_p < ml.valabil_pana_la)) then
    v_mgr := _staff_luna_platita(v_uid, 'manager', p_anul, p_luna) - 'reguli';
    if jsonb_array_length(v_mgr -> 'componente') = 0 then v_mgr := null; end if;
  end if;

  if exists (select 1 from salarizare_receptie r
             where r.user_id = v_uid and r.valabil_de_la <= v_m
               and (r.valabil_pana_la is null or v_p < r.valabil_pana_la)) then
    v_rec := _staff_luna_platita(v_uid, 'receptie', p_anul, p_luna) - 'reguli';
    if jsonb_array_length(v_rec -> 'componente') = 0 then v_rec := null; end if;
  end if;

  return jsonb_build_object('anul', p_anul, 'luna', p_luna, 'manager', v_mgr, 'receptie', v_rec);
end;
$$;

revoke execute on function public.get_salariul_meu_staff(int, int) from anon, public;
grant execute on function public.get_salariul_meu_staff(int, int) to authenticated;
