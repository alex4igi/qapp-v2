-- Două corecții la K1, găsite rulând seria sezonului 2025-2026.
--
-- 1. LUNA FACTURATĂ SE IA CU `date_trunc`, nu prin egalitate cu ziua 1.
--    Convenția „data_incepere = ziua 1 a lunii facturate" e respectată din
--    octombrie 2025 încoace (1 oct.: 281 de rânduri), dar septembrie 2025 are
--    datele împrăștiate pe zile (27, 28, 29 sept.) — probabil moștenire de la
--    începutul sezonului. Cu egalitate strictă, septembrie ieșea 0 scadent,
--    deci luna dispărea din serie.
--
-- 2. FILTRUL DE REZILIERE RĂMÂNE STRICT, spre deosebire de jurnalul de absențe.
--    Acolo relaxarea era necesară (observăm trecutul, iar rândurile lunilor
--    încheiate ajung reziliate normal). Aici e invers: raportul se închide până
--    în ziua 5 a lunii următoare, moment în care rândurile lunii raportate au
--    deja `data_final` în trecut — o regulă „reziliat contează doar cât timp
--    rândul e viu" ar dezactiva filtrul exact la închidere și ar considera
--    scadenți oamenii care au plecat. Specificația cere „înrolările reziliate se
--    exclud peste tot", deci `reziliat = false` fără excepții.
--    Consecință acceptată: recalcularea istoricului dă baze mai mici decât
--    realitatea de atunci, fiindcă rezilierea a venit ulterior. Rata rămâne
--    validă — pe ea se face calibrarea.

create or replace function kpi_k1(
  p_locatii   uuid[],
  p_anul      int,
  p_luna      int,
  p_parametri jsonb default '{}'::jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
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
      and e.reziliat = false
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
$$;

revoke execute on function kpi_k1(uuid[], int, int, jsonb) from anon, public;
grant execute on function kpi_k1(uuid[], int, int, jsonb) to authenticated;

-- Aceeași decizie la K2: stocul de restanțe e o fotografie a ce se mai poate
-- încasa, iar o înrolare reziliată nu mai e de încasat.
create or replace function kpi_k2(
  p_locatii   uuid[],
  p_anul      int,
  p_luna      int,
  p_parametri jsonb default '{}'::jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with param as (
    select make_date(p_anul, p_luna, 1) as prima_zi,
           (make_date(p_anul, p_luna, 1) + interval '1 month')::date as luna_urm,
           coalesce((p_parametri ->> 'zile_min')::int, 30) as zile_min,
           coalesce((p_parametri ->> 'zile_max')::int, 365) as zile_max
  ),
  candidati as (
    select e.id, e.suma, e.data_incepere, e.sezon_id,
           scadenta_rata(e.data_incepere, e.sezon_id) as scadenta,
           coalesce((select sum(i.suma) from incasari i
                      where i.inregistrare = e.id
                        and i.data < (select prima_zi from param)), 0) as platit_pana_la_z1
    from enrollments e
    join cursuri c on c.id = e.cursul
    left join sali s on s.id = c.sala
    where e.data_incepere is not null
      and e.reziliat = false
      and coalesce(c.locatie, s.locatie) = any(p_locatii)
      and e.data_incepere < (select prima_zi from param)
  ),
  stoc as (
    select c.id,
           c.suma - c.platit_pana_la_z1 as rest,
           ((select prima_zi from param) - c.scadenta)::int as vechime
    from candidati c
    where c.scadenta is not null
      and c.suma - c.platit_pana_la_z1 > 0
      and c.scadenta < (select prima_zi from param) - (select zile_min from param)
  ),
  in_baza as (
    select * from stoc where vechime <= (select zile_max from param)
  ),
  recuperari as (
    select b.id, b.vechime,
           coalesce((select sum(i.suma) from incasari i
                      where i.inregistrare = b.id
                        and i.data >= (select prima_zi from param)
                        and i.data <  (select luna_urm from param)), 0) as recuperat
    from in_baza b
  )
  select jsonb_build_object(
    'kpi', 'restante_recuperate',
    'stoc_total',    round((select coalesce(sum(rest), 0) from stoc), 2),
    'stoc_peste_max',round((select coalesce(sum(rest), 0) from stoc
                             where vechime > (select zile_max from param)), 2),
    'numitor',       round((select coalesce(sum(rest), 0) from in_baza), 2),
    'numarator',     round((select coalesce(sum(recuperat), 0) from recuperari), 2),
    'valoare', case when (select coalesce(sum(rest), 0) from in_baza) = 0 then null
                    else round((select coalesce(sum(recuperat), 0) from recuperari)
                               / (select sum(rest) from in_baza) * 100, 1) end,
    'nr_datornici', (select count(*) from in_baza),
    'benzi', jsonb_build_object(
      'stoc_30_90',      round((select coalesce(sum(rest), 0) from in_baza where vechime <= 90), 2),
      'stoc_90_max',     round((select coalesce(sum(rest), 0) from in_baza where vechime > 90), 2),
      'recuperat_30_90', round((select coalesce(sum(r.recuperat), 0) from recuperari r where r.vechime <= 90), 2),
      'recuperat_90_max',round((select coalesce(sum(r.recuperat), 0) from recuperari r where r.vechime > 90), 2)
    )
  );
$$;

revoke execute on function kpi_k2(uuid[], int, int, jsonb) from anon, public;
grant execute on function kpi_k2(uuid[], int, int, jsonb) to authenticated;
