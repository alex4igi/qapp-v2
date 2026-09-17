-- Reînscrieri: sumarul pe sezon citit din registre + oprirea eroziunii numitorului
-- din board-ul per curs.
--
-- Simptom: /statistici arăta „Rată reînscriere 10100%" pe sezonul 2026-2027
-- (202 reînscriși din 2 „eligibili").
--
-- Cauza 1 — numitorul se topea zilnic. `get_reinscrieri_progress` număra drept
-- eligibil pe cine e înrolat pe cursul-sursă ASTĂZI. Formula e bună cât timp
-- campania rulează (sezonul sursă e în curs), dar după ce sezonul sursă se
-- închide numărul scade spre zero, în timp ce numărătorul (reînscriși) rămâne.
-- Fix: fereastra se oprește la finalul sezonului sursă, deci pool-ul îngheață
-- în loc să se erodeze. În plus filtrul trece de pe bifa `reziliat` (pusă și pe
-- lunile încheiate, deci taie oameni care n-au plecat) pe `data_reziliere`.
--
-- Cauza 2 — board-ul per curs nu poate descrie campania 2026-2027: lanțul
-- `cursul_original` urcă doar un hop, spre Vara 2026, și se oprește înainte de
-- 2025-2026, deci compară toamna cu grupele de vară. Campania a rulat oricum
-- integral în Excel. Cifrele ei reale stau în `reinscrieri_semnate`
-- (20260913090000), de unde le citește sumarul de mai jos.

-- ============================================================================
-- 1) Sumarul campaniei pe sezon — sursa e registrul semnăturilor
-- ============================================================================
drop function if exists public.get_reinscrieri_sumar(uuid);
create function public.get_reinscrieri_sumar(p_sezon uuid)
returns table (
  semnate       integer,
  ajunsi        integer,
  cu_promo      integer,
  pool_anterior integer,
  pool_revenit  integer
)
language plpgsql
stable
security invoker
set search_path = public
set plan_cache_mode = force_custom_plan
as $$
declare
  v_start date;
begin
  select s.data_incepere into v_start from sezoane s where s.id = p_sezon;
  if v_start is null then return; end if;

  return query
  with e_nou as (
    select distinct e.client
    from enrollments e
    where e.sezon_id = p_sezon
      and e.data_reziliere is null
  ),
  -- Aceeași definiție de „cine era în casă" ca /start-sezon: abonamente plătite,
  -- nereziliate, începute în ultimele 5 luni calendaristice dinaintea startului.
  pool as (
    select distinct e.client
    from enrollments e
    where e.sezon_id is distinct from p_sezon
      and e.suma > 0
      and e.data_reziliere is null
      and e.data_incepere >= (date_trunc('month', v_start) - interval '5 months')::date
      and e.data_incepere < v_start
  )
  select
    (select count(*)::integer from reinscrieri_semnate rs where rs.sezon_id = p_sezon),
    (select count(*)::integer from reinscrieri_semnate rs
      where rs.sezon_id = p_sezon
        and exists (select 1 from e_nou en where en.client = rs.client)),
    (select count(distinct e.client)::integer from enrollments e
      where e.sezon_id = p_sezon
        and e.este_reinscriere
        and e.data_reziliere is null),
    (select count(*)::integer from pool),
    (select count(*)::integer from pool p where p.client in (select client from e_nou));
end;
$$;

grant execute on function public.get_reinscrieri_sumar(uuid) to authenticated;
revoke execute on function public.get_reinscrieri_sumar(uuid) from anon, public;

-- ============================================================================
-- 2) Board-ul per curs — pool-ul îngheață la finalul sezonului sursă
-- ============================================================================
create or replace function get_reinscrieri_progress(p_sezon_tinta uuid)
returns table (
  curs_id           uuid,
  curs_nume         text,
  varsta            varsta_curs,
  total_eligibili   integer,
  activati          integer,
  ramasi            integer,
  procent           numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with target as (
    select c.id           as curs_target_id,
           c.numele       as numele,
           c.varsta       as varsta,
           c.cursul_original,
           -- cât timp sezonul sursă e în curs se citește „azi"; după ce s-a
           -- închis, pool-ul rămâne cel de la închidere.
           least(current_date, coalesce(so.data_final, current_date)) as la_data
    from cursuri c
    left join cursuri o  on o.id  = c.cursul_original
    left join sezoane so on so.id = o.sezon
    where c.sezon = p_sezon_tinta
      and c.facultativ = false
      and c.nivelul is distinct from 'Trupa'
  ),
  eligibili as (
    select t.curs_target_id, count(distinct e.client)::int as total
    from target t
    join enrollments e on e.cursul = t.cursul_original
    where t.cursul_original is not null
      and e.activ = true
      and e.data_reziliere is null
      and (e.data_incepere is null or e.data_incepere <= t.la_data)
      and (e.data_final is null or e.data_final >= t.la_data)
    group by t.curs_target_id
  ),
  activati as (
    select e.cursul as curs_target_id, count(distinct e.client)::int as total
    from enrollments e
    where e.sezon_id = p_sezon_tinta
      and e.este_reinscriere = true
      and e.data_reziliere is null
    group by e.cursul
  )
  select
    t.curs_target_id,
    t.numele,
    t.varsta,
    coalesce(el.total, 0),
    coalesce(a.total, 0),
    greatest(0, coalesce(el.total, 0) - coalesce(a.total, 0)),
    case when coalesce(el.total, 0) > 0
         then round(100.0 * coalesce(a.total, 0) / el.total, 1)
         else 0 end
  from target t
  left join eligibili el on el.curs_target_id = t.curs_target_id
  left join activati a   on a.curs_target_id  = t.curs_target_id
  order by t.numele;
$$;

grant execute on function get_reinscrieri_progress(uuid) to authenticated;
revoke execute on function get_reinscrieri_progress(uuid) from anon, public;
