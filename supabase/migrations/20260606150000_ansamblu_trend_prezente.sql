-- Qapp v2 — Overview: trend prezențe per curs (ferestre de 3 săptămâni, fără vacanțe).
--
-- Semnal de intervenție pentru manageri (confirmat 2026-06-06): tendința pe ~3
-- săptămâni, NU lunar; exclude săptămânile de vacanță (tabel `vacante`).
--
-- Notă pe formula ratei: absențele aproape nu se marchează (Prezent >> Absent),
-- deci rata „prezenți/(prezenți+absenți)" ar fi ~100% mereu. Folosim în schimb
--   rata = clienți distincți Prezent / roster înrolat   (acea săptămână, acel curs)
-- = câți din cei înrolați chiar au venit (engagement). O scădere = semnal precoce
-- de dezangajare înainte de churn.
--
-- Săptămână = ISO (luni, date_trunc('week')). „Săptămână activă" = are ≥1 sesiune
-- și NU se suprapune cu nicio vacanță. Comparăm media ultimelor 3 săptămâni active
-- cu media celor 3 dinainte → in_scadere dacă recentă < precedentă.
--
-- Scoping: p_locatie (manager/front_desk) și p_teacher (filtru opțional privileged).
-- Teacher-ul vede DOAR cursurile lui (forțat prin current_teacher_id(), ignoră params).

create or replace function get_trend_prezente(
  p_locatie    uuid default null,
  p_teacher    uuid default null,
  p_saptamani  integer default 9
)
returns table (
  curs_id        uuid,
  curs_nume      text,
  teacher_nume   text,
  locatie_nume   text,
  saptamani      jsonb,
  rata_recenta   numeric,
  rata_precedenta numeric,
  in_scadere     boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with params as (
    select
      greatest(coalesce(p_saptamani, 9), 6) as n_weeks,
      s.data_incepere as sez_start,
      s.data_final    as sez_end
    from sezoane s
    where s.activ = true
    order by s.data_incepere desc
    limit 1
  ),
  cursuri_scop as (
    select c.id, c.numele, c.locatie
    from cursuri c
    where coalesce(c.suspendat, false) = false
      and (p_locatie is null or c.locatie = p_locatie)
      -- teacher: doar cursurile proprii, indiferent de params
      and (
        auth_role() <> 'teacher'
        or exists (
          select 1 from cursuri_teacheri ct
          where ct.curs_id = c.id and ct.teacher_id = current_teacher_id()
        )
      )
      and (
        p_teacher is null
        or exists (
          select 1 from cursuri_teacheri ct
          where ct.curs_id = c.id and ct.teacher_id = p_teacher
        )
      )
  ),
  -- prezențe din sezon, pe cursurile în scope, cu săptămâna ISO
  prez as (
    select cs.id as curs_id,
           date_trunc('week', p.data)::date as week_start,
           p.client
    from prezente p
    join enrollments e on e.id = p.enrollment
    join cursuri_scop cs on cs.id = e.cursul
    cross join params pr
    where p.status = 'Prezent'
      and p.data >= pr.sez_start
      and p.data <= least(pr.sez_end, current_date)
  ),
  -- elimină săptămânile care se suprapun cu o vacanță
  week_prez as (
    select pz.curs_id, pz.week_start,
           count(distinct pz.client)::int as prezenti
    from prez pz
    where not exists (
      select 1 from vacante v
      where pz.week_start <= v.data_final
        and (pz.week_start + 6) >= v.data_incepere
    )
    group by pz.curs_id, pz.week_start
  ),
  -- roster = clienți distincți cu înrolare ce acoperă acea săptămână
  roster as (
    select wp.curs_id, wp.week_start,
           count(distinct e.client)::int as roster
    from week_prez wp
    join enrollments e on e.cursul = wp.curs_id
      and e.data_incepere <= (wp.week_start + 6)
      and (e.data_final is null or e.data_final >= wp.week_start)
    group by wp.curs_id, wp.week_start
  ),
  weekly as (
    select wp.curs_id, wp.week_start, wp.prezenti,
           coalesce(r.roster, 0) as roster,
           case when coalesce(r.roster, 0) > 0
                then round(100.0 * wp.prezenti / r.roster, 1)
                else 0 end as rata,
           row_number() over (partition by wp.curs_id order by wp.week_start desc) as rn
    from week_prez wp
    left join roster r on r.curs_id = wp.curs_id and r.week_start = wp.week_start
  ),
  recent as (
    select w.* from weekly w cross join params pr where w.rn <= pr.n_weeks
  ),
  agg as (
    select curs_id,
           jsonb_agg(
             jsonb_build_object(
               'saptamana', week_start,
               'prezenti', prezenti,
               'roster', roster,
               'rata', rata
             ) order by week_start
           ) as saptamani,
           round(avg(rata) filter (where rn <= 3), 1)            as rata_recenta,
           round(avg(rata) filter (where rn > 3 and rn <= 6), 1) as rata_precedenta
    from recent
    group by curs_id
  )
  select
    a.curs_id,
    cs.numele,
    (
      select t.nume from cursuri_teacheri ct
      join teacheri t on t.id = ct.teacher_id
      where ct.curs_id = a.curs_id
      order by case when ct.rol = 'titular' then 0 else 1 end
      limit 1
    ) as teacher_nume,
    loc.nume as locatie_nume,
    a.saptamani,
    a.rata_recenta,
    a.rata_precedenta,
    (a.rata_precedenta is not null
      and a.rata_recenta is not null
      and a.rata_recenta < a.rata_precedenta) as in_scadere
  from agg a
  join cursuri_scop cs on cs.id = a.curs_id
  left join locatii loc on loc.id = cs.locatie
  order by in_scadere desc, cs.numele;
$$;

grant execute on function get_trend_prezente(uuid, uuid, integer) to authenticated;
