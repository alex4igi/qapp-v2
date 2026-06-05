-- View: stats per curs pentru profilul teacher (Tab Cursuri)
-- Coloane: clienti_activi, clienti_inscrisi, balanta — toate filtrate pe cursul în sine
-- (enrollments la un curs aparțin implicit sezonului acelui curs).

create or replace view teacher_curs_stats as
select
  c.id                 as curs_id,
  c.teacher            as teacher_id,
  c.numele             as curs_nume,
  c.sezon              as curs_sezon,
  c.nivelul            as curs_nivel,
  c.facultativ         as facultativ,
  c.zile               as zile,
  c.ora                as ora,
  -- Clienți activi: enrollments active la momentul curent (snapshot „acum")
  (select count(distinct e.client)
     from enrollments e
    where e.cursul = c.id
      and e.activ = true
      and e.reziliat = false
      and coalesce(e.data_incepere, '1900-01-01'::date) <= current_date
      and (e.data_final is null or e.data_final >= current_date)
  )::int                as clienti_activi,
  -- Clienți înscriși: distinct enrollments la curs (de la începutul sezonului cursului)
  (select count(distinct e.client)
     from enrollments e
    where e.cursul = c.id
  )::int                as clienti_inscrisi,
  -- Balanță = încasări (pe enrollments la acest curs) − sume datorate (sume enrollments ne-reziliate)
  (
    coalesce((select sum(i.suma)
                from incasari i
                join enrollments e on e.id = i.inregistrare
               where e.cursul = c.id), 0)
    - coalesce((select sum(e.suma)
                  from enrollments e
                 where e.cursul = c.id
                   and e.reziliat = false), 0)
  )::numeric            as balanta
from cursuri c;

alter view teacher_curs_stats set (security_invoker = true);
