-- K1 (încasare la termen): baza se filtrează pe `data_reziliere`, nu pe steagul `reziliat`
-- (Alex, 29 sept. 2026). Steagul e pus și pe lunile încheiate normal — în martie 2026 la
-- Ștefan, 219 din 370 de înrolări, 207 fără dată de reziliere — deci orice recalcul al unei
-- luni vechi pierdea jumătate din bază. Regula e a lui K2 / a bonusului managerului: intră
-- înrolarea nereziliată înainte de ziua 1 a lunii. Pe septembrie 2026 cifra nu se mișcă.
create or replace function public.kpi_k1(p_locatii uuid[], p_anul integer, p_luna integer, p_parametri jsonb default '{}'::jsonb)
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  with param as (
    select make_date(p_anul, p_luna, 1) as prima_zi,
           make_date(p_anul, p_luna,
                     least(greatest(coalesce((p_parametri ->> 'zi_termen')::int, 20), 1), 28)
           ) as termen
  ),
  baza as (
    select e.id, e.suma
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
           coalesce(sum(i.suma) filter (where i.data <= (select termen from param)), 0) as la_termen,
           coalesce(sum(i.suma), 0) as total
    from baza b
    left join incasari i on i.inregistrare = b.id
    group by b.id
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
    'zi_termen', (select extract(day from termen)::int from param)
  )
  from baza b join plati p on p.id = b.id;
$function$;
