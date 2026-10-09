-- K5 recepție măsoară leadurile LUNII LUI și trece la bonusul amânat, lângă K2 + K3 (Alex, 10 oct. 2026):
-- „de ce rămâne la bonusul lunii, când e de fapt pe luna anterioară?". Cu decalaj 0, conversia unei luni
-- se știe abia la 30 de zile după ultima ei zi, deci K5 își declară `final_la` — motorul îl plătește
-- atunci separat, cu salariul lunii următoare. Cu decalaj ≥ 1 (șablonul RRC) rămâne ca înainte.
-- Efect: leadurile din august nu mai intră la nimeni; septembrie se închide pe 30 oct.

create or replace function public.kpi_k5(p_locatii uuid[], p_anul integer, p_luna integer, p_parametri jsonb default '{}'::jsonb)
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  with param as (
    select least(greatest(coalesce((p_parametri ->> 'fereastra_zile')::int, 30), 1), 180) as fereastra,
           least(greatest(coalesce((p_parametri ->> 'decalaj_luni')::int, 1), 0), 3) as decalaj
  ),
  cohorta_luna as (
    select (make_date(p_anul, p_luna, 1)
            - make_interval(months => (select decalaj from param)))::date as prima_zi
  ),
  toti as (
    select l.id, l.id_client, l.locatie_id, l.deja_client,
           (l.created at time zone 'Europe/Bucharest')::date as zi_creare
    from leads l, cohorta_luna cl
    where (l.created at time zone 'Europe/Bucharest')::date >= cl.prima_zi
      and (l.created at time zone 'Europe/Bucharest')::date < (cl.prima_zi + interval '1 month')::date
      and lead_intra_in_palnie(l.motiv_categorie)
  ),
  cohorta as (
    select * from toti
    where locatie_id = any(p_locatii)
      and coalesce(deja_client, false) = false
  ),
  verdict as (
    select c.id,
           c.id_client is not null and exists (
             select 1 from incasari i, param p
             where i.client = c.id_client
               and i.suma > 0
               and i.data >= c.zi_creare
               and i.data <= c.zi_creare + p.fereastra
           ) as convertit
    from cohorta c
  ),
  inchidere as (
    select ((cl.prima_zi + interval '1 month')::date - 1 + p.fereastra) as final_la
    from cohorta_luna cl, param p
  )
  select jsonb_build_object(
    'kpi', 'conversie_lead',
    'numitor',   (select count(*) from cohorta),
    'numarator', (select count(*) from verdict where convertit),
    'valoare', case when (select count(*) from cohorta) = 0 then null
                    else round((select count(*) from verdict where convertit)::numeric
                               / (select count(*) from cohorta) * 100, 1) end,
    'luna_cohortei',  to_char((select prima_zi from cohorta_luna), 'YYYY-MM'),
    'fereastra_zile', (select fereastra from param),
    'decalaj_luni',   (select decalaj from param),
    'fara_locatie',   (select count(*) from toti where locatie_id is null),
    'deja_clienti',   (select count(*) from toti
                        where locatie_id = any(p_locatii) and coalesce(deja_client, false))
  )
  || case when (select decalaj from param) = 0 then jsonb_build_object(
       'provizoriu', (now() at time zone 'Europe/Bucharest')::date <= (select final_la from inchidere),
       'final_la', (select final_la from inchidere)::text)
     else '{}'::jsonb end;
$function$;

revoke execute on function public.kpi_k5(uuid[], integer, integer, jsonb) from anon, authenticated, public;
grant execute on function public.kpi_k5(uuid[], integer, integer, jsonb) to service_role;

-- Grilele recepției și șablonul lor: cohorta = luna raportului.
update kpi_grila_linii l
   set parametri = l.parametri || '{"decalaj_luni": 0}'::jsonb
  from kpi_grile g, kpi_definitii d
 where l.grila_id = g.id and d.id = l.kpi_id and d.cheie = 'conversie_lead'
   and g.titular_nume in ('Petruța', 'Theo Todica');

update kpi_sablon_linii l
   set parametri = l.parametri || '{"decalaj_luni": 0}'::jsonb
  from kpi_sabloane s, kpi_definitii d
 where l.sablon_id = s.id and d.id = l.kpi_id and d.cheie = 'conversie_lead'
   and s.nume = 'Recepție 2026-2027';
