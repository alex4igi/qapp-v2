-- Grila 2026-2027 activată pentru tot staff-ul (Alex, 7 oct. 2026): fiecare om își vede simularea
-- lunilor ÎNCHEIATE în „Salariul meu", adminul confirmă. Excepție: Bianca David, în afara grilei —
-- nu-și vede simularea, iar luna ei nu se confirmă din grilă (calculul rămâne la admin, orientativ).
--
-- 1. teacheri.in_afara_grilei (doar adminul îl schimbă — managerii au UPDATE pe teacheri).
-- 2. Instructorul își vede calculul doar pentru lunile încheiate și doar dacă e pe grilă.
-- 3. Managerul / recepția își văd calculul propriu, tot doar pentru lunile încheiate
--    (`get_salariul_meu_staff`); până acum îl vedeau doar adminii. Recepția are nevoie și de
--    raportul KPI al grilei ei (`calculeaza_raport_kpi`, până acum doar manager+).
-- 4. /salarizare marchează omul din afara grilei și nu-l pune în totaluri.
-- Gărzile se schimbă pe definiția live (ca 20261003210000); text negăsit = migrația se oprește.

alter table public.teacheri
  add column in_afara_grilei boolean not null default false;

comment on column public.teacheri.in_afara_grilei is
  'Salariul nu se calculează pe grila de salarizare: fără simulare în „Salariul meu", fără confirmare din grilă. Doar adminul îl schimbă.';

create or replace function public._garda_in_afara_grilei()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Fără claims = conexiune directă (migrații, scripturi de întreținere).
  if current_setting('request.jwt.claims', true) is null
     or is_admin()
     or coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return new;
  end if;
  if (tg_op = 'INSERT' and new.in_afara_grilei)
     or (tg_op = 'UPDATE' and new.in_afara_grilei is distinct from old.in_afara_grilei) then
    raise exception 'Doar adminii pot scoate un instructor din grila de salarizare.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public._garda_in_afara_grilei() from anon, public, authenticated;

create trigger trg_garda_in_afara_grilei
  before insert or update of in_afara_grilei on public.teacheri
  for each row execute function public._garda_in_afara_grilei();

-- Bianca David (în teacheri prenumele și numele sunt inversate, de aici id-ul).
update public.teacheri set in_afara_grilei = true
where id = '306234d0-5ef0-5a54-b552-8b565f35c6f8';

do $$
begin
  if (select count(*) from public.teacheri where in_afara_grilei) <> 1 then
    raise exception 'Bianca David nu a fost găsită în teacheri.';
  end if;
end $$;

-- Omul își vede propriul calcul doar după ce luna s-a încheiat (ora României).
create or replace function public._salariu_propriu_vizibil(p_user uuid, p_anul int, p_luna int)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(p_user = (select auth.uid()), false)
     and make_date(p_anul, p_luna, 1) + interval '1 month' <= (now() at time zone 'Europe/Bucharest')::date;
$$;

revoke execute on function public._salariu_propriu_vizibil(uuid, int, int) from anon, public, authenticated;

do $$
declare
  r     record;
  v_oid oid;
  v_def text;
begin
  for r in
    select fn, args, old, new from (values
    ('calculeaza_salariu_teacher', 'uuid, integer, integer',
     $o$or coalesce(p_teacher = my_teacher_id(), false)$o$,
     $n$or coalesce(p_teacher = my_teacher_id()
                and not (select t.in_afara_grilei from teacheri t where t.id = p_teacher)
                and _salariu_propriu_vizibil((select auth.uid()), p_anul, p_luna), false)$n$),
    ('confirma_salariu_teacher', 'uuid, integer, integer, date',
     $o$raise exception 'Doar adminul poate confirma salarii' using errcode = '42501';
  end if;$o$,
     $n$raise exception 'Doar adminul poate confirma salarii' using errcode = '42501';
  end if;
  if (select t.in_afara_grilei from teacheri t where t.id = p_teacher) then
    raise exception 'Instructorul e în afara grilei de salarizare: luna lui nu se confirmă din grilă.'
      using errcode = '22023';
  end if;$n$),
    ('calculeaza_salariu_manager', 'uuid, integer, integer',
     $o$if not (is_admin() or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then$o$,
     $n$if not (is_admin() or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
          or _salariu_propriu_vizibil(p_user, p_anul, p_luna)) then$n$),
    ('calculeaza_salariu_receptie', 'uuid, integer, integer',
     $o$if not is_admin() then
    raise exception 'Doar adminii văd salarizarea recepției.'$o$,
     $n$if not (is_admin() or _salariu_propriu_vizibil(p_user, p_anul, p_luna)) then
    raise exception 'Doar adminii văd salarizarea recepției.'$n$),
    -- Salariul recepției trece prin raportul KPI al grilei ei: titularul îl poate calcula pe al lui.
    ('calculeaza_raport_kpi', 'uuid, integer, integer',
     $o$if auth_role() not in ('owner','admin','manager') then$o$,
     $n$if auth_role() not in ('owner','admin','manager')
     and not exists (select 1 from kpi_grile g
                     where g.id = p_grila and _salariu_propriu_vizibil(g.titular_user, p_anul, p_luna)) then$n$)
    ) v(fn, args, old, new)
  loop
    v_oid := format('public.%I(%s)', r.fn, r.args)::regprocedure;
    v_def := pg_get_functiondef(v_oid);
    if position(r.old in v_def) = 0 then
      raise exception 'Garda din % nu arată cum mă așteptam.', r.fn;
    end if;
    execute replace(v_def, r.old, r.new);
  end loop;
end $$;

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

-- „Salariul meu" pentru manager / recepție: calculul propriu al unei luni încheiate, cu ce e deja
-- confirmat suprapus (aceeași formă ca un rând din /salarizare). Null pe postul pe care omul nu e.
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
               and (ml.valabil_pana_la is null or v_m < ml.valabil_pana_la)) then
    v_mgr := _staff_cu_confirmari(calculeaza_salariu_manager(v_uid, p_anul, p_luna),
                                  v_uid, 'manager', p_anul, p_luna) - 'reguli';
  end if;

  if exists (select 1 from salarizare_receptie r
             where r.user_id = v_uid and r.valabil_de_la <= v_m
               and (r.valabil_pana_la is null or v_m < r.valabil_pana_la)) then
    v_rec := _staff_cu_confirmari(calculeaza_salariu_receptie(v_uid, p_anul, p_luna),
                                  v_uid, 'receptie', p_anul, p_luna) - 'reguli';
  end if;

  return jsonb_build_object('anul', p_anul, 'luna', p_luna, 'manager', v_mgr, 'receptie', v_rec);
end;
$$;

revoke execute on function public.get_salariul_meu_staff(int, int) from anon, public;
grant execute on function public.get_salariul_meu_staff(int, int) to authenticated;
