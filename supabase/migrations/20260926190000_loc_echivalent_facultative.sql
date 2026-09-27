-- Loc echivalent la grupele facultative (Alex, 26 sept. 2026): „nu e corect să dăm
-- pentru capacitate maximă când un client a venit o singură dată în acea lună".
--
-- Regula, pe grupă facultativă și perioadă:
--   abonatul (orice plată care nu e „Per sedinta") = 1 loc;
--   cine plătește pe ședință = ședințele lui / ședințele ținute, cel mult 1 loc.
-- Ședințele ținute = zilele din orar (fără vacanțele sezonului, fără lunile de
-- suspendare, doar în sezonul grupei), plus orice zi în care s-a plătit efectiv o
-- ședință. Se schimbă de la lună la lună: în luna cu vacanță o ședință cântărește mai
-- mult. Pe lună fereastra e luna; pe zi (Overview, liste) sunt ultimele 30 de zile.
-- Recurentele și trupele rămân pe un loc întreg per om (neschimbat).
--
-- Numărătoarea devine numeric (9,33 locuri), nu se rotunjește: pragurile de bonus și
-- de minim (8) se compară pe valoarea exactă. De aceea funcțiile care o întorc își
-- schimbă tipul (drop + create) și se refac drepturile lor, identic cu cele de azi.
-- Retenția rămâne pe oameni (_inrolari_platite) — de discutat separat.

-- ── Predicatul de rând plătit, o singură dată ────────────────────────────────
-- Același predicat ca _inrolari_platite (20260925154812), mutat aici; acea funcție
-- devine proiecția distinctă a acestor rânduri. `sfarsit` = ultima zi în care rândul
-- ține locul (reziliere inclusă).
create or replace function public._inrolari_platite_randuri(
  p_de date,
  p_pana date,
  p_cursuri uuid[],
  p_sedinta_30_zile boolean
)
returns table(client uuid, curs_id uuid, tip text, data_incepere date, sfarsit date)
language sql
stable
set search_path to 'public'
as $function$
  select x.client, x.cursul, x.tip, x.data_incepere, x.sfarsit
  from (
    select e.client, e.cursul, e.tip_plata::text as tip, e.data_incepere,
           least(
             case
               when e.tip_plata = 'Per sedinta' and p_sedinta_30_zile then e.data_incepere + 29
               when e.tip_plata = 'Per sedinta' then e.data_incepere
               else coalesce(e.data_final, 'infinity'::date)
             end,
             coalesce((e.data_reziliere::date - 1), 'infinity'::date)
           ) as sfarsit
    from enrollments e
    where e.cursul = any(p_cursuri)
      and e.client is not null
      and e.suma > 0
      -- Rezervarea OPEN anulată nu primește dată de reziliere și își păstrează
      -- suma. Nu se citește din `activ`: bifa se stinge și la închiderea sezonului,
      -- pe toate ședințele valide.
      and not (
        e.tip_plata = 'Per sedinta'
        and exists (select 1 from open_rezervari r
                    where r.enrollment = e.id and r.status = 'anulat')
      )
      and e.data_incepere <= p_pana
  ) x
  where x.sfarsit >= greatest(x.data_incepere, p_de);
$function$;

revoke all on function public._inrolari_platite_randuri(date, date, uuid[], boolean) from public, anon;
grant execute on function public._inrolari_platite_randuri(date, date, uuid[], boolean) to authenticated, service_role;

create or replace function public._inrolari_platite(
  p_de date,
  p_pana date,
  p_cursuri uuid[],
  p_sedinta_30_zile boolean
)
returns table(client uuid, curs_id uuid)
language sql
stable
set search_path to 'public'
as $function$
  select distinct r.client, r.curs_id
  from _inrolari_platite_randuri(p_de, p_pana, p_cursuri, p_sedinta_30_zile) r;
$function$;

-- ── Locul ponderat, pe (client, grupă) ──────────────────────────────────────
-- fel: 'loc' (recurentă / trupă), 'abonament' sau 'sedinte' (facultativă).
create or replace function public._locuri_ponderate(
  p_de date,
  p_pana date,
  p_cursuri uuid[],
  p_sedinta_30_zile boolean
)
returns table(client uuid, curs_id uuid, pondere numeric, fel text,
              sedinte_platite integer, sedinte_tinute integer)
language sql
stable
set search_path to 'public'
as $function$
  with grupe as (
    select c.id, coalesce(c.facultativ, false) as facultativ, c.zile::text[] as zile,
           c.sezon, z.data_incepere as sezon_de, z.data_final as sezon_pana
    from cursuri c
    left join sezoane z on z.id = c.sezon
    where c.id = any(p_cursuri)
  ),
  fac as (select array_agg(g.id) as ids from grupe g where g.facultativ),
  fer as (select case when p_sedinta_30_zile then p_de - 29 else p_de end as de),
  intregi as (
    select distinct r.client, r.curs_id
    from _inrolari_platite_randuri(p_de, p_pana,
                                   array(select g.id from grupe g where not g.facultativ),
                                   p_sedinta_30_zile) r
  ),
  -- Facultativele se citesc o dată, pe toată fereastra ședințelor; abonamentul
  -- trebuie să atingă perioada propriu-zisă, nu fereastra.
  rand_fac as (
    select r.*
    from _inrolari_platite_randuri((select de from fer), p_pana, (select ids from fac), false) r
  ),
  abonati as (
    select distinct r.client, r.curs_id
    from rand_fac r
    where r.tip <> 'Per sedinta' and r.sfarsit >= greatest(r.data_incepere, p_de)
  ),
  sedinte as (
    select distinct r.client, r.curs_id, r.data_incepere as zi
    from rand_fac r
    where r.tip = 'Per sedinta'
  ),
  orar as (
    select g.id as curs_id, d::date as zi
    from grupe g
    cross join fer
    cross join lateral generate_series(
      greatest(fer.de, coalesce(g.sezon_de, fer.de)),
      least(p_pana, coalesce(g.sezon_pana, p_pana)),
      interval '1 day') d
    where g.facultativ
      and (array['Luni','Marti','Miercuri','Joi','Vineri','Sambata','Duminica'])[extract(isodow from d)::int]
          = any(g.zile)
      and not exists (select 1 from vacante v
                      where v.sezon_id = g.sezon and d::date between v.data_incepere and v.data_final)
      and curs_activ_in_luna(g.id, d::date)
  ),
  tinute as (
    select x.curs_id, count(*)::int as n
    from (select o.curs_id, o.zi from orar o
          union
          select s.curs_id, s.zi from sedinte s) x
    group by x.curs_id
  ),
  pe_sedinta as (
    select s.client, s.curs_id, count(*)::int as n
    from sedinte s
    where not exists (select 1 from abonati a where a.client = s.client and a.curs_id = s.curs_id)
    group by s.client, s.curs_id
  )
  select i.client, i.curs_id, 1::numeric, 'loc'::text, null::int, null::int
  from intregi i
  union all
  select a.client, a.curs_id, 1::numeric, 'abonament', null::int, t.n
  from abonati a
  left join tinute t on t.curs_id = a.curs_id
  union all
  select p.client, p.curs_id, least(1, p.n::numeric / t.n), 'sedinte', p.n, t.n
  from pe_sedinta p
  join tinute t on t.curs_id = p.curs_id;
$function$;

revoke all on function public._locuri_ponderate(date, date, uuid[], boolean) from public, anon;
grant execute on function public._locuri_ponderate(date, date, uuid[], boolean) to authenticated, service_role;

-- ── Numărătoarea pe grupă devine numeric ────────────────────────────────────
drop view if exists public.lista_cursuri;
drop function if exists public.get_grupe_sub_minim(uuid, uuid);
drop function if exists public._grupe_sub_minim(uuid, uuid, date);
drop function if exists public.get_grad_ocupare(uuid);
drop function if exists public.get_ocupare_locatii();
drop function if exists public.get_ocupare_prime_time(uuid);
drop function if exists public.cursanti_platitori_luna(uuid, date);
drop function if exists public.locuri_ocupate_luna(date, uuid[]);
drop function if exists public.locuri_ocupate(date, date, uuid[]);
drop function if exists public._locuri_ocupate(date, date, uuid[], boolean);

create function public._locuri_ocupate(
  p_de date,
  p_pana date,
  p_cursuri uuid[],
  p_sedinta_30_zile boolean
)
returns table(curs_id uuid, ocupate numeric)
language sql
stable
set search_path to 'public'
as $function$
  select lp.curs_id, round(sum(lp.pondere), 2)
  from _locuri_ponderate(p_de, p_pana, p_cursuri, p_sedinta_30_zile) lp
  group by lp.curs_id;
$function$;

create function public.locuri_ocupate(p_de date, p_pana date, p_cursuri uuid[])
returns table(curs_id uuid, ocupate numeric)
language sql
stable
set search_path to 'public'
as $function$
  select * from _locuri_ocupate(p_de, p_pana, p_cursuri, true);
$function$;

create function public.locuri_ocupate_luna(p_luna date, p_cursuri uuid[])
returns table(curs_id uuid, ocupate numeric)
language sql
stable
set search_path to 'public'
as $function$
  select * from _locuri_ocupate(
    date_trunc('month', p_luna)::date,
    (date_trunc('month', p_luna) + interval '1 month' - interval '1 day')::date,
    p_cursuri,
    false
  );
$function$;

create function public.cursanti_platitori_luna(p_curs uuid, p_luna date)
returns numeric
language sql
stable
set search_path to 'public'
as $function$
  select coalesce((select lo.ocupate from locuri_ocupate_luna(p_luna, array[p_curs]) lo), 0);
$function$;

-- ── Funcțiile cu semnătură schimbată (definițiile live, doar tipul numărătorii) ──

CREATE OR REPLACE FUNCTION public._grupe_sub_minim(p_sezon uuid DEFAULT NULL::uuid, p_curs uuid DEFAULT NULL::uuid, p_la date DEFAULT CURRENT_DATE)
 RETURNS TABLE(curs_id uuid, curs_nume text, sala_nume text, teacher_nume text, minim integer, luna_lansare date, luni jsonb, luni_sub_consecutive integer, cursanti_luna_curenta numeric, stare text, sezon_in_curs boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with sezon_tinta as (
    select coalesce(
      p_sezon,
      (select id from sezoane where activ order by data_incepere desc nulls last limit 1)
    ) as id
  ),
  c as (
    select
      c.id,
      c.numele,
      sa.nume as sala_nume,
      nullif(btrim(concat_ws(' ', t.nume, t.prenume)), '') as teacher_nume,
      coalesce(sa.minim_cursanti, 8) as minim,
      greatest(
        date_trunc('month', s.data_incepere),
        date_trunc('month', c.created)
      )::date as lansare,
      date_trunc('month', s.data_final)::date as ultima_luna_sezon,
      (p_la between s.data_incepere and s.data_final) as in_curs,
      exists (
        select 1 from cursuri_suspendari cs
        where cs.curs = c.id and cs.pana_luna is null
      ) as are_suspendare
    from cursuri c
    join sezoane s on s.id = c.sezon
    left join sali sa on sa.id = c.sala
    left join teacheri t on t.id = c.teacher
    where (
            (p_curs is not null and c.id = p_curs)
            or (p_curs is null and c.sezon = (select id from sezon_tinta))
          )
      and coalesce(c.stil, '') <> 'Open'
      and not coalesce(c.one_time, false)
      and s.data_incepere is not null
      and s.data_final is not null
  ),
  m as (
    select
      c.id,
      gs::date as luna,
      curs_activ_in_luna(c.id, gs::date) as activ
    from c
    cross join lateral generate_series(
      (c.lansare + interval '1 month')::date,
      least(
        c.ultima_luna_sezon,
        (date_trunc('month', p_la) - interval '1 month')::date
      ),
      interval '1 month'
    ) gs
  ),
  mn as (
    select
      m.id,
      m.luna,
      m.activ,
      case when m.activ then cursanti_platitori_luna(m.id, m.luna) end as n
    from m
  ),
  mf as (
    select mn.*, (mn.activ and mn.n < c.minim) as sub
    from mn
    join c on c.id = mn.id
  ),
  agg as (
    select
      mf.id,
      jsonb_agg(
        jsonb_build_object(
          'luna', to_char(mf.luna, 'YYYY-MM'),
          'cursanti', mf.n,
          'activ', mf.activ,
          'sub', mf.sub
        )
        order by mf.luna
      ) as luni,
      count(*) filter (
        where mf.luna > coalesce(
          (select max(x.luna) from mf x where x.id = mf.id and not x.sub),
          '-infinity'::date
        )
      )::int as streak
    from mf
    group by mf.id
  )
  select
    c.id,
    c.numele,
    c.sala_nume,
    c.teacher_nume,
    c.minim,
    c.lansare,
    coalesce(agg.luni, '[]'::jsonb),
    coalesce(agg.streak, 0),
    case when c.in_curs
         then cursanti_platitori_luna(c.id, date_trunc('month', p_la)::date)
    end,
    case
      when c.are_suspendare then 'suspendat'
      when agg.id is null then 'in_rodaj'
      when agg.streak >= 3 then 'de_suspendat'
      when agg.streak >= 1 then 'in_observatie'
      else 'ok'
    end,
    c.in_curs
  from c
  left join agg on agg.id = c.id
  order by c.numele;
$function$;

CREATE OR REPLACE FUNCTION public.get_grupe_sub_minim(p_sezon uuid DEFAULT NULL::uuid, p_curs uuid DEFAULT NULL::uuid)
 RETURNS TABLE(curs_id uuid, curs_nume text, sala_nume text, teacher_nume text, minim integer, luna_lansare date, luni jsonb, luni_sub_consecutive integer, cursanti_luna_curenta numeric, stare text, sezon_in_curs boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Aceiași oameni care pot suspenda; decizia e a lor.
  if (select auth_role()) not in ('owner', 'admin', 'manager') then
    raise exception 'Doar managerii văd grupele sub minim.' using errcode = '42501';
  end if;
  return query select * from _grupe_sub_minim(p_sezon, p_curs, current_date);
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_grad_ocupare(p_locatie uuid DEFAULT NULL::uuid)
 RETURNS TABLE(curs_id uuid, curs_nume text, locatie_nume text, teacher_nume text, facultativ boolean, activi numeric, capacitate integer, procent numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with cursuri_scop as (
    select c.id, c.numele, coalesce(c.locatie, sa.locatie) as locatie, c.teacher,
           c.capacitate_maxima, c.facultativ
    from cursuri c
    left join sali sa on sa.id = c.sala
    where c.sezon = (select id from sezoane where activ order by data_incepere desc nulls last limit 1)
      and not coalesce(c.one_time, false)
      and curs_activ_in_luna(c.id, current_date)
      and (p_locatie is null or coalesce(c.locatie, sa.locatie) = p_locatie)
      and (
        (select auth_role()) <> 'teacher'
        or c.teacher = (select current_teacher_id())
        or exists (select 1 from cursuri_teacheri ct
                   where ct.curs_id = c.id and ct.teacher_id = (select current_teacher_id()))
      )
  ),
  locuri as (
    select lo.curs_id, lo.ocupate
    from locuri_ocupate(current_date, current_date, (select array_agg(id) from cursuri_scop)) lo
  )
  select
    cs.id,
    cs.numele,
    loc.nume,
    coalesce(
      (select t.nume from teacheri t where t.id = cs.teacher),
      (select t.nume from cursuri_teacheri ct join teacheri t on t.id = ct.teacher_id
        where ct.curs_id = cs.id order by case when ct.rol = 'titular' then 0 else 1 end limit 1)
    ),
    coalesce(cs.facultativ, false),
    coalesce(lo.ocupate, 0),
    cs.capacitate_maxima,
    case when cs.capacitate_maxima > 0
         then round(100.0 * coalesce(lo.ocupate, 0) / cs.capacitate_maxima, 0)
    end
  from cursuri_scop cs
  left join locuri lo on lo.curs_id = cs.id
  left join locatii loc on loc.id = cs.locatie;
$function$;

CREATE OR REPLACE FUNCTION public.get_ocupare_locatii()
 RETURNS TABLE(locatie_id uuid, locatie_nume text, ocupate numeric, capacitate integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with grupe as (
    select c.id, coalesce(c.locatie, sa.locatie) as locatie, c.capacitate_maxima as cap
    from cursuri c
    left join sali sa on sa.id = c.sala
    where c.sezon = (select id from sezoane where activ order by data_incepere desc nulls last limit 1)
      and not coalesce(c.one_time, false)
      and coalesce(c.capacitate_maxima, 0) > 0
      and curs_activ_in_luna(c.id, current_date)
  ),
  locuri as (
    select lo.curs_id, lo.ocupate
    from locuri_ocupate(current_date, current_date, (select array_agg(id) from grupe)) lo
  )
  select l.id, l.nume, coalesce(sum(lo.ocupate), 0), sum(g.cap)::int
  from grupe g
  join locatii l on l.id = g.locatie
  left join locuri lo on lo.curs_id = g.id
  group by l.id, l.nume
  order by sum(g.cap) desc, l.nume;
$function$;

CREATE OR REPLACE FUNCTION public.get_ocupare_prime_time(p_locatie uuid DEFAULT NULL::uuid)
 RETURNS TABLE(slot text, grupe integer, activi numeric, capacitate integer, procent numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with cs as (
    select c.id, c.capacitate_maxima,
      case
        when c.ora is null or c.ora !~ '^[0-9]{1,2}:[0-9]{2}' then 'Fără oră'
        when (c.ora)::time >= time '17:00' and (c.ora)::time < time '20:00' then 'Prime-time 17-20'
        when (c.ora)::time < time '17:00' then 'Zi (<17)'
        else 'Seară (>=20)'
      end as slot
    from cursuri c
    left join sali sa on sa.id = c.sala
    where c.sezon = (select id from sezoane where activ order by data_incepere desc nulls last limit 1)
      and not coalesce(c.one_time, false)
      and coalesce(c.capacitate_maxima, 0) > 0
      and curs_activ_in_luna(c.id, current_date)
      and (p_locatie is null or coalesce(c.locatie, sa.locatie) = p_locatie)
  ),
  act as (
    select lo.curs_id, lo.ocupate
    from locuri_ocupate(current_date, current_date, (select array_agg(id) from cs)) lo
  )
  select cs.slot,
         count(*)::int as grupe,
         coalesce(sum(a.ocupate), 0) as activi,
         coalesce(sum(cs.capacitate_maxima), 0)::int as capacitate,
         case when sum(cs.capacitate_maxima) > 0
              then round(100.0 * coalesce(sum(a.ocupate), 0) / sum(cs.capacitate_maxima), 0)
         end as procent
  from cs
  left join act a on a.curs_id = cs.id
  group by cs.slot
  order by case cs.slot
             when 'Prime-time 17-20' then 0
             when 'Zi (<17)' then 1
             when 'Seară (>=20)' then 2
             else 3 end;
$function$;

-- ── Consumatorii: variabilele de numărătoare devin numeric ──

CREATE OR REPLACE FUNCTION public._grupa_matura(p_curs uuid, p_par jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_n       numeric;
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
$function$;

CREATE OR REPLACE FUNCTION public.calculeaza_salariu_teacher(p_teacher uuid, p_anul integer, p_luna integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_cursanti   numeric;
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

    -- Locurile lunii (la facultative, echivalente: abonat = 1, ședința = 1 / ședințele
    -- lunii) și retenția, pentru toate grupele deodată. Retenția rămâne pe oameni.
    select coalesce(jsonb_object_agg(curs_id, jsonb_build_object(
             'n', n, 'abonati', abonati, 'din_sedinte', din_sedinte,
             'oameni_pe_sedinta', oameni_pe_sedinta, 'sedinte_platite', sedinte_platite,
             'sedinte_luna', sedinte_luna)), '{}'::jsonb) into v_n_m
    from (select lp.curs_id,
                 round(sum(lp.pondere), 2) as n,
                 count(*) filter (where lp.fel = 'abonament')::int as abonati,
                 round(coalesce(sum(lp.pondere) filter (where lp.fel = 'sedinte'), 0), 2) as din_sedinte,
                 count(*) filter (where lp.fel = 'sedinte')::int as oameni_pe_sedinta,
                 coalesce(sum(lp.sedinte_platite) filter (where lp.fel = 'sedinte'), 0)::int as sedinte_platite,
                 max(lp.sedinte_tinute) as sedinte_luna
          from _locuri_ponderate(v_m, v_m_fin, v_ids, false) lp group by lp.curs_id) x;

    select coalesce(jsonb_object_agg(curs_id, jsonb_build_object('n', n, 'pastrati', k)), '{}'::jsonb)
      into v_ret
    from (select pp.curs_id, count(*)::int as n, count(pm.client)::int as k
          from _inrolari_platite(v_prev, v_prev_fin, v_ids, false) pp
          left join _inrolari_platite(v_m, v_m_fin, v_ids, false) pm
                 on pm.curs_id = pp.curs_id and pm.client = pp.client
          group by pp.curs_id) x;

    for v_c in
      select c.id, c.numele, c.nivelul::text as nivelul, c.zile, c.capacitate_maxima,
             coalesce(c.facultativ, false) as facultativ
      from cursuri c where c.id = any(v_ids) order by c.numele
    loop
      v_bl := '{}';
      v_sedinte := coalesce(array_length(v_c.zile, 1), 0);
      v_factor := case when v_sedinte = 1 then 0.5 else 1 end;
      if v_sedinte = 0 then v_bl := v_bl || 'orarul grupei nu are nicio zi'::text; end if;
      v_cursanti := coalesce((v_n_m -> v_c.id::text ->> 'n')::numeric, 0);

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
        'loc_echivalent', case when v_c.facultativ
                               then coalesce(v_n_m -> v_c.id::text, jsonb_build_object('n', 0)) end,
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
$function$;

CREATE OR REPLACE FUNCTION public.calculeaza_salariu_manager(p_user uuid, p_anul integer, p_luna integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_m          date := make_date(p_anul, p_luna, 1);
  v_m1         date := (make_date(p_anul, p_luna, 1) + interval '1 month')::date;
  v_azi        date := (now() at time zone 'Europe/Bucharest')::date;
  v_par        jsonb;
  v_vara       boolean;
  v_nume       text;
  v_locs       uuid[];
  v_n          int;
  v_baza       numeric := 0;
  v_sezon      uuid;
  v_mod        text;
  v_loc        record;
  v_r          jsonb;
  v_rata       numeric;
  v_tr_inc     text;
  v_proc       numeric;
  v_bonus_inc  numeric;
  v_prov_inc   boolean;
  v_ids        uuid[];
  v_locuri     numeric;
  v_cap        int;
  v_nr_pool    int;
  v_lipsa      jsonb;
  v_pct        numeric;
  v_tr_mas     text;
  v_tr_oc      text;
  v_lei        numeric;
  v_bonus_oc   numeric;
  v_bl_oc      text;
  v_locatii    jsonb := '[]'::jsonb;
  v_comp       jsonb := '[]'::jsonb;
  v_total      numeric := 0;
  v_prov       boolean := false;
  v_blocante   jsonb := '[]'::jsonb;
  v_avert      jsonb := '[]'::jsonb;
begin
  if not (is_admin() or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then
    raise exception 'Acces refuzat.' using errcode = '42501';
  end if;

  v_par := _salarizare_parametri('manager', v_m);
  v_vara := exists (select 1 from jsonb_array_elements_text(v_par -> 'luni_vara') x where x::int = p_luna);

  select array_agg(ml.locatie_id order by ml.locatie_id), min(ml.titular_nume)
    into v_locs, v_nume
  from manageri_locatii ml
  where ml.user_id = p_user
    and ml.valabil_de_la <= v_m
    and (ml.valabil_pana_la is null or v_m < ml.valabil_pana_la);

  v_n := coalesce(array_length(v_locs, 1), 0);
  if v_n = 0 then
    return jsonb_build_object('user_id', p_user, 'anul', p_anul, 'luna', p_luna,
                              'manager', false, 'total', 0, 'locatii', '[]'::jsonb,
                              'componente', '[]'::jsonb);
  end if;

  -- Baza: 12 luni pe an.
  if v_n > jsonb_array_length(v_par -> 'baza_pe_nr_locatii') then
    v_blocante := v_blocante || to_jsonb(format(
      '%s locații — grila are bază doar până la %s.', v_n, jsonb_array_length(v_par -> 'baza_pe_nr_locatii')));
  else
    v_baza := (v_par -> 'baza_pe_nr_locatii' ->> (v_n - 1))::numeric;
  end if;
  v_total := v_baza;
  v_comp := v_comp || jsonb_build_object(
    'cheie', 'baza', 'eticheta', format('Bază (%s %s)', v_n, case when v_n = 1 then 'locație' else 'locații' end),
    'suma', v_baza, 'provizoriu', false,
    'blocant', case when v_n > jsonb_array_length(v_par -> 'baza_pe_nr_locatii') then 'bază lipsă în grilă' end);

  -- Vara: doar baza (bonusurile de vară sunt nedefinite).
  if not v_vara then
    v_sezon := _sezon_lunii(v_m);
    v_mod := _mod_ocupare('manager', v_m);
    if v_sezon is null then
      v_blocante := v_blocante || to_jsonb('Nu există sezon pentru luna asta.'::text);
    end if;

    for v_loc in select l.id, l.nume from locatii l where l.id = any(v_locs) order by l.nume loop
      -- ── Încasare ──
      v_r := kpi_rata_incasare(array[v_loc.id], p_anul, p_luna);
      v_rata := (v_r ->> 'valoare')::numeric;
      v_proc := 0;
      if v_rata is null then
        v_tr_inc := 'na';
        v_avert := v_avert || to_jsonb(format('%s: nicio rată scadentă în lună — bonusul pe încasări e 0.', v_loc.nume));
      elsif v_rata >= (v_par #>> '{incasare,peste,de_la}')::numeric then
        v_tr_inc := 'peste'; v_proc := (v_par #>> '{incasare,peste,procent}')::numeric;
      elsif v_rata >= (v_par #>> '{incasare,standard,de_la}')::numeric then
        v_tr_inc := 'standard'; v_proc := (v_par #>> '{incasare,standard,procent}')::numeric;
      elsif v_rata >= (v_par #>> '{incasare,sub,de_la}')::numeric then
        v_tr_inc := 'sub'; v_proc := (v_par #>> '{incasare,sub,procent}')::numeric;
      else
        v_tr_inc := 'insuficient';
      end if;
      v_bonus_inc := round((v_r ->> 'incasari_luna')::numeric * v_proc / 100, 2);
      v_prov_inc := coalesce((v_r ->> 'provizoriu')::boolean, false);
      v_prov := v_prov or v_prov_inc;

      -- ── Ocupare ──
      -- Locuri: grupele sezonului de la locație, lansate și nesuspendate în M
      -- (trupe, facultative și Open intră; one-time nu). Capacitatea: pool-ul fixat.
      -- La facultative locul e echivalent (abonat = 1, ședința = 1 / ședințele lunii).
      select array_agg(c.id) into v_ids
      from cursuri c
      join sezoane z on z.id = c.sezon
      left join sali s on s.id = c.sala
      where c.sezon = v_sezon
        and not coalesce(c.one_time, false)
        and coalesce(c.locatie, s.locatie) = v_loc.id
        and greatest(date_trunc('month', z.data_incepere), date_trunc('month', c.created))::date <= v_m
        and curs_activ_in_luna(c.id, v_m);
      v_ids := coalesce(v_ids, '{}'::uuid[]);

      select coalesce(sum(lo.ocupate), 0) into v_locuri from locuri_ocupate_luna(v_m, v_ids) lo;
      select coalesce(sum(p.capacitate), 0)::int, count(*)::int into v_cap, v_nr_pool
      from capacitate_pool p
      where p.sezon_id = v_sezon and p.locatie_id = v_loc.id and p.din_luna <= v_m and not p.exclus;

      select coalesce(jsonb_agg(c.numele order by c.numele), '[]'::jsonb) into v_lipsa
      from cursuri c
      where c.id = any(v_ids)
        and not exists (select 1 from capacitate_pool p where p.sezon_id = v_sezon and p.curs_id = c.id);

      v_bl_oc := null;
      if jsonb_array_length(v_lipsa) > 0 then
        v_bl_oc := format('grupe active care lipsesc din pool-ul de capacitate: %s',
                          (select string_agg(x, ', ') from jsonb_array_elements_text(v_lipsa) x));
      elsif v_cap = 0 then
        v_bl_oc := 'pool-ul de capacitate e gol';
      end if;

      v_pct := case when v_cap > 0 then round(100.0 * v_locuri / v_cap, 2) end;
      v_tr_mas := case
        when v_pct is null then 'na'
        when v_pct >= (v_par #>> '{ocupare,peste,de_la}')::numeric then 'peste'
        when v_pct >= (v_par #>> '{ocupare,standard,de_la}')::numeric then 'standard'
        when v_pct >= (v_par #>> '{ocupare,sub,de_la}')::numeric then 'sub'
        else 'insuficient' end;
      v_tr_oc := case
        when v_mod = 'standard_fix' then 'standard'
        when v_mod = 'standard_podea' and v_tr_mas in ('na', 'insuficient', 'sub') then 'standard'
        else v_tr_mas end;
      v_lei := case v_tr_oc
        when 'peste' then (v_par #>> '{ocupare,peste,lei}')::numeric
        when 'standard' then (v_par #>> '{ocupare,standard,lei}')::numeric
        when 'sub' then (v_par #>> '{ocupare,sub,lei}')::numeric
        else 0 end;
      v_bonus_oc := case when v_bl_oc is null then round(v_locuri * v_lei, 2) else 0 end;
      if v_bl_oc is not null then
        v_blocante := v_blocante || to_jsonb(format('%s: %s.', v_loc.nume, v_bl_oc));
      end if;

      v_total := v_total + v_bonus_inc + v_bonus_oc;

      v_locatii := v_locatii || jsonb_build_object(
        'locatie_id', v_loc.id,
        'locatie_nume', v_loc.nume,
        'incasare', jsonb_build_object(
          'scadent', (v_r ->> 'numitor')::numeric,
          'platit', (v_r ->> 'numarator')::numeric,
          'nr_rate', (v_r ->> 'nr_inrolari')::int,
          'rata', v_rata,
          'treapta', v_tr_inc,
          'procent', v_proc,
          'incasari_luna', (v_r ->> 'incasari_luna')::numeric,
          'bonus', v_bonus_inc,
          'provizoriu', v_prov_inc,
          'final_la', v_r ->> 'final_la'),
        'ocupare', jsonb_build_object(
          'locuri', v_locuri,
          'capacitate', v_cap,
          'grupe_active', coalesce(array_length(v_ids, 1), 0),
          'grupe_in_pool', v_nr_pool,
          'procent', v_pct,
          'treapta_masurata', v_tr_mas,
          'treapta', v_tr_oc,
          'mod', v_mod,
          'lei_pe_loc', v_lei,
          'bonus', v_bonus_oc,
          'grupe_lipsa_din_pool', v_lipsa));

      v_comp := v_comp
        || jsonb_build_object('cheie', 'bonus_incasari:' || v_loc.id,
             'eticheta', 'Bonus încasări · ' || v_loc.nume, 'suma', v_bonus_inc,
             'provizoriu', v_prov_inc, 'final_la', v_r ->> 'final_la', 'blocant', null)
        || jsonb_build_object('cheie', 'bonus_ocupare:' || v_loc.id,
             'eticheta', 'Bonus ocupare · ' || v_loc.nume, 'suma', v_bonus_oc,
             -- Locurile se numără pe toată luna: definitiv după ce luna s-a încheiat.
             'provizoriu', v_azi < v_m1, 'final_la', (v_m1 - 1)::text, 'blocant', v_bl_oc);
    end loop;
  end if;

  return jsonb_build_object(
    'user_id', p_user,
    'titular_nume', v_nume,
    'manager', true,
    'anul', p_anul,
    'luna', p_luna,
    'perioada', case when v_vara then 'vara' else 'sezon' end,
    'reguli', jsonb_build_object('parametri', v_par, 'mod_ocupare', v_mod, 'sezon_id', v_sezon),
    'baza', jsonb_build_object('nr_locatii', v_n, 'suma', v_baza),
    'locatii', v_locatii,
    'componente', v_comp,
    'total', v_total,
    'provizoriu', v_prov or (not v_vara and v_azi < v_m1),
    'blocante', v_blocante,
    'avertismente', v_avert);
end;
$function$;

CREATE OR REPLACE FUNCTION public._analytics_indicatori(p_locatie uuid, p_cu_restante boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
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
  v_ocupate numeric;
  v_ocupate_ref numeric;
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
  select coalesce(sum(lo.ocupate), 0) into v_ocupate
  from locuri_ocupate(v_azi, v_azi, v_grupe) lo;
  select coalesce(sum(lo.ocupate), 0) into v_ocupate_ref
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

CREATE OR REPLACE FUNCTION public.notifica_grupe_peste_capacitate()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  g           record;
  v_recipient uuid;
  v_prag      text;
  v_count     int := 0;
  v_procent   int;
begin
  for g in
    with grupe as (
      select c.id, c.numele, c.capacitate_maxima as cap, coalesce(c.facultativ, false) as facultativ,
             sa.nume as sala_nume
      from cursuri c
      left join sali sa on sa.id = c.sala
      where c.sezon = (select id from sezoane where activ order by data_incepere desc nulls last limit 1)
        and not coalesce(c.one_time, false)
        and coalesce(c.capacitate_maxima, 0) > 0
        and curs_activ_in_luna(c.id, current_date)
    )
    select gr.id, gr.numele, gr.cap, gr.facultativ, gr.sala_nume, lo.ocupate
    from grupe gr
    join locuri_ocupate(current_date, current_date, (select array_agg(id) from grupe)) lo
      on lo.curs_id = gr.id
    where lo.ocupate >= gr.cap
  loop
    v_prag := case when g.ocupate > g.cap then 'peste' else 'plina' end;

    -- „Peste" acoperă și „plină": după ce s-a anunțat depășirea, umplerea nu mai
    -- e o noutate.
    if exists (
      select 1 from notifications
      where kind = 'grupa_peste_capacitate'
        and payload->>'curs_id' = g.id::text
        and (payload->>'prag' = v_prag or payload->>'prag' = 'peste')
    ) then
      continue;
    end if;

    v_procent := round(100.0 * g.ocupate / g.cap);

    for v_recipient in
      select id from auth.users
      where raw_app_meta_data->>'role' in ('owner', 'admin', 'manager')
    loop
      insert into notifications (
        recipient_user_id, kind, title, body, payload, requires_action, status
      ) values (
        v_recipient,
        'grupa_peste_capacitate',
        case when v_prag = 'peste'
             then format('Grupă peste capacitate: %s (%s%%)', g.numele, v_procent)
             else format('Grupă plină: %s', g.numele) end,
        format(
          '%s · %s din %s locuri ocupate.%s',
          coalesce(g.sala_nume, 'fără sală'),
          replace(trim_scale(g.ocupate)::text, '.', ','),
          g.cap,
          case
            when g.facultativ
              then ' Cursul e facultativ: abonații plus, în medie, cei veniți pe ședință în ultimele 30 de zile.'
            when v_prag = 'peste'
              then ' Mai mulți cursanți decât locuri în sală — de văzut dacă se împarte grupa sau se mută.'
            else ' Următoarea înscriere o trece peste capacitate.'
          end
        ),
        jsonb_build_object(
          'curs_id', g.id,
          'curs_nume', g.numele,
          'prag', v_prag,
          'ocupate', g.ocupate,
          'capacitate', g.cap,
          'procent', v_procent
        ),
        false,
        'open'
      );
      v_count := v_count + 1;
    end loop;
  end loop;

  return v_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.notifica_grupe_sub_minim(p_sezon uuid DEFAULT NULL::uuid, p_la date DEFAULT CURRENT_DATE)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  g            record;
  v_recipient  uuid;
  v_count      int := 0;
  v_ultima     text;
  v_serie      text;
  v_luni_ro    text[] := array['ian','feb','mar','apr','mai','iun','iul','aug','sep','oct','nov','dec'];
begin
  for g in
    select * from _grupe_sub_minim(p_sezon, null, p_la)
    where stare = 'de_suspendat' and sezon_in_curs
  loop
    v_ultima := g.luni -> (jsonb_array_length(g.luni) - 1) ->> 'luna';

    if exists (
      select 1 from notifications
      where kind = 'grupa_sub_minim'
        and payload->>'curs_id' = g.curs_id::text
        and payload->>'ultima_luna' = v_ultima
    ) then
      continue;
    end if;

    select string_agg(
             v_luni_ro[extract(month from (x->>'luna' || '-01')::date)::int]
               || ' ' || replace(x->>'cursanti', '.', ','),
             ' · ' order by x->>'luna'
           )
      into v_serie
      from (
        select x
        from jsonb_array_elements(g.luni) x
        order by x->>'luna' desc
        limit g.luni_sub_consecutive
      ) ultimele;

    for v_recipient in
      select id from auth.users
      where raw_app_meta_data->>'role' in ('owner', 'admin', 'manager')
    loop
      insert into notifications (
        recipient_user_id, kind, title, body, payload, requires_action, status
      ) values (
        v_recipient,
        'grupa_sub_minim',
        format('Grupă sub minim de %s luni: %s', g.luni_sub_consecutive, g.curs_nume),
        format(
          '%s · minim %s cursanți · %s. Propusă pentru suspendare, cu cursanții repartizați — decizia e a ta, din fișa cursului.',
          coalesce(g.sala_nume, 'fără sală'),
          g.minim,
          v_serie
        ),
        jsonb_build_object(
          'curs_id', g.curs_id,
          'curs_nume', g.curs_nume,
          'minim', g.minim,
          'luni_sub', g.luni_sub_consecutive,
          'ultima_luna', v_ultima
        ),
        true,
        'open'
      );
      v_count := v_count + 1;
    end loop;
  end loop;

  return v_count;
end;
$function$;

-- ── lista_cursuri: „Înscriși” = aceeași numărătoare (loc echivalent la facultative) ──
create view public.lista_cursuri with (security_invoker = true) as
 SELECT c.id,
    c.numele AS numele_cursului,
    c.sezon,
    c.zile,
    c.nivelul,
    c.varsta,
    c.facultativ,
    c.ora,
    c.ore_pe_zi,
    os.ore_start,
    os.ore_start[1] AS ora_start,
    COALESCE(act.inscrisi, (0)::numeric) AS inscrisi,
    c.capacitate_maxima,
    i.id AS id_teacher,
    i.nume,
    i.prenume,
    td.telefon,
    i.nivelul AS nivel_teacher,
    s.nume AS sala,
    COALESCE(l_direct.nume, l_sala.nume) AS locatie,
    COALESCE(c.locatie, s.locatie) AS id_locatie,
    0 AS balance
   FROM (((((((cursuri c
     LEFT JOIN teacheri i ON ((c.teacher = i.id)))
     LEFT JOIN teacheri_detalii td ON ((td.teacher_id = i.id)))
     LEFT JOIN sali s ON ((s.id = c.sala)))
     LEFT JOIN locatii l_sala ON ((l_sala.id = s.locatie)))
     LEFT JOIN locatii l_direct ON ((l_direct.id = c.locatie)))
     LEFT JOIN LATERAL ( SELECT lo.ocupate AS inscrisi
           FROM locuri_ocupate(CURRENT_DATE, CURRENT_DATE, ARRAY[c.id]) lo(curs_id, ocupate)) act ON (true))
     LEFT JOIN LATERAL ( SELECT COALESCE(array_agg(DISTINCT x.h ORDER BY x.h) FILTER (WHERE (x.h IS NOT NULL)),
                CASE
                    WHEN (c.ora IS NULL) THEN NULL::text[]
                    ELSE ARRAY[c.ora]
                END) AS ore_start
           FROM (unnest(COALESCE(c.zile, '{}'::zi_saptamana[])) z(z)
             CROSS JOIN LATERAL ( SELECT COALESCE((c.ore_pe_zi ->> (z.z)::text), c.ora) AS h) x)) os ON (true));

revoke all on public.lista_cursuri from public, anon;
grant select, insert, update, delete on public.lista_cursuri to authenticated;
grant all on public.lista_cursuri to service_role;

-- ── Drepturile funcțiilor recreate, identice cu cele de dinainte ──
-- (get_ocupare_prime_time avea EXECUTE pentru anon și public — închis aici.)
revoke all on function public._locuri_ocupate(date, date, uuid[], boolean) from public, anon;
revoke all on function public.locuri_ocupate(date, date, uuid[]) from public, anon;
revoke all on function public.locuri_ocupate_luna(date, uuid[]) from public, anon;
revoke all on function public.cursanti_platitori_luna(uuid, date) from public, anon;
revoke all on function public.get_grad_ocupare(uuid) from public, anon;
revoke all on function public.get_ocupare_locatii() from public, anon;
revoke all on function public.get_ocupare_prime_time(uuid) from public, anon;
revoke all on function public.get_grupe_sub_minim(uuid, uuid) from public, anon;
revoke all on function public._grupe_sub_minim(uuid, uuid, date) from public, anon, authenticated;

grant execute on function public._locuri_ocupate(date, date, uuid[], boolean) to authenticated, service_role;
grant execute on function public.locuri_ocupate(date, date, uuid[]) to authenticated, service_role;
grant execute on function public.locuri_ocupate_luna(date, uuid[]) to authenticated, service_role;
grant execute on function public.cursanti_platitori_luna(uuid, date) to authenticated, service_role;
grant execute on function public.get_grad_ocupare(uuid) to authenticated, service_role;
grant execute on function public.get_ocupare_locatii() to authenticated, service_role;
grant execute on function public.get_ocupare_prime_time(uuid) to authenticated, service_role;
grant execute on function public.get_grupe_sub_minim(uuid, uuid) to authenticated, service_role;
grant execute on function public._grupe_sub_minim(uuid, uuid, date) to service_role;
