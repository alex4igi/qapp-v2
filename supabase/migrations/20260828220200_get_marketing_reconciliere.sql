-- Reconciliere CRM ↔ Google/Meta Ads: zi × platformă × campanie.
--
-- Două perspective pe același rând, pentru că răspund la întrebări diferite:
--   * `leads_in_crm` + funnel — ce EXISTĂ în CRM (istoric complet)
--   * `intake_*` — ce s-a PRIMIT efectiv de la platformă (doar din 28-08-2026,
--     de când scrie `leads_intake_log`)
-- Diferența dintre ele e exact ce nu se putea explica până acum: dedup-ul pe
-- telefon din `insertLead` arunca evenimentele repetate, deci Meta raporta 50 și
-- CRM-ul arăta 43. Cu logul: 50 = 43 create + 7 persoane deja în bază.
--
-- Cheia de grupare e limbajul agenției (platformă + campanie), nu al CRM-ului
-- (`campanii_promovare.sursa` pune toate lead-urile Meta sub un singur rând).
create or replace function get_marketing_reconciliere(
  p_from date,
  p_to   date
)
returns table (
  zi                date,
  platforma         text,
  campanie_ads      text,
  sursa_crm         text,
  leads_in_crm      integer,
  contactati        integer,
  prezenti          integer,
  convertiti        integer,
  intake_evenimente integer,
  intake_creat      integer,
  intake_duplicat   integer,
  intake_respins    integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if is_parinte() or auth_role() not in
     ('owner', 'admin', 'manager', 'front_desk', 'marketing') then
    raise exception 'Acces refuzat.';
  end if;

  return query
  with din_leads as (
    select
      l.created::date                                             as zi,
      lower(coalesce(l.platform, l.utm_source, 'necunoscut'))     as platforma,
      coalesce(l.campaign_id, l.utm_campaign, '—')                as campanie_ads,
      coalesce(c.nume, 'Necunoscută')                             as sursa_crm,
      count(*)::int                                               as leads_in_crm,
      count(*) filter (
        where l.nr_contactari > 0 or l.ultima_contactare_la is not null
           or l.status <> 'nou')::int                             as contactati,
      count(*) filter (
        where l.status in ('a_venit', 'convertit')
           or exists (select 1 from programari_leads pl
                      where pl.lead = l.id and pl.prezenta = 'prezent'))::int as prezenti,
      count(*) filter (where l.status = 'convertit')::int         as convertiti
    from leads l
    left join campanii_promovare c on c.id = l.sursa
    where l.created::date between p_from and p_to
    group by 1, 2, 3, 4
  ),
  din_log as (
    select
      g.created::date                                                       as zi,
      lower(coalesce(g.platform, g.utm_source, split_part(g.canal, '_', 1))) as platforma,
      coalesce(g.campaign_id, g.utm_campaign, '—')                          as campanie_ads,
      count(*)::int                                                         as intake_evenimente,
      count(*) filter (where g.rezultat = 'creat')::int                     as intake_creat,
      count(*) filter (where g.rezultat like 'duplicat%')::int              as intake_duplicat,
      count(*) filter (where g.rezultat = 'respins_validare')::int          as intake_respins
    from leads_intake_log g
    where g.created::date between p_from and p_to
    group by 1, 2, 3
  )
  select
    coalesce(dl.zi, lg.zi),
    coalesce(dl.platforma, lg.platforma),
    coalesce(dl.campanie_ads, lg.campanie_ads),
    coalesce(dl.sursa_crm, '—'),
    coalesce(dl.leads_in_crm, 0),
    coalesce(dl.contactati, 0),
    coalesce(dl.prezenti, 0),
    coalesce(dl.convertiti, 0),
    coalesce(lg.intake_evenimente, 0),
    coalesce(lg.intake_creat, 0),
    coalesce(lg.intake_duplicat, 0),
    coalesce(lg.intake_respins, 0)
  from din_leads dl
  full outer join din_log lg
    on  lg.zi           = dl.zi
    and lg.platforma    = dl.platforma
    and lg.campanie_ads = dl.campanie_ads
  order by 1 desc, 2, 3;
end;
$$;

revoke execute on function get_marketing_reconciliere(date, date) from anon, public;
grant execute on function get_marketing_reconciliere(date, date) to authenticated;
