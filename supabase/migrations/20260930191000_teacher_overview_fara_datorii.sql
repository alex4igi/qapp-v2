-- „Privire pe instructor" nu mai arată datorii (Alex, 30.09.2026): instructorul nu încasează, iar
-- cifra (netată, cu rate nescadente) contrazicea definiția restanțelor. Datoriile unei grupe se
-- văd pe /datorii, filtrate pe grupă. Tipul rezultatului se schimbă → drop + create.

drop function if exists public.get_teacher_overview(uuid);

create function public.get_teacher_overview(p_teacher_id uuid)
returns table(curs_id uuid, curs_nume text, curs_nivel text, facultativ boolean, activi integer, prezenti bigint, posibile bigint)
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
  )
  select ct.id as curs_id,
         ct.numele as curs_nume,
         ct.nivelul as curs_nivel,
         ct.facultativ,
         coalesce(ac.activi, 0) as activi,
         coalesce(pc.prezenti, pf.prezenti, 0)::bigint as prezenti,
         coalesce(pc.posibile, 0)::bigint as posibile
  from cursuri_teacher ct
  left join activi_curs ac on ac.curs_id = ct.id
  left join prezente_curs pc on pc.curs_id = ct.id
  left join prezente_facultativ pf on pf.curs_id = ct.id
  where coalesce(ac.activi, 0) > 0
  order by ct.numele;
$function$;

revoke execute on function public.get_teacher_overview(uuid) from anon, public;
grant execute on function public.get_teacher_overview(uuid) to authenticated, service_role;
