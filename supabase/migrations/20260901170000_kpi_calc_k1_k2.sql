-- Calculul automat pentru „Încasare la termen" și „Restanțe recuperate".
--
-- Fiecare KPI e o funcție pură, cu aceeași semnătură: (locații, an, lună,
-- parametri) → jsonb. Dispecerul le va apela prin CASE static pe cheia din
-- catalog. Semnătura uniformă e ce face motorul generic posibil.
--
-- ⚠️ FILTRUL DE REZILIERE, aceeași capcană ca la jurnalul de absențe:
-- modelul are un rând de înrolare pe lună, iar la închiderea lunii rândul ajunge
-- reziliat normal. Pe luni ÎNCHEIATE, `reziliat = false` ar tăia jumătate din
-- bază și ar face indicatorul de nerecunoscut față de rapoartele reale.
-- `data_reziliere` nu e alternativă (nepopulată în 191 din 233 de cazuri
-- verificate pe oct. 2025). Regula: rezilierea contează doar pentru rândurile
-- încă în vigoare (`data_final >= current_date`).
--
-- LOCAȚIA: `coalesce(cursuri.locatie, sali.locatie)`. Cele două surse diverg în
-- bază (view-ul `plati_inrolari` folosește doar sala), iar coalesce acoperă și
-- cursurile fără sală, care altfel ar dispărea din orice agregat pe punct de
-- lucru.

-- ── K1 · Încasare la termen ─────────────────────────────────────────────────
-- Ziua-termen (implicit 20) e un PRAG DE BONUS, nu scadența contractuală:
-- `scadenta_rata()` NU se folosește aici. Dacă cineva „corectează" asta ulterior,
-- indicatorul își schimbă înțelesul.

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
      and e.data_incepere = (select prima_zi from param)
      and (e.reziliat = false or e.data_final < current_date)
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
    -- indicator de monitorizare, nebonificat: cât s-a încasat până la urmă
    'rata_finala', case when coalesce(sum(b.suma), 0) = 0 then null
                        else round(coalesce(sum(p.total), 0) / sum(b.suma) * 100, 1) end,
    'nr_inrolari', count(*),
    'zi_termen', (select extract(day from termen)::int from param)
  )
  from baza b join plati p on p.id = b.id;
$$;

revoke execute on function kpi_k1(uuid[], int, int, jsonb) from anon, public;
grant execute on function kpi_k1(uuid[], int, int, jsonb) to authenticated;

-- ── K2 · Restanțe recuperate ────────────────────────────────────────────────
-- Stocul se RECONSTITUIE la ziua 1 din istoricul plăților (`i.data < prima_zi`),
-- nu se ține într-o tabelă de snapshot: e determinist, deci nu poate fi ratat
-- de un job care n-a rulat. Imuabilitatea reală vine din înghețarea valorilor
-- la închiderea lunii.
--
-- Banda de peste 1 an SE EXCLUDE din bază: e imobilă tot sezonul (6.105 → 7.964
-- lei la Ștefan cel Mare, creștere prin îmbătrânire, nu prin nerecuperare; fix
-- 690 lei nouă luni la rând la Quasar 4 Kids). Inclusă, ar dilua indicatorul cu
-- bani care nu se mai încasează. Se raportează separat, informativ.
--
-- Defalcarea pe benzi de vechime e cerută explicit de anexa tehnică înainte de
-- fixarea pragurilor: dacă o parte din recuperări vine din banda >1 an, atât
-- numărătorul cât și pragurile se schimbă.

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
      and (e.reziliat = false or e.data_final < current_date)
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
    -- validarea cerută de anexă: din ce bandă vin banii recuperați
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
