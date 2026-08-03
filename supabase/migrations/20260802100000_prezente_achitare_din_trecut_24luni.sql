-- „Achitate din trecut" privește dincolo de intervalul afișat (lookback 24 luni).
--
-- Până acum overlay-ul `din_trecut` se emitea DOAR din `classified`, adică din
-- prezențele cu data în [d_from, d_to]. Deci o ședință din februarie stinsă în
-- iulie apărea în iulie numai dacă februarie era și el în fereastră. Efecte:
-- fereastră de o singură lună ⇒ din_trecut structural 0; prima lună a oricărei
-- ferestre ⇒ 0; „Sezon curent" ⇒ recuperările din sezoanele anterioare dispar.
-- (Comportamentul era intenționat — vezi 20260608180000 — dar userul l-a răsturnat
-- la 2026-08-02: bara albastră trebuie să numere ședințele vechi indiferent de
-- fereastră, cu lookback maxim 24 de luni față de luna stingerii, aliniat cu
-- prescrierea restanțelor la 2 ani.)
--
-- `achitate`/`neachitate` rămân neatinse: partiție a prezențelor lunii afișate.
--
-- Perf: `completion` nu se lărgește la tot tabelul (asta dădea statement_timeout
-- înainte de 20260623350000). Setul de înrolări e `relevant` (prezențe în fereastră,
-- pentru achitate/neachitate) ∪ `stinse_in_fereastra`, ultimul găsit cu agregate
-- simple, fără window function.

create or replace function get_statistica_prezente_achitare(
  p_from    date,
  p_to      date,
  p_locatie uuid default null,
  p_teacher uuid default null,
  p_curs    uuid default null
)
returns table (
  luna        text,
  achitate    integer,
  neachitate  integer,
  din_trecut  integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with bounds as (
    select
      date_trunc('month', p_from)::date as d_from,
      (date_trunc('month', p_to) + interval '1 month - 1 day')::date as d_to,
      -- podea constantă de lookback (sargable); limita exactă per lună de stingere
      -- se aplică în `trecut`
      (date_trunc('month', p_from) - interval '24 months')::date as d_floor
  ),
  -- înrolările cu cel puțin o prezență în interval (aplicăm aici toate filtrele)
  relevant as (
    select distinct p.enrollment as enr
    from prezente p
    join enrollments e on e.id = p.enrollment
    left join cursuri c on c.id = e.cursul
    left join sali s on s.id = c.sala
    cross join bounds b
    where p.status = 'Prezent'
      and p.enrollment is not null
      and p.data >= b.d_from
      and p.data <= b.d_to
      and (p_locatie is null or s.locatie = p_locatie)
      and (p_teacher is null or c.teacher = p_teacher)
      and (p_curs is null or e.cursul = p_curs)
  ),
  -- înrolările a căror lună de stingere cade ÎN fereastră, chiar dacă prezențele
  -- lor sunt toate dinaintea ei: cumulul până la d_to atinge suma, dar cumulul
  -- dinainte de d_from nu ⇒ pragul s-a trecut în interval.
  stinse_in_fereastra as (
    select i.inregistrare as enr
    from incasari i
    join enrollments e on e.id = i.inregistrare
    left join cursuri c on c.id = e.cursul
    left join sali s on s.id = c.sala
    cross join bounds b
    where coalesce(e.suma, 0) > 0
      and i.data is not null
      and i.data <= b.d_to
      and (p_locatie is null or s.locatie = p_locatie)
      and (p_teacher is null or c.teacher = p_teacher)
      and (p_curs is null or e.cursul = p_curs)
    group by i.inregistrare, e.suma, b.d_from
    having sum(i.suma) >= coalesce(e.suma, 0)
       and coalesce(sum(i.suma) filter (where i.data < b.d_from), 0) < coalesce(e.suma, 0)
  ),
  enr_scope as (
    select enr from relevant
    union
    select enr from stinse_in_fereastra
  ),
  -- luna în care fiecare înrolare din scop devine complet plătită
  completion as (
    select enr, min(data) as cdate
    from (
      select
        i.inregistrare as enr,
        i.data,
        sum(i.suma) over (
          partition by i.inregistrare
          order by i.data, i.id
          rows between unbounded preceding and current row
        ) as cum,
        coalesce(e.suma, 0) as needed
      from incasari i
      join enrollments e on e.id = i.inregistrare
      join enr_scope r on r.enr = i.inregistrare
      cross join bounds b
      where coalesce(e.suma, 0) > 0
        and i.data is not null
        and i.data <= b.d_to
    ) t
    where t.cum >= t.needed
    group by enr
  ),
  classified as (
    select
      to_char(p.data, 'YYYY-MM') as sm,
      case
        when coalesce(e.suma, 0) <= 0 then to_char(p.data, 'YYYY-MM')  -- plătit din start
        else to_char(comp.cdate, 'YYYY-MM')
      end as cm
    from prezente p
    join enrollments e on e.id = p.enrollment
    left join cursuri c on c.id = e.cursul
    left join sali s on s.id = c.sala
    left join completion comp on comp.enr = e.id
    cross join bounds b
    where p.status = 'Prezent'
      and p.enrollment is not null
      and p.data >= b.d_from
      and p.data <= b.d_to
      and (p_locatie is null or s.locatie = p_locatie)
      and (p_teacher is null or c.teacher = p_teacher)
      and (p_curs is null or e.cursul = p_curs)
  ),
  -- overlay: TOATE prezențele mai vechi decât luna stingerii, inclusiv cele
  -- dinaintea ferestrei. Filtrele nu se repetă — ambele surse ale lui `completion`
  -- le-au aplicat deja pe înrolare.
  trecut as (
    select to_char(comp.cdate, 'YYYY-MM') as luna, count(*)::int as n
    from completion comp
    join prezente p
      on p.enrollment = comp.enr
     and p.status = 'Prezent'
    cross join bounds b
    where comp.cdate >= b.d_from
      and comp.cdate <= b.d_to
      and p.data >= b.d_floor
      and p.data >= (date_trunc('month', comp.cdate) - interval '24 months')::date
      and to_char(p.data, 'YYYY-MM') < to_char(comp.cdate, 'YYYY-MM')
    group by 1
  ),
  emitted as (
    select
      sm as luna,
      case when cm is not null and cm <= sm then 1 else 0 end as achitate,
      case when cm is null or cm > sm then 1 else 0 end as neachitate,
      0 as din_trecut
    from classified
    union all
    select luna, 0, 0, n
    from trecut
  )
  select
    em.luna,
    sum(em.achitate)::integer   as achitate,
    sum(em.neachitate)::integer as neachitate,
    sum(em.din_trecut)::integer as din_trecut
  from emitted em
  cross join bounds b
  where em.luna >= to_char(b.d_from, 'YYYY-MM')
    and em.luna <= to_char(b.d_to, 'YYYY-MM')
  group by em.luna
  order by em.luna;
$$;

-- `completion` primește acum un set mai mare de înrolări; window-ul cere input
-- ordonat pe (inregistrare, data, id), iar idx_incasari_inregistrare are doar
-- prima coloană.
create index if not exists idx_incasari_inregistrare_data
  on incasari (inregistrare, data, id);
