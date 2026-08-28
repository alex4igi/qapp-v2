-- Lista de cursuri: filtre + coloane pentru „Tip curs" și „Ora începerii".
-- Tipul nu e o coloană în `cursuri` — se derivă din facultativ + nivelul='Trupa'
-- (aceeași regulă ca în CursForm/DetaliiTab), deci expunem `facultativ` ca să
-- poată fi filtrat server-side.
-- Ora: un curs poate avea orar diferit pe zile (`ore_pe_zi`), deci ținem
--   ore_start = toate orele de start distincte (după regula de afișare: pentru
--              fiecare zi din `zile`, ora din map, cu fallback pe `ora`)
--   ora_start = cea mai devreme (sortare + coloană compactă)
-- Filtrul „la ora X" folosește ore_start @> {X} ca să prindă și cursurile cu
-- orar mixt, nu doar prima lor oră.

drop view if exists lista_cursuri;

create view lista_cursuri as
select
  c.id,
  c.numele as numele_cursului,
  c.sezon,
  c.zile,
  c.nivelul,
  c.facultativ,
  c.ora,
  c.ore_pe_zi,
  os.ore_start,
  os.ore_start[1] as ora_start,
  coalesce(act.inscrisi, 0) as inscrisi,
  c.capacitate_maxima,
  i.id as id_teacher,
  i.nume,
  i.prenume,
  i.telefon,
  i.nivelul as nivel_teacher,
  s.nume as sala,
  coalesce(l_direct.nume, l_sala.nume) as locatie,
  coalesce(c.locatie, s.locatie) as id_locatie,
  0 as balance
from cursuri c
left join teacheri i on c.teacher = i.id
left join sali s on s.id = c.sala
left join locatii l_sala on l_sala.id = s.locatie
left join locatii l_direct on l_direct.id = c.locatie
left join lateral (
  select count(distinct a.client) as inscrisi
  from inrolari_active_la(current_date) a
  join enrollments e on e.id = a.enrollment_id
  where a.cursul = c.id
    and (not coalesce(c.facultativ, false) or e.tip_plata in ('Per luna', 'Per an'))
) act on true
left join lateral (
  select coalesce(
    array_agg(distinct x.h order by x.h) filter (where x.h is not null),
    case when c.ora is null then null else array[c.ora] end
  ) as ore_start
  from unnest(coalesce(c.zile, '{}'::zi_saptamana[])) as z
  cross join lateral (select coalesce(c.ore_pe_zi ->> z::text, c.ora) as h) x
) os on true;

alter view lista_cursuri set (security_invoker = true);
