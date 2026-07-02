-- CFO — coerentizarea condițiilor de numărare (decis cu user 2026-07-02).
--
-- Auditul CFO a arătat că același concept (interval, locație, facultativ, prescris,
-- „activ") era filtrat diferit de la o cifră la alta. Rescriem cele 4 RPC-uri astfel
-- încât filtrele conduc coerent toate secțiunile și fiecare cifră are o bază unică:
--   1. Interval → conduce MRR + Rentabilitate (nu doar Colectare).
--   2. Locație → filtrează și Colectare/DSO (prin înrolare→curs→locație).
--   3. Rata colectare = plăți ATAȘATE înrolărilor din interval / facturat (cohortă).
--   4. Prescris (>2 ani) exclus din TOT cardul Colectare.
--   5. LTV = două numere: total (toate încasările) + recurent (doar recurent).
--   6. MRR split: recurent (abonamente) + facultativ lunar, separat.
--   7. „activi" din Rentabilitate = definiția canonică (inrolari_active_la), luna curentă.
--       (deja introdusă în 20260702180000; aici trecem doar de la p_luni la interval).
--
-- Vine DUPĂ 20260702180000 (care redefinise deja get_rentabilitate_grupa la (int,uuid)).
-- Toate schimbă semnătura sau coloanele de retur → drop + recreate.

drop function if exists get_mrr_trend(int, uuid);
drop function if exists get_colectare_dso(date, date);
drop function if exists get_durata_medie_ltv(uuid);
drop function if exists get_rentabilitate_grupa(int, uuid);

-- ============================================================
-- get_mrr_trend — MRR pe intervalul [p_from, p_to], split recurent/facultativ
--   MRR recurent    = abonamente pe cursuri NE-facultative (banii predictibili).
--   MRR facultativ  = cursuri facultative cu plată lunară/anuală (venit lunar, dar
--                     fără angajament recurent) — afișat separat.
--   'Per an' = suma/12 (echivalent lunar). 'Per sedinta' = exclus.
-- ============================================================
create or replace function get_mrr_trend(
  p_from    date,
  p_to      date,
  p_locatie uuid default null
)
returns table (
  luna                text,
  mrr_recurent        numeric,
  mrr_facultativ      numeric,
  enrolari_recurent   int,
  enrolari_facultativ int
)
language sql
stable
security invoker
set search_path = public
as $$
  with months as (
    select to_char(gs, 'YYYY-MM') as luna,
           gs::date as m_start,
           (gs + interval '1 month' - interval '1 day')::date as m_end
    from generate_series(
      date_trunc('month', p_from),
      date_trunc('month', p_to),
      interval '1 month'
    ) gs
  ),
  rec as (
    select e.id, e.tip_plata, e.suma, e.data_incepere, e.data_final,
           coalesce(c.facultativ, false) as facultativ
    from enrollments e
    join cursuri c on c.id = e.cursul
    where e.activ = true and e.reziliat = false
      and e.tip_plata in ('Per luna', 'Per an')
      and (p_locatie is null or c.locatie = p_locatie)
  )
  select m.luna,
         coalesce(sum(case when not r.facultativ
             then (case r.tip_plata when 'Per an' then coalesce(r.suma, 0) / 12.0 else coalesce(r.suma, 0) end)
             else 0 end), 0) as mrr_recurent,
         coalesce(sum(case when r.facultativ
             then (case r.tip_plata when 'Per an' then coalesce(r.suma, 0) / 12.0 else coalesce(r.suma, 0) end)
             else 0 end), 0) as mrr_facultativ,
         count(case when not r.facultativ then r.id end)::int as enrolari_recurent,
         count(case when r.facultativ then r.id end)::int as enrolari_facultativ
  from months m
  left join rec r on r.data_incepere <= m.m_end
                 and (r.data_final is null or r.data_final >= m.m_start)
  where is_admin()
  group by m.luna
  order by m.luna;
$$;

grant execute on function get_mrr_trend(date, date, uuid) to authenticated;

-- ============================================================
-- get_colectare_dso — rata de încasare + DSO, pe COHORTA facturată în interval
--   facturat     = Σ suma înrolări NE-reziliate, NE-prescrise, data_incepere ∈ interval
--                  (opțional filtrat pe locație prin curs).
--   incasat      = Σ plăți ATAȘATE acelor înrolări (incasari.inregistrare = e.id).
--   rata         = 100 * incasat / facturat (numărător și numitor pe aceeași cohortă).
--   restante_net = Σ (suma − plătit) > 0 pe aceeași cohortă.
--   DSO ≈ restanțe net / (facturat / zile interval).
-- ============================================================
create or replace function get_colectare_dso(
  p_from    date,
  p_to      date,
  p_locatie uuid default null
)
returns table (
  facturat       numeric,
  incasat        numeric,
  rata_colectare numeric,
  restante_net   numeric,
  dso_zile       numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with elig as (
    select e.id, coalesce(e.suma, 0) as suma
    from enrollments e
    join cursuri c on c.id = e.cursul
    where e.reziliat = false
      and e.data_incepere between p_from and p_to
      and e.data_incepere >= current_date - interval '2 years'   -- exclude prescris
      and (p_locatie is null or c.locatie = p_locatie)
  ),
  pay as (
    select el.suma,
           coalesce((select sum(x.suma) from incasari x where x.inregistrare = el.id), 0) as platit
    from elig el
  ),
  agg as (
    select coalesce(sum(suma), 0) as facturat,
           coalesce(sum(platit), 0) as incasat,
           coalesce(sum(case when suma - platit > 0 then suma - platit else 0 end), 0) as restante_net
    from pay
  )
  select
    facturat,
    incasat,
    case when facturat > 0 then round(100.0 * incasat / facturat, 1) else null end as rata_colectare,
    restante_net,
    case when facturat > 0 then round(restante_net / (facturat / nullif((p_to - p_from) + 1, 0)), 0) else null end as dso_zile
  from agg
  where is_admin();
$$;

grant execute on function get_colectare_dso(date, date, uuid) to authenticated;

-- ============================================================
-- get_durata_medie_ltv — durată medie + LTV total ȘI recurent
--   durata  = luni min→max prezență pe cursuri recurente (facultativ=false).
--   ltv_total    = Σ TOATE încasările / client (abonament + bilet + merch + taxă).
--   ltv_recurent = Σ încasările atașate înrolărilor recurente / client (coerent cu durata).
--   Ambele mediate pe populația de clienți cu prezență recurentă (deja scoped pe locație).
-- ============================================================
create or replace function get_durata_medie_ltv(p_locatie uuid default null)
returns table (
  durata_medie_luni numeric,
  ltv_total         numeric,
  ltv_recurent      numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with prez as (
    select p.client,
           min(date_trunc('month', p.data)) as m0,
           max(date_trunc('month', p.data)) as m1
    from prezente p
    join enrollments e on e.id = p.enrollment
    join cursuri c on c.id = e.cursul
    where p.status = 'Prezent'
      and coalesce(c.facultativ, false) = false
      and p.client is not null
      and p.data is not null
      and (p_locatie is null or c.locatie = p_locatie)
    group by p.client
  ),
  durata as (
    select client,
           (extract(year from age(m1, m0)) * 12 + extract(month from age(m1, m0)) + 1)::numeric as luni
    from prez
  ),
  ltv_all as (
    select i.client, sum(i.suma) as total
    from incasari i
    where i.client is not null
    group by i.client
  ),
  ltv_rec as (
    select i.client, sum(i.suma) as total
    from incasari i
    join enrollments e on e.id = i.inregistrare
    join cursuri c on c.id = e.cursul
    where i.client is not null and coalesce(c.facultativ, false) = false
    group by i.client
  )
  select
    round(avg(d.luni), 1) as durata_medie_luni,
    case when is_admin() then round(avg(coalesce(la.total, 0)), 0) else null end as ltv_total,
    case when is_admin() then round(avg(coalesce(lr.total, 0)), 0) else null end as ltv_recurent
  from durata d
  left join ltv_all la on la.client = d.client
  left join ltv_rec lr on lr.client = d.client;
$$;

grant execute on function get_durata_medie_ltv(uuid) to authenticated;

-- ============================================================
-- get_rentabilitate_grupa — marjă per grupă pe intervalul [p_from, p_to]
--   incasari         = din incasari_curs_luna pe lunile din interval, pe curs.
--   salariu_atribuit = salariu titular / nr. cursuri ale titularului (aproximare).
--   activi           = definiția CANONICĂ (inrolari_active_la) la data curentă,
--                      distinct clienți pe curs. Interval mișcă doar încasările.
--   (față de 20260702180000: p_luni → p_from/p_to; restul identic.)
-- ============================================================
create or replace function get_rentabilitate_grupa(
  p_from    date,
  p_to      date,
  p_locatie uuid default null
)
returns table (
  curs_id          uuid,
  curs_nume        text,
  locatie_nume     text,
  incasari         numeric,
  salariu_atribuit numeric,
  marja            numeric,
  activi           int
)
language sql
stable
security invoker
set search_path = public
as $$
  with months as (
    select to_char(gs, 'YYYY-MM') as luna,
           extract(year from gs)::int as anul,
           extract(month from gs)::int as luna_num
    from generate_series(
      date_trunc('month', p_from),
      date_trunc('month', p_to),
      interval '1 month'
    ) gs
  ),
  inc as (
    select v.id_curs as cid, sum(v.total) as s
    from incasari_curs_luna v
    join months m on v.luna = m.luna
    where v.id_curs is not null
    group by v.id_curs
  ),
  teacher_courses as (
    select c.teacher as tid, count(*)::numeric as nc
    from cursuri c
    where c.teacher is not null and coalesce(c.suspendat, false) = false
    group by c.teacher
  ),
  sal_teacher as (
    select st.teacher as tid, sum(st.total) as s
    from salarii_teacher st
    join months m on st.anul = m.anul and st.luna = m.luna_num
    group by st.teacher
  ),
  sal_curs as (
    select c.id as cid, coalesce(stt.s, 0) / nullif(tc.nc, 0) as sal
    from cursuri c
    left join teacher_courses tc on tc.tid = c.teacher
    left join sal_teacher stt on stt.tid = c.teacher
  ),
  act as (
    select ia.cursul as cid, count(distinct ia.client)::int as n
    from inrolari_active_la(current_date) ia
    group by ia.cursul
  )
  select c.id, c.numele, loc.nume,
         coalesce(inc.s, 0) as incasari,
         coalesce(sc.sal, 0) as salariu_atribuit,
         coalesce(inc.s, 0) - coalesce(sc.sal, 0) as marja,
         coalesce(a.n, 0) as activi
  from cursuri c
  left join inc on inc.cid = c.id
  left join sal_curs sc on sc.cid = c.id
  left join act a on a.cid = c.id
  left join locatii loc on loc.id = c.locatie
  where is_admin()
    and coalesce(c.suspendat, false) = false
    and coalesce(c.facultativ, false) = false
    and (p_locatie is null or c.locatie = p_locatie)
    and (coalesce(inc.s, 0) <> 0 or coalesce(a.n, 0) > 0)
  order by coalesce(inc.s, 0) - coalesce(sc.sal, 0) asc;
$$;

grant execute on function get_rentabilitate_grupa(date, date, uuid) to authenticated;
