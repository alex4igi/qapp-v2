-- Regula de ocupare de 30 de zile, aplicată peste tot dintr-o singură funcție.
--
-- Regula owner-ului (15 sept. 2026), generală: ocuparea se raportează la
-- capacitatea maximă a grupei indiferent de tip, iar o ședință plătită ține
-- locul 30 de zile de la data ei. Până acum existau patru numărători diferite:
--   - Overview (get_ocupare_locatii): regula de 30 de zile;
--   - listele pe grupă (get_grad_ocupare): roster canonic la recurent, vârful
--     de ședință din prezențe la facultativ;
--   - lista /cursuri (lista_cursuri.inscrisi): roster canonic, fără ședințe;
--   - numărătoarea lunară (cursanti_platitori_luna — pragul minim, bonusurile):
--     ședința doar în luna în care a fost ținută, rezervările anulate incluse.
-- Toate citesc acum locuri_ocupate.

-- ============================================================
-- 1. Definiția unică
-- ============================================================
-- Un loc = un client distinct la o grupă, ocupat în cel puțin o zi din
-- [p_de, p_pana]. Un copil la 2 grupe ocupă 2 locuri — cine adună peste grupe
-- adună locuri, nu oameni.
--
-- Fereastra locului:
--   - ședința: [data_incepere, data_incepere + 29]. Ignoră data_final — din
--     2026-2027 e NULL (ar ține locul la infinit), iar în sezoanele vechi nu
--     înseamnă 30 de zile;
--   - abonamentul: [data_incepere, data_final], NULL = deschis.
-- Rezilierea taie fereastra în ziua de dinaintea ei: cine pleacă pe 1 ale
-- lunii nu a ocupat locul în luna aceea. NU `reziliat` — bifa se pune și pe
-- lunile încheiate.
--
-- p_cursuri e obligatoriu: fără el filtrul n-ar mai folosi idx_enrollments_cursul.
create index if not exists idx_open_rez_enrollment on open_rezervari (enrollment);

create or replace function locuri_ocupate(
  p_de      date,
  p_pana    date,
  p_cursuri uuid[]
)
returns table (curs_id uuid, ocupate integer)
language sql
stable
security invoker
set search_path = public
as $$
  select e.cursul, count(distinct e.client)::int
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
    and least(
          case when e.tip_plata = 'Per sedinta' then e.data_incepere + 29
               else coalesce(e.data_final, 'infinity'::date) end,
          coalesce((e.data_reziliere::date - 1), 'infinity'::date)
        ) >= greatest(e.data_incepere, p_de)
  group by e.cursul;
$$;

revoke execute on function locuri_ocupate(date, date, uuid[]) from anon, public;
grant execute on function locuri_ocupate(date, date, uuid[]) to authenticated;

-- ============================================================
-- 2. Numărătoarea lunară = locurile ocupate în lună
-- ============================================================
-- Semnătura rămâne (o cheamă _grupe_sub_minim și simulările de bonus).
-- Schimbare de fond: ședința de pe 25 sept. ține locul și în octombrie.
create or replace function cursanti_platitori_luna(p_curs uuid, p_luna date)
returns int
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce((
    select lo.ocupate
    from locuri_ocupate(
      date_trunc('month', p_luna)::date,
      (date_trunc('month', p_luna) + interval '1 month' - interval '1 day')::date,
      array[p_curs]
    ) lo
  ), 0);
$$;

-- ============================================================
-- 3. Overview pe locații
-- ============================================================
create or replace function get_ocupare_locatii()
returns table (
  locatie_id   uuid,
  locatie_nume text,
  ocupate      integer,
  capacitate   integer
)
language sql
stable
security invoker
set search_path = public
as $$
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
  select l.id, l.nume, coalesce(sum(lo.ocupate), 0)::int, sum(g.cap)::int
  from grupe g
  join locatii l on l.id = g.locatie
  left join locuri lo on lo.curs_id = g.id
  group by l.id, l.nume
  order by sum(g.cap) desc, l.nume;
$$;

-- ============================================================
-- 4. Listele pe grupă (/statistici, /analytics, Grupele mele)
-- ============================================================
-- Coloana `media` (media prezenților pe ședință) dispare odată cu vârful de
-- ședință; schimbarea tipului de retur cere drop.
drop function if exists get_grad_ocupare(uuid);

create function get_grad_ocupare(p_locatie uuid default null)
returns table (
  curs_id      uuid,
  curs_nume    text,
  locatie_nume text,
  teacher_nume text,
  facultativ   boolean,
  activi       integer,
  capacitate   integer,
  procent      numeric
)
language sql
stable
security invoker
set search_path = public
as $$
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
$$;

revoke execute on function get_grad_ocupare(uuid) from anon, public;
grant execute on function get_grad_ocupare(uuid) to authenticated;

-- ============================================================
-- 5. Lista /cursuri — coloana „înscriși / capacitate"
-- ============================================================
-- Identic cu vechea definiție, în afară de `act`. bigint rămâne tipul coloanei.
create or replace view lista_cursuri with (security_invoker = true) as
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
    COALESCE(act.inscrisi, 0::bigint) AS inscrisi,
    c.capacitate_maxima,
    i.id AS id_teacher,
    i.nume,
    i.prenume,
    i.telefon,
    i.nivelul AS nivel_teacher,
    s.nume AS sala,
    COALESCE(l_direct.nume, l_sala.nume) AS locatie,
    COALESCE(c.locatie, s.locatie) AS id_locatie,
    0 AS balance
   FROM cursuri c
     LEFT JOIN teacheri i ON c.teacher = i.id
     LEFT JOIN sali s ON s.id = c.sala
     LEFT JOIN locatii l_sala ON l_sala.id = s.locatie
     LEFT JOIN locatii l_direct ON l_direct.id = c.locatie
     LEFT JOIN LATERAL ( SELECT lo.ocupate::bigint AS inscrisi
           FROM locuri_ocupate(CURRENT_DATE, CURRENT_DATE, ARRAY[c.id]) lo) act ON true
     LEFT JOIN LATERAL ( SELECT COALESCE(array_agg(DISTINCT x.h ORDER BY x.h) FILTER (WHERE x.h IS NOT NULL),
                CASE
                    WHEN c.ora IS NULL THEN NULL::text[]
                    ELSE ARRAY[c.ora]
                END) AS ore_start
           FROM unnest(COALESCE(c.zile, '{}'::zi_saptamana[])) z(z)
             CROSS JOIN LATERAL ( SELECT COALESCE(c.ore_pe_zi ->> z.z::text, c.ora) AS h) x) os ON true;
