-- Qapp v2 — rescrierea RPC-urilor de headcount pe definiția canonică „activ"
-- (helperi în 20260702120000). Semnături și forme de retur IDENTICE — zero
-- schimbări în frontend.
--
-- Rescrise acum (definiția contează, cifrele erau distorsionate la tranziția
-- de sezon): get_clienti_activi, get_crestere_neta, get_absente_consecutive,
-- get_grad_ocupare.
-- Amânate intenționat (PR separat, impact mic sau pagini în afara scope-ului):
-- get_ocupare_prime_time, get_yoy_aceeasi_luna('activi'),
-- get_instructori_clienti_trend, get_cursanti_multi_stil, get_familii_frati,
-- get_rentabilitate_grupa (coloana activi).

-- ============================================================
-- 1. get_clienti_activi — KPI-ul „Clienți activi" (/analytics, /ansamblu)
--    Înainte: înrolare activ=true care acoperă LUNA curentă (hibrid facultativ).
--    Acum: definiția canonică pe ZIUA curentă (contract SAU prezență 21z).
-- ============================================================
create or replace function get_clienti_activi()
returns table (
  locatie_id   uuid,
  locatie_nume text,
  activi       integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with ia as (
    select * from inrolari_active_la(current_date)
  ),
  per_locatie as (
    select loc.id as locatie_id, loc.nume as locatie_nume,
           count(distinct ia.client)::int as activi
    from ia
    join cursuri c on c.id = ia.cursul
    join locatii loc on loc.id = c.locatie
    group by loc.id, loc.nume
  ),
  total as (
    select null::uuid as locatie_id, 'Total club'::text as locatie_nume,
           count(distinct client)::int as activi
    from ia
  )
  select locatie_id, locatie_nume, activi from total
  union all
  select locatie_id, locatie_nume, activi from per_locatie
  order by locatie_id nulls first, locatie_nume;
$$;

grant execute on function get_clienti_activi() to authenticated;

-- ============================================================
-- 2. get_crestere_neta — intrați/pierduți/net pe lună (Section1, /ansamblu)
--    Apartenența la luna M trece de pe flagul activ pe definiția canonică
--    lunară (acoperire ne-reziliată overlap M SAU prezență în M).
-- ============================================================
create or replace function get_crestere_neta(
  p_locatie uuid default null,
  p_luni    integer default 12
)
returns table (
  luna     text,
  intrati  integer,
  pierduti integer,
  net      integer,
  activi   integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with bounds as (
    select date_trunc('month', current_date)::date as cur_month,
           greatest(coalesce(p_luni, 12), 1) as n
  ),
  months_calc as (
    select gs::date as m_start,
           (extract(year from gs) * 12 + extract(month from gs))::int as midx,
           to_char(gs, 'YYYY-MM') as luna
    from bounds b,
      generate_series(
        (b.cur_month - make_interval(months => b.n))::date,
        b.cur_month,
        interval '1 month'
      ) gs
  ),
  cm as (
    select distinct ia.client, m.midx
    from months_calc m
    cross join lateral inrolari_active_luna(m.m_start) ia
    join cursuri c on c.id = ia.cursul
    where (p_locatie is null or c.locatie = p_locatie)
  ),
  per_month as (
    select
      m.luna, m.midx,
      (select count(distinct a.client)::int from cm a where a.midx = m.midx) as activi,
      (select count(distinct a.client)::int from cm a
         where a.midx = m.midx
           and not exists (select 1 from cm b where b.client = a.client and b.midx = m.midx - 1)
      ) as intrati,
      (select count(distinct a.client)::int from cm a
         where a.midx = m.midx - 1
           and not exists (select 1 from cm b where b.client = a.client and b.midx = m.midx)
      ) as pierduti
    from months_calc m
  )
  select luna, intrati, pierduti, (intrati - pierduti) as net, activi
  from per_month
  order by luna
  offset 1;
$$;

grant execute on function get_crestere_neta(uuid, integer) to authenticated;

-- ============================================================
-- 3. get_absente_consecutive — lista de risc (Section3)
--    Înainte: doar înrolări e.activ=true → găuri când flagul e stale.
--    Acum: cursuri din sezonul ACTIV (streak-ul are sens doar pe grupele
--    curente; altfel finalul sezonului trecut ar polua lista) + doar clienți
--    activi canonic. 'Motivat' rupe seria în continuare (absențe „anunțate").
-- ============================================================
create or replace function get_absente_consecutive(
  p_locatie uuid default null,
  p_prag    int  default 2
)
returns table (
  client_id           uuid,
  client_nume         text,
  curs_id             uuid,
  curs_nume           text,
  absente_consecutive int,
  ultima_prezenta     date
)
language sql
stable
security invoker
set search_path = public
as $$
  with activi_azi as (
    select client from clienti_activi_la(current_date)
  ),
  prez as (
    select p.client, e.cursul as curs_id, p.data, p.status,
           row_number() over (partition by p.client, e.cursul order by p.data desc) as rn
    from prezente p
    join enrollments e on e.id = p.enrollment
      and e.reziliat = false
    join cursuri c on c.id = e.cursul
    where p.data is not null
      and coalesce(c.facultativ, false) = false
      and c.sezon = (select id from sezoane where activ = true order by data_incepere desc limit 1)
      and (p_locatie is null or c.locatie = p_locatie)
      and p.client in (select client from activi_azi)
  ),
  first_present as (
    select client, curs_id, min(rn) as rn_present
    from prez
    where status <> 'Absent'
    group by client, curs_id
  ),
  streak as (
    select p.client, p.curs_id,
           count(*) filter (
             where p.status = 'Absent'
               and (fp.rn_present is null or p.rn < fp.rn_present)
           )::int as absente,
           max(p.data) filter (where p.status <> 'Absent') as ultima_prez
    from prez p
    left join first_present fp on fp.client = p.client and fp.curs_id = p.curs_id
    group by p.client, p.curs_id
  )
  select s.client,
         trim(format('%s %s', coalesce(cl.prenume, ''), cl.nume)) as client_nume,
         s.curs_id, cu.numele as curs_nume,
         s.absente, s.ultima_prez
  from streak s
  join clienti cl on cl.id = s.client
  join cursuri cu on cu.id = s.curs_id
  where s.absente >= greatest(coalesce(p_prag, 2), 1)
  order by s.absente desc, client_nume
  limit 200;
$$;

grant execute on function get_absente_consecutive(uuid, int) to authenticated;

-- ============================================================
-- 4. get_grad_ocupare — ocupare per grupă (Section4, /ansamblu)
--    Identic cu 20260606190000 (facultativ = vârf ședință), dar rosterul
--    recurent trece pe definiția canonică pe ziua curentă.
-- ============================================================
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
  -- Recurent / Trupă: roster pe definiția canonică (ziua curentă).
  activi_recurent as (
    select cs.id as curs_id, count(distinct ia.client)::int as n
    from cursuri_scop cs
    join inrolari_active_la(current_date) ia on ia.cursul = cs.id
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
