-- Conversii offline către Google Ads (Alex, 30.09.2026): „click-ul ăsta a devenit elev".
--
-- Același motiv ca la Meta (20260903120000): Google vede doar click-ul și, cel mult, completarea
-- formularului; înscrierea vine după zile și numai CRM-ul o știe. Fără încărcarea ei, Smart
-- Bidding optimizează pentru click-uri, nu pentru oameni care se înscriu.
--
-- Cum ajunge la Google: Google Ads ia ZILNIC un CSV de la edge function-ul
-- `google-ads-conversii` („scheduled upload" din HTTPS, cu utilizator și parolă). Nu e nevoie
-- de developer token. Cheia de potrivire e `leads.gclid`, care vine:
--   * din click-ul pe WhatsApp (`whatsapp_clickuri`, legat de lead prin cod — 20260930140000);
--   * din formularele site-ului (de la 30.09.2026).
-- Ambele DOAR cu consimțământ de marketing pe site — de aceea CSV-ul declară
-- „Ad User Data" / „Ad Personalization" = Granted (cerința Google pentru SEE).
--
-- Același „ce e o înscriere" și aceeași valoare ca la Meta: lead convertit în client,
-- valoarea = suma lunară a înrolărilor active (proxy conservator, nu valoare pe viață).
-- DECIZIE (ca la Meta): doar conversiile de la lansare încolo — pragul e constanta din semnătură.

-- ============================================================
-- 1. Ce intră în CSV — și jurnalul (ce am pus la dispoziția Google)
-- ============================================================
-- CSV-ul conține conversiile din ultimele 30 de zile, nu doar pe cele noi: dacă o preluare
-- zilnică pică, a doua zi o reia. Google respinge singur dublurile (gclid + nume + oră).
-- `conversii_ads_trimise` primește un rând la PRIMA apariție a leadului în fișier
-- (platforma 'google') — urma a ce date au plecat spre Google.
create or replace function public.conversii_google_csv(p_from date default date '2026-09-30')
returns table (
  gclid          text,
  data_conversie text,
  valoare        numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select
      l.id,
      l.gclid as g,
      l.data_conversie as dc,
      coalesce((
        select sum(e.suma)
        from enrollments e
        where e.client = l.id_client
          and e.activ
          and not coalesce(e.reziliat, false)
      ), 0)::numeric as v
    from leads l
    where l.gclid is not null
      and l.data_conversie is not null
      and l.data_conversie >= p_from
      and l.data_conversie >= now() - interval '30 days'
      and l.id_client is not null
      and coalesce(l.opt_out_marketing, false) = false
    order by l.data_conversie
  loop
    insert into conversii_ads_trimise (lead, platforma, event_id, event_name, valoare, moneda, rezultat)
    values (r.id, 'google', r.g, 'csv', r.v, 'RON', 'trimis')
    on conflict (lead, platforma) where rezultat = 'trimis' do nothing;

    gclid := r.g;
    data_conversie := to_char(r.dc at time zone 'Europe/Bucharest', 'YYYY-MM-DD HH24:MI:SS');
    valoare := r.v;
    return next;
  end loop;
end $$;

revoke execute on function public.conversii_google_csv(date) from authenticated, anon, public;
grant execute on function public.conversii_google_csv(date) to service_role;

-- ============================================================
-- 2. Meta: doar reclamele, nu și vizitele organice de pe Facebook
-- ============================================================
-- Atribuirea click-urilor pe WhatsApp (20260930140000) marchează o vizită venită dintr-o
-- postare de Facebook ca `facebook / social`. Filtrul vechi lua orice `utm_source = facebook`
-- și ar fi raportat-o la Meta drept rezultat al unei reclame. Tot de aici: `utm_medium = paid`
-- singur prindea și reclamele Google etichetate „paid".
create or replace function public.conversii_ads_de_trimis(
  p_limit int  default 200,
  p_from  date default date '2026-09-03'   -- pragul „de acum înainte"; vezi 20260903120000
)
returns table (
  lead_id        uuid,
  data_conversie timestamptz,
  telefon        text,
  email          text,
  valoare        numeric,
  platforma      text,
  campanie       text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    l.id,
    l.data_conversie,
    l.telefon,
    l.email,
    coalesce((
      select sum(e.suma)
      from enrollments e
      where e.client = l.id_client
        and e.activ
        and not coalesce(e.reziliat, false)
    ), 0)::numeric,
    lower(coalesce(l.platform, l.utm_source, 'meta')),
    coalesce(l.utm_campaign, l.campaign_id)
  from leads l
  where l.data_conversie is not null
    and l.data_conversie >= p_from
    and l.id_client is not null
    and coalesce(l.opt_out_marketing, false) = false
    and (
      l.utm_medium like 'lead_ads%'
      or (
        lower(coalesce(l.utm_source, '')) in ('meta', 'metayouplus', 'facebook', 'instagram', 'fb', 'ig')
        and lower(coalesce(l.utm_medium, '')) not in ('social', 'organic', 'referral')
      )
    )
    and not exists (
      select 1 from conversii_ads_trimise t
      where t.lead = l.id and t.platforma = 'meta' and t.rezultat = 'trimis'
    )
  order by l.data_conversie
  limit greatest(1, least(p_limit, 1000));
$$;

revoke execute on function public.conversii_ads_de_trimis(int, date) from authenticated, anon, public;
grant execute on function public.conversii_ads_de_trimis(int, date) to service_role;
