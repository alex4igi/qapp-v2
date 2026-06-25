-- Qapp v2 — Fix: trend clienți per instructor să captureze PIERDERILE.
--
-- PROBLEMĂ (smoke test): get_instructori_clienti_trend filtra e.activ=true AND
-- e.reziliat=false → un client reziliat dispărea din TOATE lunile, deci nu apărea
-- niciodată ca pierdere (retenție 100% peste tot, delta doar pozitiv). Userul a
-- cerut explicit „dacă instructorul pierde/câștigă clienți" → trebuie să vedem și
-- scăderile.
--
-- SOLUȚIE: headcount-ul lunii M = clienți cu înrolare care acoperă M, unde
-- reziliații sunt număraţi până la luna rezilierii (coalesce data_reziliere →
-- data_final → updated), apoi cad. Astfel luna curentă = roster activ (reziliații
-- au ieșit), iar un client plecat luna trecută apare ca delta negativ + retenție
-- sub 100%.

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
           (gs + interval '1 month' - interval '1 day')::date as m_end,
           row_number() over (order by gs)::int as idx
    from generate_series(
      date_trunc('month', current_date) - make_interval(months => greatest(coalesce(p_luni, 6), 1) - 1),
      date_trunc('month', current_date),
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
    select distinct tc.tid, m.idx, e.client
    from tc
    join enrollments e on e.cursul = tc.curs_id
    join months m on e.data_incepere <= m.m_end
      and (
        case
          when e.reziliat
            then coalesce(e.data_reziliere, e.data_final, e.updated::date) >= m.m_start
          else (e.data_final is null or e.data_final >= m.m_start)
        end
      )
    where e.client is not null
      and (e.activ = true or e.reziliat = true)
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
