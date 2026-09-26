-- Pagina /salarizare: toți oamenii din cele trei grile pe o lună, cu ce e deja
-- confirmat (înghețat) și ce e încă live. Doar owner/admin.
--
-- Regula de afișare: ce e confirmat se citește din snapshot (salarii_teacher,
-- salarii_staff_componente), niciodată recalculat — altfel o schimbare de normă
-- sau de grilă ar rescrie pe ecran o lună plătită.

-- Componentele live ale unui salariu de staff, cu cele confirmate suprapuse.
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
                                'platit_in_luna', cf.platit_in_luna, 'id', cf.id)
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

revoke execute on function public._staff_cu_confirmari(jsonb, uuid, text, int, int) from anon, public, authenticated;
grant execute on function public._staff_cu_confirmari(jsonb, uuid, text, int, int) to service_role;

create or replace function public.get_salarizare_luna(p_anul int, p_luna int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_m      date := make_date(p_anul, p_luna, 1);
  v_instr  jsonb := '[]'::jsonb;
  v_mgr    jsonb := '[]'::jsonb;
  v_rec    jsonb := '[]'::jsonb;
  v_t      record;
  v_calc   jsonb;
  v_snap   salarii_teacher;
  v_u      record;
begin
  if not is_admin() then
    raise exception 'Acces refuzat.' using errcode = '42501';
  end if;

  -- Instructorii: toți cei cu rang sau cu o lună confirmată; cei fără nicio
  -- grupă și fără prezențe de vară nu apar.
  for v_t in
    select t.id, t.auth_user_id, btrim(concat_ws(' ', t.prenume, t.nume)) as nume, t.nivelul::text as rang
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
      'nr_grupe', jsonb_array_length(coalesce(v_calc -> 'grupe', '[]'::jsonb)),
      'totaluri', v_calc -> 'totaluri',
      'total', coalesce((v_snap.total)::numeric, (v_calc ->> 'total')::numeric),
      'blocante', coalesce(v_calc -> 'blocante', '[]'::jsonb),
      'provizoriu', v_snap.id is null and coalesce((v_calc ->> 'provizoriu')::boolean, false),
      'final_la', v_calc ->> 'final_la',
      'confirmat', v_snap.id is not null,
      'data_plata', v_snap.data_plata);
  end loop;

  for v_u in
    select distinct ml.user_id from manageri_locatii ml
    where ml.user_id is not null and ml.valabil_de_la <= v_m
      and (ml.valabil_pana_la is null or v_m < ml.valabil_pana_la)
  loop
    v_calc := _staff_cu_confirmari(calculeaza_salariu_manager(v_u.user_id, p_anul, p_luna),
                                   v_u.user_id, 'manager', p_anul, p_luna);
    v_mgr := v_mgr || (v_calc - 'reguli');
  end loop;

  for v_u in
    select r.user_id from salarizare_receptie r
    where r.user_id is not null and r.valabil_de_la <= v_m
      and (r.valabil_pana_la is null or v_m < r.valabil_pana_la)
  loop
    v_calc := _staff_cu_confirmari(calculeaza_salariu_receptie(v_u.user_id, p_anul, p_luna),
                                   v_u.user_id, 'receptie', p_anul, p_luna);
    v_rec := v_rec || (v_calc - 'reguli');
  end loop;

  return jsonb_build_object(
    'anul', p_anul,
    'luna', p_luna,
    'instructori', v_instr,
    'manageri', v_mgr,
    'receptie', v_rec,
    'total_instructori', coalesce((select sum((x ->> 'total')::numeric) from jsonb_array_elements(v_instr) x), 0),
    'total_manageri', coalesce((select sum((x ->> 'total')::numeric) from jsonb_array_elements(v_mgr) x), 0),
    'total_receptie', coalesce((select sum((x ->> 'total')::numeric) from jsonb_array_elements(v_rec) x), 0),
    'beneficii', coalesce((select sum((x #>> '{totaluri,beneficii}')::numeric) from jsonb_array_elements(v_instr) x), 0)
               + coalesce((select sum((b ->> 'suma')::numeric)
                           from jsonb_array_elements(v_rec) x, jsonb_array_elements(coalesce(x -> 'beneficii', '[]'::jsonb)) b), 0));
end;
$$;

revoke execute on function public.get_salarizare_luna(int, int) from anon, public;
grant execute on function public.get_salarizare_luna(int, int) to authenticated;
