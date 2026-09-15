-- Gradul de ocupare pe locație: locuri ocupate azi / capacitatea tuturor grupelor.
--
-- Regula owner-ului (15 sept. 2026), generală: ocuparea se raportează la
-- capacitatea maximă a grupei indiferent de tip — recurent, trupă sau facultativ.
-- O ședință plătită ține locul 30 de zile de la data ei (ziua ședinței + 29).
-- Abonamentele țin locul cât le acoperă fereastra.
--
-- Înlocuiește pe Overview suma peste get_grad_ocupare, care scotea facultativele
-- și număra la ele vârful de ședință. get_grad_ocupare rămâne neatinsă — are
-- listele pe grupă din /statistici și /analytics.
--
-- Locurile se adună pe grupe: un copil la 2 grupe ocupă 2 locuri.
-- Cursant = definiția de plătitor din cursanti_platitori_luna: suma > 0, fără
-- data_reziliere trecută. NU `reziliat` — bifa se pune și pe lunile încheiate.
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
    select g.id, count(distinct e.client)::int as n
    from grupe g
    join enrollments e on e.cursul = g.id
    where e.client is not null
      and e.suma > 0
      and e.data_incepere <= current_date
      -- Ședința ignoră data_final: din 2026-2027 e NULL (ar ține locul la
      -- infinit), iar în sezoanele vechi nu înseamnă 30 de zile.
      and case when e.tip_plata = 'Per sedinta' then e.data_incepere + 29
               else coalesce(e.data_final, 'infinity'::date) end >= current_date
      and (e.data_reziliere is null or e.data_reziliere::date > current_date)
      -- O rezervare OPEN anulată doar stinge `activ` (anuleaza_rezervare_open),
      -- fără dată de reziliere și cu suma plătită păstrată.
      and (e.tip_plata <> 'Per sedinta' or e.activ)
    group by g.id
  )
  select l.id, l.nume, coalesce(sum(lo.n), 0)::int, sum(g.cap)::int
  from grupe g
  join locatii l on l.id = g.locatie
  left join locuri lo on lo.id = g.id
  group by l.id, l.nume
  order by sum(g.cap) desc, l.nume;
$$;

revoke execute on function get_ocupare_locatii() from anon, public;
grant execute on function get_ocupare_locatii() to authenticated;
