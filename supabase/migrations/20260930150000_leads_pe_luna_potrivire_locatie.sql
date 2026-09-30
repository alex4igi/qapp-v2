-- Panou → „Leads pe lună" primea numele locației din `locatii` („Galeriile Stefan cel Mare")
-- și îl compara cu `=` cu eticheta scurtă din `leads.locatia` („Ștefan cel Mare"): graficul
-- ieșea gol pe Ștefan. Aceeași potrivire normalizată ca pâlnia de leaduri (20260917140000).
create or replace function public.get_leads_pe_luna(p_from date, p_to date, p_locatie text default null)
returns table(luna text, leads integer, convertiti integer)
language sql
stable
set search_path to 'public'
as $function$
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
      and (p_locatie is null or locatie_label_match(l.locatia, p_locatie))
    group by 1
  )
  select m.luna, coalesce(a.leads, 0), coalesce(a.convertiti, 0)
  from months m
  left join agg a on a.luna = m.luna
  order by m.luna;
$function$;

revoke execute on function public.get_leads_pe_luna(date, date, text) from anon, public;
