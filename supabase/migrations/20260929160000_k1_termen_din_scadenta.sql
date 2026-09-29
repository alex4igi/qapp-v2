-- K1: termenul nu mai e ziua 20 fixă, ci scadența ratei + 5 zile de grație (Alex, 29 sept. 2026).
-- În lunile obișnuite iese tot ziua 20 (scadența 15 + 5); în prima lună a sezonului
-- (scadența 20 sept.) termenul e 25 sept., în ultima (7 iunie) e 12 iunie. Aceeași grație
-- de 5 zile ca la tăierea reducerilor (`cancel_discount_familie_restant`).
-- Parametrul `zi_termen` devine `zile_dupa_scadenta` (default 5).
create or replace function public.kpi_k1(p_locatii uuid[], p_anul integer, p_luna integer, p_parametri jsonb default '{}'::jsonb)
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  with param as (
    select make_date(p_anul, p_luna, 1) as prima_zi,
           least(greatest(coalesce((p_parametri ->> 'zile_dupa_scadenta')::int, 5), 0), 20) as gratie
  ),
  baza as (
    -- Termenul = scadența ratei + grația: 15 + 5 = ziua 20 în lunile obișnuite, dar prima
    -- și ultima lună a sezonului au scadența lor (`sezoane.scadenta_prima_rata` /
    -- `scadenta_ultima_rata`: 20 sept. → 25 sept., 7 iunie → 12 iunie).
    select e.id, e.suma,
           scadenta_rata(e.data_incepere, e.sezon_id) + (select gratie from param) as termen
    from enrollments e
    join cursuri c on c.id = e.cursul
    left join sali s on s.id = c.sala
    where e.tip_plata = 'Per luna'
      and e.data_incepere is not null
      and date_trunc('month', e.data_incepere) = (select prima_zi from param)
      and (e.data_reziliere is null or e.data_reziliere > (select prima_zi from param))
      and coalesce(c.locatie, s.locatie) = any(p_locatii)
  ),
  plati as (
    select b.id,
           coalesce(sum(i.suma) filter (where i.data <= b.termen), 0) as la_termen,
           coalesce(sum(i.suma), 0) as total
    from baza b
    left join incasari i on i.inregistrare = b.id
    group by b.id, b.termen
  )
  select jsonb_build_object(
    'kpi', 'incasare_la_termen',
    'numitor', round(coalesce(sum(b.suma), 0), 2),
    'numarator', round(coalesce(sum(p.la_termen), 0), 2),
    'valoare', case when coalesce(sum(b.suma), 0) = 0 then null
                    else round(coalesce(sum(p.la_termen), 0) / sum(b.suma) * 100, 1) end,
    'rata_finala', case when coalesce(sum(b.suma), 0) = 0 then null
                        else round(coalesce(sum(p.total), 0) / sum(b.suma) * 100, 1) end,
    'nr_inrolari', count(*),
    'termen', max(b.termen)::text,
    'zi_termen', extract(day from max(b.termen))::int,
    'zile_dupa_scadenta', (select gratie from param)
  )
  from baza b join plati p on p.id = b.id;
$function$;

update public.kpi_definitii
   set parametri_schema = jsonb_build_array(jsonb_build_object(
         'cheie', 'zile_dupa_scadenta', 'eticheta', 'Zile de grație după scadența ratei',
         'tip', 'numar', 'min', 0, 'max', 20, 'default', 5, 'unitate', 'zile'))
 where cheie = 'incasare_la_termen';

update public.kpi_grila_linii l
   set parametri = (l.parametri - 'zi_termen') || jsonb_build_object('zile_dupa_scadenta',
         greatest(coalesce((l.parametri ->> 'zi_termen')::int, 20) - 15, 0))
  from public.kpi_definitii d
 where d.id = l.kpi_id and d.cheie = 'incasare_la_termen';

update public.kpi_sablon_linii l
   set parametri = (l.parametri - 'zi_termen') || jsonb_build_object('zile_dupa_scadenta',
         greatest(coalesce((l.parametri ->> 'zi_termen')::int, 20) - 15, 0))
  from public.kpi_definitii d
 where d.id = l.kpi_id and d.cheie = 'incasare_la_termen';
