-- Aliniere la docs/reguli-domeniu.md a cifrelor din Statistici (auditul rapoartelor, 30.09.2026).
--
-- 1. inrolari_active_luna — privea lunile trecute prin `reziliat = false`. Bifa se pune la
--    închiderea fiecărei luni „Per lună", deci o lună încheiată pierdea înrolările care o
--    acopereau (§1). Acum: reziliere = `data_reziliere`; ședința „Per ședință" acoperă doar
--    ziua ei (data_final e NULL din 2026-2027); rezervarea OPEN anulată nu mai contează
--    (aceeași fereastră ca `_inrolari_platite_randuri`, fără condiția de plată — §1 „elev activ").
--    Consumatori vii: get_crestere_neta (Total clienți), get_instructori_clienti_trend.
-- 2. get_teacher_overview — „activi" citea `enrollments.activ` (neîntreținut, §1) și
--    `cursuri.suspendat` (cache „acum", §2); rosterul prezenței număra reziliați și lăsa
--    ședințele fără data_final să acopere toate zilele de după, iar prezenții puteau depăși
--    posibilii. Datoria rămâne neatinsă: definiția restanțelor e în discuție.
-- 3. get_grad_ocupare, get_ocupare_prime_time — procentul rotunjit la întreg; §2 cere 2 zecimale.

create or replace function public.inrolari_active_luna(p_luna date)
returns table(enrollment_id uuid, client uuid, cursul uuid)
language sql
stable
set search_path to 'public'
as $function$
  with m as (
    select date_trunc('month', p_luna)::date as m_start,
           (date_trunc('month', p_luna) + interval '1 month' - interval '1 day')::date as m_end
  )
  select e.id, e.client, e.cursul
  from enrollments e, m
  where e.client is not null
    and (
      (e.data_incepere <= m.m_end
        and least(
              case when e.tip_plata = 'Per sedinta' then e.data_incepere
                   else coalesce(e.data_final, 'infinity'::date) end,
              coalesce(e.data_reziliere::date - 1, 'infinity'::date)
            ) >= greatest(e.data_incepere, m.m_start)
        and not (
          e.tip_plata = 'Per sedinta'
          and exists (select 1 from open_rezervari r
                      where r.enrollment = e.id and r.status = 'anulat')
        ))
      or exists (
        select 1 from prezente p
        where p.enrollment = e.id
          and p.status = 'Prezent'
          and p.data >= m.m_start
          and p.data <= m.m_end
      )
    );
$function$;

create or replace function public.get_teacher_overview(p_teacher_id uuid)
returns table(curs_id uuid, curs_nume text, curs_nivel text, facultativ boolean, activi integer, prezenti bigint, posibile bigint, datorie numeric)
language sql
stable
set search_path to 'public'
as $function$
  with luna as (
    select date_trunc('month', current_date)::date as start_luna,
           least(
             (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date,
             current_date
           ) as end_luna
  ),
  -- Cursurile teacher-ului: titular legacy SAU rol în M:N, active în luna curentă.
  cursuri_teacher as (
    select c.id, c.numele, c.nivelul, coalesce(c.facultativ, false) as facultativ
    from cursuri c, luna l
    where curs_activ_in_luna(c.id, l.start_luna)
      and (
        c.teacher = p_teacher_id
        or exists (
          select 1 from cursuri_teacheri ct
          where ct.curs_id = c.id and ct.teacher_id = p_teacher_id
        )
      )
  ),
  -- Elevi activi în luna curentă (definiția canonică lunară).
  activi_curs as (
    select ia.cursul as curs_id, count(distinct ia.client)::int as activi
    from luna l
    cross join lateral inrolari_active_luna(l.start_luna) ia
    where ia.cursul in (select id from cursuri_teacher)
    group by ia.cursul
  ),
  -- Ședințe ținute luna asta (curs, dată) cu ≥1 Prezent — doar recurent+trupă.
  sesiuni as (
    select ct.id as curs_id, p.data
    from prezente p
    join enrollments e on e.id = p.enrollment
    join cursuri_teacher ct on ct.id = e.cursul
    cross join luna l
    where ct.facultativ = false
      and p.status = 'Prezent'
      and p.data >= l.start_luna
      and p.data <= l.end_luna
    group by ct.id, p.data
  ),
  -- Posibili = înrolați în ziua ședinței ∪ prezenți în ziua aceea: un prezent e mereu și posibil.
  cu_roster as (
    select s.curs_id,
           (select count(distinct p.client)
              from prezente p
              join enrollments e on e.id = p.enrollment
             where e.cursul = s.curs_id and p.data = s.data and p.status = 'Prezent'
           )::int as prezenti,
           (select count(distinct x.client) from (
              select e2.client
                from enrollments e2
               where e2.cursul = s.curs_id
                 and e2.client is not null
                 and e2.data_incepere <= s.data
                 and least(
                       case when e2.tip_plata = 'Per sedinta' then e2.data_incepere
                            else coalesce(e2.data_final, 'infinity'::date) end,
                       coalesce(e2.data_reziliere::date - 1, 'infinity'::date)
                     ) >= s.data
                 and not (
                   e2.tip_plata = 'Per sedinta'
                   and exists (select 1 from open_rezervari r
                               where r.enrollment = e2.id and r.status = 'anulat')
                 )
              union
              select p.client
                from prezente p
                join enrollments e3 on e3.id = p.enrollment
               where e3.cursul = s.curs_id and p.data = s.data and p.status = 'Prezent'
           ) x)::int as roster
    from sesiuni s
  ),
  prezente_curs as (
    select cr.curs_id,
           coalesce(sum(cr.prezenti), 0)::bigint as prezenti,
           coalesce(sum(cr.roster), 0)::bigint   as posibile
    from cu_roster cr
    group by cr.curs_id
  ),
  -- La facultativ: prezenti = clienți distincți cu Prezent în lună (posibile rămâne 0).
  prezente_facultativ as (
    select ct.id as curs_id,
           (select count(distinct p.client)
              from prezente p
              join enrollments e on e.id = p.enrollment
             cross join luna l
             where e.cursul = ct.id
               and p.status = 'Prezent'
               and p.data >= l.start_luna
               and p.data <= l.end_luna
           )::bigint as prezenti
    from cursuri_teacher ct
    where ct.facultativ = true
  ),
  -- Datorie neprescrisă: subquery-uri separate ca să nu dublăm LEFT JOIN incasari.
  datorie_curs as (
    select ct.id as curs_id,
           (
             coalesce((select sum(e.suma)
                         from enrollments e
                        where e.cursul = ct.id
                          and e.reziliat = false
                          and e.data_incepere >= (current_date - interval '2 years')), 0)
             - coalesce((select sum(i.suma)
                           from incasari i
                           join enrollments e on e.id = i.inregistrare
                          where e.cursul = ct.id
                            and e.reziliat = false
                            and e.data_incepere >= (current_date - interval '2 years')), 0)
           )::numeric as datorie
    from cursuri_teacher ct
  )
  select ct.id as curs_id,
         ct.numele as curs_nume,
         ct.nivelul as curs_nivel,
         ct.facultativ,
         coalesce(ac.activi, 0) as activi,
         coalesce(pc.prezenti, pf.prezenti, 0)::bigint as prezenti,
         coalesce(pc.posibile, 0)::bigint as posibile,
         coalesce(dc.datorie, 0)::numeric as datorie
  from cursuri_teacher ct
  left join activi_curs ac on ac.curs_id = ct.id
  left join prezente_curs pc on pc.curs_id = ct.id
  left join prezente_facultativ pf on pf.curs_id = ct.id
  left join datorie_curs dc on dc.curs_id = ct.id
  where coalesce(ac.activi, 0) > 0
  order by ct.numele;
$function$;

create or replace function public.get_grad_ocupare(p_locatie uuid default null)
returns table(curs_id uuid, curs_nume text, locatie_nume text, teacher_nume text, facultativ boolean, activi numeric, capacitate integer, procent numeric)
language sql
stable
set search_path to 'public'
as $function$
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
         then round(100.0 * coalesce(lo.ocupate, 0) / cs.capacitate_maxima, 2)
    end
  from cursuri_scop cs
  left join locuri lo on lo.curs_id = cs.id
  left join locatii loc on loc.id = cs.locatie;
$function$;

create or replace function public.get_ocupare_prime_time(p_locatie uuid default null)
returns table(slot text, grupe integer, activi numeric, capacitate integer, procent numeric)
language sql
stable
set search_path to 'public'
as $function$
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
              then round(100.0 * coalesce(sum(a.ocupate), 0) / sum(cs.capacitate_maxima), 2)
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

revoke execute on function public.inrolari_active_luna(date) from anon, public;
revoke execute on function public.get_teacher_overview(uuid) from anon, public;
revoke execute on function public.get_instructori_clienti_trend(integer) from anon, public;
