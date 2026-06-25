-- Qapp v2 — Trend clienți per instructor pe PREZENȚĂ (luni încheiate).
--
-- DECIZIE: acoperirea pe înrolare nu poate detecta churn-ul (data_reziliere e rar
-- populat, recurentele au data_final NULL) → retenția ieșea 100% peste tot. Restul
-- aplicației măsoară churn pe prezență (get_retentie_membri, get_retentie_cohorte).
-- Aliniem și „câți clienți are / pierde-câștigă instructorul" la prezență:
--   headcount lună = clienți distincți cu ≥1 „Prezent" la cursurile instructorului;
--   ferestrele sunt luni ÎNCHEIATE (luna curentă e incompletă → ar arăta fals mic);
--   cur = ultima lună încheiată, prev = cea dinainte; retenție = din prev câți și în cur.
-- Astfel „pierde clienți" devine real (cine nu mai vine), nu doar câștiguri.

create or replace function get_instructori_clienti_trend(p_luni int default 6)
returns table (
  teacher_id       uuid,
  teacher_nume     text,
  clienti_curent   int,
  clienti_prev     int,
  delta            int,
  retentie_procent numeric,
  serie            int[]
)
language sql
stable
security invoker
set search_path = public
as $$
  with months as (
    select gs::date as m_start,
           row_number() over (order by gs)::int as idx
    from generate_series(
      date_trunc('month', current_date) - make_interval(months => greatest(coalesce(p_luni, 6), 1)),
      date_trunc('month', current_date) - interval '1 month',
      interval '1 month'
    ) gs
  ),
  maxidx as (select max(idx) as mx from months),
  tc as (
    select c.id as curs_id, c.teacher as tid from cursuri c where c.teacher is not null
    union
    select ct.curs_id, ct.teacher_id from cursuri_teacheri ct
  ),
  tcm as (
    select distinct tc.tid, m.idx, p.client
    from tc
    join enrollments e on e.cursul = tc.curs_id
    join prezente p on p.enrollment = e.id
    join months m on date_trunc('month', p.data)::date = m.m_start
    where p.status = 'Prezent' and p.client is not null and p.data is not null
  ),
  per as (
    select tid, idx, count(distinct client)::int as n
    from tcm group by tid, idx
  ),
  agg as (
    select t.id as tid,
      coalesce((select n from per p where p.tid = t.id and p.idx = (select mx from maxidx)), 0) as cur,
      coalesce((select n from per p where p.tid = t.id and p.idx = (select mx from maxidx) - 1), 0) as prev,
      (select count(distinct a.client)::int
         from tcm a
         where a.tid = t.id and a.idx = (select mx from maxidx) - 1
           and exists (select 1 from tcm b
                       where b.tid = a.tid and b.idx = (select mx from maxidx) and b.client = a.client)
      ) as retinuti,
      (select count(distinct a.client)::int from tcm a
         where a.tid = t.id and a.idx = (select mx from maxidx) - 1) as baza_prev,
      (select array_agg(coalesce((select n from per p where p.tid = t.id and p.idx = m.idx), 0) order by m.idx)
         from months m) as serie
    from teacheri t
    where coalesce(t.arhivat, false) = false
  )
  select agg.tid,
         trim(format('%s %s', coalesce(tt.prenume, ''), tt.nume)) as teacher_nume,
         agg.cur, agg.prev, (agg.cur - agg.prev) as delta,
         case when agg.baza_prev > 0 then round(100.0 * agg.retinuti / agg.baza_prev, 0) else null end as retentie_procent,
         agg.serie
  from agg
  join teacheri tt on tt.id = agg.tid
  where agg.cur > 0 or agg.prev > 0 or (select bool_or(x > 0) from unnest(agg.serie) x)
  order by agg.cur desc, (agg.cur - agg.prev) desc;
$$;

grant execute on function get_instructori_clienti_trend(int) to authenticated;
