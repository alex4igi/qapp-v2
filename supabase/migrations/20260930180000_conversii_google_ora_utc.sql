-- Managerul de date din Google Ads citește PRIMA linie a fișierului drept antet: linia
-- „Parameters:TimeZone=Europe/Bucharest” (valabilă la încărcarea clasică) a devenit singura
-- „coloană”. Fișierul pierde linia, iar ora poartă fusul în ea: UTC, cu „+00:00”.
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
    data_conversie := to_char(r.dc at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') || '+00:00';
    valoare := r.v;
    return next;
  end loop;
end $$;

revoke execute on function public.conversii_google_csv(date) from authenticated, anon, public;
grant execute on function public.conversii_google_csv(date) to service_role;
