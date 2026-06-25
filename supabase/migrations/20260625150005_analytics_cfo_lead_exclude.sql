-- Qapp v2 — (A) Exclude nurture din statisticile de leads + (B) CFO pack.
--
-- (A) Cele ~5.430 de lead-uri status='nurture' sunt importul v1/pre-v1 (ex-clienți
-- istorici, unele >10 ani, amestecate). Userul le ține ca pool de nurture pentru
-- viitoare campanii email — NU trebuie să polueze funnel-ul/conversia. Le excludem
-- din get_lead_funnel, get_conversie_leads, get_leads_pe_luna (status <> 'nurture').
--
-- (B) CFO pack: MRR (recurring revenue lunar) + rata de încasare/DSO.

-- ============================================================
-- (A1) Funnel — exclude nurture
-- ============================================================
create or replace function get_lead_funnel(
  p_from    date,
  p_to      date,
  p_locatie text default null
)
returns table (
  sursa_id           uuid,
  sursa_nume         text,
  leads_total        integer,
  contactati         integer,
  proba              integer,
  prezenti           integer,
  convertiti         integer,
  retentie_eligibili integer,
  retentie_90z       integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with baza as (
    select
      l.sursa,
      (l.nr_contactari > 0 or l.ultima_contactare_la is not null
        or l.status <> 'nou')                                     as s_contact,
      (l.data_programare is not null
        or exists (select 1 from programari_leads pl
                   where pl.lead = l.id))                          as s_proba,
      (l.status = 'a_venit'
        or exists (select 1 from programari_leads pl
                   where pl.lead = l.id and pl.prezenta = 'prezent')) as s_prezent,
      (l.id_client is not null)                                   as s_convertit,
      (l.id_client is not null and l.data_conversie is not null
        and l.data_conversie::date <= current_date - 90)          as s_matur,
      (l.id_client is not null and l.data_conversie is not null
        and l.data_conversie::date <= current_date - 90
        and exists (
          select 1
          from enrollments e
          join prezente p on p.enrollment = e.id
          where e.client = l.id_client
            and e.reziliat = false
            and p.status = 'Prezent'
            and p.data >= l.data_conversie::date + 90
        ))                                                        as s_retinut
    from leads l
    where l.created::date between p_from and p_to
      and l.status <> 'nurture'
      and (p_locatie is null or l.locatia = p_locatie)
  )
  select
    b.sursa                                            as sursa_id,
    coalesce(c.nume, 'Necunoscută')                    as sursa_nume,
    count(*)::int                                      as leads_total,
    count(*) filter (where b.s_contact or b.s_proba or b.s_prezent
                        or b.s_convertit)::int          as contactati,
    count(*) filter (where b.s_proba or b.s_prezent
                        or b.s_convertit)::int          as proba,
    count(*) filter (where b.s_prezent or b.s_convertit)::int as prezenti,
    count(*) filter (where b.s_convertit)::int          as convertiti,
    count(*) filter (where b.s_matur)::int              as retentie_eligibili,
    count(*) filter (where b.s_retinut)::int            as retentie_90z
  from baza b
  left join campanii_promovare c on c.id = b.sursa
  group by b.sursa, c.nume
  order by leads_total desc;
$$;

grant execute on function get_lead_funnel(date, date, text) to authenticated;

-- ============================================================
-- (A2) Conversie leads — exclude nurture
-- ============================================================
create or replace function get_conversie_leads(p_luni integer default 6)
returns table (
  total_leads  integer,
  convertiti   integer,
  procent      numeric,
  zile_medii   numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with bounds as (
    select (date_trunc('month', current_date)
            - make_interval(months => greatest(coalesce(p_luni,6),1) - 1))::date as start_luna
  ),
  lead_set as (
    select l.status, l.data_conversie, l.created
    from leads l, bounds b
    where l.created >= b.start_luna
      and l.status <> 'nurture'
  )
  select
    count(*)::int as total_leads,
    count(*) filter (where status = 'convertit')::int as convertiti,
    case when count(*) > 0
         then round(100.0 * count(*) filter (where status = 'convertit') / count(*), 1)
         else 0 end as procent,
    round(avg(extract(epoch from (data_conversie - created)) / 86400.0)
          filter (where status = 'convertit' and data_conversie is not null), 1) as zile_medii
  from lead_set;
$$;

grant execute on function get_conversie_leads(integer) to authenticated;

-- ============================================================
-- (A3) Leads pe lună — exclude nurture
-- ============================================================
create or replace function get_leads_pe_luna(
  p_from    date,
  p_to      date,
  p_locatie text default null
)
returns table (
  luna       text,
  leads      int,
  convertiti int
)
language sql
stable
security invoker
set search_path = public
as $$
  with months as (
    select to_char(gs, 'YYYY-MM') as luna
    from generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month') gs
  ),
  agg as (
    select to_char(date_trunc('month', l.created), 'YYYY-MM') as luna,
           count(*)::int as leads,
           count(*) filter (where l.status = 'convertit')::int as convertiti
    from leads l
    where l.created >= date_trunc('month', p_from)
      and l.created < date_trunc('month', p_to) + interval '1 month'
      and l.status <> 'nurture'
      and (p_locatie is null or l.locatia = p_locatie)
    group by 1
  )
  select m.luna, coalesce(a.leads, 0), coalesce(a.convertiti, 0)
  from months m
  left join agg a on a.luna = m.luna
  order by m.luna;
$$;

grant execute on function get_leads_pe_luna(date, date, text) to authenticated;

-- ============================================================
-- (B1) get_mrr_trend — venit recurent lunar (MRR) pe ultimele p_luni
--    MRR = Σ valoare lunară a înrolărilor recurente active care acoperă luna.
--    'Per an' = suma/12 (echivalent lunar). 'Per sedinta' = exclus (nu e recurent).
-- ============================================================
create or replace function get_mrr_trend(
  p_luni    int default 12,
  p_locatie uuid default null
)
returns table (
  luna     text,
  mrr      numeric,
  enrolari int
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
      date_trunc('month', current_date) - make_interval(months => greatest(coalesce(p_luni, 12), 1) - 1),
      date_trunc('month', current_date),
      interval '1 month'
    ) gs
  ),
  rec as (
    select e.id, e.tip_plata, e.suma, e.data_incepere, e.data_final
    from enrollments e
    join cursuri c on c.id = e.cursul
    where e.activ = true and e.reziliat = false
      and e.tip_plata in ('Per luna', 'Per an')
      and (p_locatie is null or c.locatie = p_locatie)
  )
  select m.luna,
         coalesce(sum(case r.tip_plata when 'Per an' then coalesce(r.suma, 0) / 12.0
                                       else coalesce(r.suma, 0) end), 0) as mrr,
         count(r.id)::int as enrolari
  from months m
  left join rec r on r.data_incepere <= m.m_end
                 and (r.data_final is null or r.data_final >= m.m_start)
  where is_admin()
  group by m.luna
  order by m.luna;
$$;

grant execute on function get_mrr_trend(int, uuid) to authenticated;

-- ============================================================
-- (B2) get_colectare_dso — rata de încasare + DSO (zile creanțe restante)
--    facturat = Σ suma înrolări cu data_incepere în interval;
--    incasat  = Σ încasări cu data în interval;
--    DSO ≈ restanțe net / (facturat/zile interval).
-- ============================================================
create or replace function get_colectare_dso(p_from date, p_to date)
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
  with f as (
    select coalesce(sum(e.suma), 0) as facturat
    from enrollments e
    where e.reziliat = false and e.data_incepere between p_from and p_to
  ),
  i as (
    select coalesce(sum(suma), 0) as incasat
    from incasari where data between p_from and p_to
  ),
  r as (
    select coalesce(sum(rest), 0) as rest_net
    from (
      select coalesce(e.suma, 0)
             - coalesce((select sum(x.suma) from incasari x where x.inregistrare = e.id), 0) as rest,
             (e.data_incepere < current_date - interval '2 years') as prescris
      from enrollments e
      where e.reziliat = false and e.data_incepere between p_from and p_to
    ) z
    where rest > 0 and not prescris
  )
  select
    f.facturat,
    i.incasat,
    case when f.facturat > 0 then round(100.0 * i.incasat / f.facturat, 1) else null end as rata_colectare,
    r.rest_net,
    case when f.facturat > 0 then round(r.rest_net / (f.facturat / nullif((p_to - p_from) + 1, 0)), 0) else null end as dso_zile
  from f, i, r
  where is_admin();
$$;

grant execute on function get_colectare_dso(date, date) to authenticated;
