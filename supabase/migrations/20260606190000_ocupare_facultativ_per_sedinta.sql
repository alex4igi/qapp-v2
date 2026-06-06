-- Qapp v2 — get_grad_ocupare: ocupare corectă pentru cursuri facultative.
--
-- Problemă vs 20260606170100: ocuparea = count(distinct client cu înrolare activă
-- luna asta) / capacitate_maxima — corect pentru recurent (roster = oameni în sală),
-- dar ÎNȘELĂTOR pentru facultativ (open class). Acolo capacitate_maxima e o limită
-- PER ȘEDINȚĂ (pereții sălii, ex. 35), iar clienții unici pe toată luna o depășesc
-- legitim (35 azi + alți 10 la următorul open = 45 unici, dar nicio ședință n-a
-- depășit 35) → afișa fals 45/35 = 128% roșu.
--
-- Fix (decizie user 2026-06-06): pentru facultativ, ocuparea = VÂRF ȘEDINȚĂ — cea
-- mai plină ședință din luna curentă (din prezențe), raportată la capacitate_maxima.
-- Întoarcem și media/ședință (informativă). Recurent / Trupă rămâne neschimbat.
-- Același pattern facultativ-aware ca get_clienti_activi (20260606140000).

-- Return type-ul se schimbă (coloane noi facultativ/media) → drop obligatoriu.
drop function if exists get_grad_ocupare(uuid);

create or replace function get_grad_ocupare(p_locatie uuid default null)
returns table (
  curs_id      uuid,
  curs_nume    text,
  locatie_nume text,
  teacher_nume text,
  facultativ   boolean,
  activi       integer,
  media        integer,
  capacitate   integer,
  procent      numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with luna as (
    select date_trunc('month', current_date)::date as start_luna,
           (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date as end_luna
  ),
  cursuri_scop as (
    select c.id, c.numele, c.locatie, c.teacher, c.capacitate_maxima, c.facultativ
    from cursuri c
    where coalesce(c.suspendat, false) = false
      and c.sezon = (select id from sezoane where activ = true order by data_incepere desc limit 1)
      and (p_locatie is null or c.locatie = p_locatie)
      and (
        auth_role() <> 'teacher'
        or c.teacher = current_teacher_id()
        or exists (select 1 from cursuri_teacheri ct
                   where ct.curs_id = c.id and ct.teacher_id = current_teacher_id())
      )
  ),
  -- Recurent / Trupă: roster distinct activ în luna curentă.
  activi_recurent as (
    select cs.id as curs_id, count(distinct e.client)::int as n
    from cursuri_scop cs
    join enrollments e on e.cursul = cs.id
      and e.activ = true and e.reziliat = false
      and e.data_incepere <= (select end_luna from luna)
      and (e.data_final is null or e.data_final >= (select start_luna from luna))
    where cs.facultativ = false
    group by cs.id
  ),
  -- Facultativ: prezenți distincți per ședință (dată) în luna curentă.
  per_sedinta_fac as (
    select cs.id as curs_id, pr.data, count(distinct pr.client)::int as n
    from cursuri_scop cs
    join enrollments e on e.cursul = cs.id
    join prezente pr on pr.enrollment = e.id
      and pr.status = 'Prezent'
      and pr.data between (select start_luna from luna) and (select end_luna from luna)
    where cs.facultativ = true
    group by cs.id, pr.data
  ),
  activi_facultativ as (
    select curs_id, max(n)::int as peak, round(avg(n))::int as media
    from per_sedinta_fac
    group by curs_id
  )
  select
    cs.id as curs_id,
    cs.numele as curs_nume,
    loc.nume as locatie_nume,
    coalesce(
      (select t.nume from teacheri t where t.id = cs.teacher),
      (select t.nume from cursuri_teacheri ct join teacheri t on t.id = ct.teacher_id
        where ct.curs_id = cs.id order by case when ct.rol='titular' then 0 else 1 end limit 1)
    ) as teacher_nume,
    cs.facultativ,
    case when cs.facultativ then coalesce(af.peak, 0)
         else coalesce(ar.n, 0) end as activi,
    case when cs.facultativ then af.media else null end as media,
    cs.capacitate_maxima as capacitate,
    case when cs.capacitate_maxima > 0
         then round(100.0 * (case when cs.facultativ then coalesce(af.peak, 0)
                                  else coalesce(ar.n, 0) end) / cs.capacitate_maxima, 0)
         else null end as procent
  from cursuri_scop cs
  left join activi_recurent ar on ar.curs_id = cs.id
  left join activi_facultativ af on af.curs_id = cs.id
  left join locatii loc on loc.id = cs.locatie
  order by
    case when cs.capacitate_maxima > 0
         then round(100.0 * (case when cs.facultativ then coalesce(af.peak, 0)
                                  else coalesce(ar.n, 0) end) / cs.capacitate_maxima, 0)
         else null end desc nulls last,
    cs.numele;
$$;

grant execute on function get_grad_ocupare(uuid) to authenticated;
