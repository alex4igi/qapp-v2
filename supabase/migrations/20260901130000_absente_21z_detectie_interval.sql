-- Detecția „21 de zile" rescrisă pe interval, din două motive descoperite la
-- validarea pe date reale (1 sept. 2026).
--
-- MOTIVUL 1 — filtrul de reziliere falsifica istoricul.
-- Prima versiune cerea `e.reziliat = false`, ca lista de risc live. Pe luni
-- ÎNCHEIATE asta taie populația la mai puțin de jumătate: modelul are un rând de
-- înrolare pe lună, iar la finalul lunii rândul ajunge reziliat normal. Măsurat:
-- la 15 oct. 2025, 580 de înrolări acopereau data, dar doar 233 aveau
-- `reziliat = false`. Testul de acceptanță dădea 4 intrări în loc de 29.
-- `data_reziliere` NU e o alternativă: din 233 de rânduri reziliate ale lui
-- octombrie, 191 o au NULL — coloana nu e populată de închiderea de lună.
-- Regula adoptată: `reziliat` se aplică DOAR rândurilor încă în vigoare
-- (`data_final >= current_date`). Pe o lună deja încheiată, rezilierea a venit
-- ulterior și nu spune nimic despre starea de atunci.
--
-- MOTIVUL 2 — o interogare pe zi nu e testabilă.
-- Validarea sezonului cerea ~270 de apeluri, fiecare cu scanare completă a
-- prezențelor; a căzut pe ECONNRESET. Acum episoadele de tăcere se calculează
-- direct (gaps-and-islands), într-o singură trecere.
--
-- Consecință de design, intenționată: `detecteaza_absente_21z(zi)` devine un
-- APEL al funcției de interval cu de_la = pana_la. Jobul zilnic și testul de
-- acceptanță rulează astfel exact același cod — testul validează ce rulează.

create or replace function detecteaza_absente_21z_interval(
  p_de_la        date,
  p_pana_la      date,
  p_zile         int default 21,
  p_min_sedinte  int default 2
)
returns table (
  client            uuid,
  curs              uuid,
  locatie           uuid,
  data_intrare      date,
  ultima_prezenta   date,
  zile_tacere       int,
  sedinte_fereastra int
)
language sql
stable
security definer
set search_path = public
as $$
  with param as (
    select greatest(coalesce(p_zile, 21), 1) as zile,
           coalesce(p_min_sedinte, 0) as min_sedinte   -- 0 = filtrul e dezactivat
  ),
  -- Toate prezențele reale, fără filtru pe reziliere: o prezență rămâne o
  -- prezență indiferent ce s-a întâmplat ulterior cu rândul de înrolare.
  prez as (
    select e.client, e.cursul as curs_id, p.data
    from prezente p
    join enrollments e on e.id = p.enrollment
    join cursuri c on c.id = e.cursul
    where p.status = 'Prezent'
      and p.data is not null
      and p.data <= p_pana_la
      and coalesce(c.facultativ, false) = false
    group by e.client, e.cursul, p.data
  ),
  -- Prima zi în care fiecare (client, curs) devine „observabil": începutul
  -- înrolării. Servește pentru cine nu a venit NICIODATĂ la grupă.
  start_inrolare as (
    select e.client, e.cursul as curs_id, min(e.data_incepere) as data
    from enrollments e
    join cursuri c on c.id = e.cursul
    where e.client is not null
      and e.data_incepere is not null
      and e.data_incepere <= p_pana_la
      and coalesce(c.facultativ, false) = false
    group by e.client, e.cursul
  ),
  -- Ancore = momentele de la care poate porni un ceas de tăcere.
  ancore as (
    select client, curs_id, data, true as e_prezenta from prez
    union all
    select s.client, s.curs_id, s.data, false
    from start_inrolare s
    where not exists (
      select 1 from prez p where p.client = s.client and p.curs_id = s.curs_id and p.data <= s.data
    )
  ),
  episoade as (
    select a.client, a.curs_id, a.data as ancora, a.e_prezenta,
           lead(a.data) over (partition by a.client, a.curs_id order by a.data) as urmatoarea
    from ancore a
  ),
  -- Ziua în care ceasul atinge pragul; episodul e valid dacă până atunci nu a
  -- apărut nicio prezență nouă.
  atingeri as (
    select e.client, e.curs_id,
           (e.ancora + (select zile from param))::date as data_intrare,
           case when e.e_prezenta then e.ancora end as ultima_prezenta,
           e.ancora as de_la
    from episoade e
    where (e.urmatoarea is null or e.urmatoarea > e.ancora + (select zile from param))
      and (e.ancora + (select zile from param))::date between p_de_la and p_pana_la
  ),
  -- Populația: exista o înrolare care ACOPEREA ziua atingerii? Filtrul de
  -- reziliere se aplică doar rândurilor încă în vigoare (vezi antetul).
  cu_inrolare as (
    select a.*, i.locatie_id
    from atingeri a
    join lateral (
      select coalesce(c.locatie, s.locatie) as locatie_id
      from enrollments e
      join cursuri c on c.id = e.cursul
      left join sali s on s.id = c.sala
      where e.client = a.client
        and e.cursul = a.curs_id
        and e.data_incepere <= a.data_intrare
        and (e.data_final is null or e.data_final >= a.data_intrare)
        and (e.reziliat = false or e.data_final < current_date)
      limit 1
    ) i on true
  )
  select ci.client, ci.curs_id, ci.locatie_id, ci.data_intrare, ci.ultima_prezenta,
         (select zile from param)::int,
         sed.nr
  from cu_inrolare ci
  join lateral (
    -- ședințe ținute de GRUPĂ în fereastra de tăcere
    select count(*)::int as nr
    from (
      select p2.data
      from prezente p2
      join enrollments e2 on e2.id = p2.enrollment
      where e2.cursul = ci.curs_id
        and p2.data > ci.de_la
        and p2.data <= ci.data_intrare
      group by p2.data
    ) z
  ) sed on true
  where sed.nr >= (select min_sedinte from param);
$$;

revoke execute on function detecteaza_absente_21z_interval(date, date, int, int) from anon, public;
grant execute on function detecteaza_absente_21z_interval(date, date, int, int) to authenticated;

-- Varianta pe o zi = interval degenerat. Semnătura rămâne neschimbată.
create or replace function detecteaza_absente_21z(
  p_ref_date     date default current_date,
  p_zile         int  default 21,
  p_min_sedinte  int  default 2
)
returns table (
  client            uuid,
  curs              uuid,
  locatie           uuid,
  ultima_prezenta   date,
  zile_tacere       int,
  sedinte_fereastra int
)
language sql
stable
security definer
set search_path = public
as $$
  select client, curs, locatie, ultima_prezenta, zile_tacere, sedinte_fereastra
  from detecteaza_absente_21z_interval(p_ref_date, p_ref_date, p_zile, p_min_sedinte);
$$;

revoke execute on function detecteaza_absente_21z(date, int, int) from anon, public;
grant execute on function detecteaza_absente_21z(date, int, int) to authenticated;
