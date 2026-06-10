-- Qapp v2 — Statistici overview: rata de prezență (engagement) pe luna curentă, per locație.
--
-- Convenție (identică cu get_trend_prezente, 20260606150000): absențele aproape nu
-- se marchează (Prezent >> Absent), deci rata „prezenți/(prezenți+absenți)" ar fi
-- ~100% mereu. Folosim în schimb:
--   rata = prezenți distincți / roster înrolat   (pe fiecare ședință ținută)
-- = „câte prezențe au fost VS câte prezențe posibile" (roster × ședințe ținute).
--
-- Doar cursuri recurent + trupă (facultativ=false): la open class „roster"-ul e fuzzy
-- (oameni se înrolează per ședință), deci ar distorsiona rata.
--
-- Ședință ținută = (curs, dată) cu ≥1 Prezent în luna curentă (până azi).
-- Întoarcem per locație; globalul se sumează client-side.

create or replace function get_rata_prezenta_luna(p_locatie uuid default null)
returns table (
  locatie_id   uuid,
  locatie_nume text,
  prezenti     bigint,
  posibile     bigint
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
  cursuri_scop as (
    select c.id, c.locatie
    from cursuri c
    where coalesce(c.suspendat, false) = false
      and coalesce(c.facultativ, false) = false
      and c.sezon = (select id from sezoane where activ = true order by data_incepere desc limit 1)
      and (p_locatie is null or c.locatie = p_locatie)
  ),
  -- ședințe ținute: (curs, dată) cu ≥1 Prezent în lună
  sesiuni as (
    select cs.id as curs_id, cs.locatie, p.data,
           count(distinct p.client)::int as prezenti
    from prezente p
    join enrollments e on e.id = p.enrollment
    join cursuri_scop cs on cs.id = e.cursul
    cross join luna l
    where p.status = 'Prezent'
      and p.data >= l.start_luna
      and p.data <= l.end_luna
    group by cs.id, cs.locatie, p.data
  ),
  -- roster = clienți distincți cu înrolare ce acoperă acea dată (acoperirea bornează,
  -- fără filtru pe activ/reziliat — identic cu CTE-ul roster din get_trend_prezente)
  cu_roster as (
    select s.locatie, s.prezenti,
           (select count(distinct e2.client)
              from enrollments e2
             where e2.cursul = s.curs_id
               and e2.data_incepere <= s.data
               and (e2.data_final is null or e2.data_final >= s.data)
           )::int as roster
    from sesiuni s
  )
  select cr.locatie as locatie_id,
         loc.nume as locatie_nume,
         coalesce(sum(cr.prezenti), 0)::bigint as prezenti,
         coalesce(sum(cr.roster), 0)::bigint   as posibile
  from cu_roster cr
  left join locatii loc on loc.id = cr.locatie
  group by cr.locatie, loc.nume
  order by loc.nume;
$$;

grant execute on function get_rata_prezenta_luna(uuid) to authenticated;
