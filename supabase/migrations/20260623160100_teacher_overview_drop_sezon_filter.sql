-- Qapp v2 — get_teacher_overview: nu filtra pe sezonul activ.
-- Motiv: „sezonul activ" poate fi gol (ex. Vara 2026), dar clienții activi luna asta
-- trăiesc pe cursurile sezonului încă în desfășurare (2025-2026). „Clienți activi luna
-- asta pe grupe" trebuie să se lege de acoperirea lunii curente, nu de flag-ul de sezon
-- (aceeași durere ca la get_grad_ocupare, care iese gol în sezon de vară).
-- Întoarcem doar grupele cu ≥1 client activ luna asta (= grupele curente ale teacher-ului).

create or replace function get_teacher_overview(p_teacher_id uuid)
returns table (
  curs_id    uuid,
  curs_nume  text,
  curs_nivel text,
  facultativ boolean,
  activi     integer,
  prezenti   bigint,
  posibile   bigint,
  datorie    numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with luna as (
    select date_trunc('month', current_date)::date as start_luna,
           least(
             (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date,
             current_date
           ) as end_luna
  ),
  -- Cursurile teacher-ului: titular legacy SAU rol în M:N (orice sezon).
  cursuri_teacher as (
    select c.id, c.numele, c.nivelul, coalesce(c.facultativ, false) as facultativ
    from cursuri c
    where coalesce(c.suspendat, false) = false
      and (
        c.teacher = p_teacher_id
        or exists (
          select 1 from cursuri_teacheri ct
          where ct.curs_id = c.id and ct.teacher_id = p_teacher_id
        )
      )
  ),
  -- Clienți activi care acoperă luna curentă.
  activi_curs as (
    select ct.id as curs_id,
           (select count(distinct e.client)
              from enrollments e
             cross join luna l
             where e.cursul = ct.id
               and e.activ = true
               and e.reziliat = false
               and coalesce(e.data_incepere, '1900-01-01'::date) <= l.end_luna
               and (e.data_final is null or e.data_final >= l.start_luna)
           )::int as activi
    from cursuri_teacher ct
  ),
  -- Ședințe ținute luna asta (curs, dată) cu ≥1 Prezent — doar recurent+trupă.
  sesiuni as (
    select ct.id as curs_id, p.data,
           count(distinct p.client)::int as prezenti
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
  cu_roster as (
    select s.curs_id, s.prezenti,
           (select count(distinct e2.client)
              from enrollments e2
             where e2.cursul = s.curs_id
               and e2.data_incepere <= s.data
               and (e2.data_final is null or e2.data_final >= s.data)
           )::int as roster
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
$$;

grant execute on function get_teacher_overview(uuid) to authenticated;
