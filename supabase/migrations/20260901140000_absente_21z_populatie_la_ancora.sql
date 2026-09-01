-- Populația se decide la MOMENTUL TĂCERII, nu la ziua în care expiră ceasul.
--
-- Bug de logică găsit la validarea pe sezonul 2025-2026: versiunea anterioară
-- cerea o înrolare care să acopere ziua atingerii pragului (ultima prezență +
-- 21). Modelul are un rând de înrolare pe lună, deci cine se oprește din venit
-- ȘI din plătit nu mai are rând peste 21 de zile — exact omul care tocmai
-- pleacă era eliminat din lista de recuperare. Măsurat la Ștefan cel Mare:
-- 184 de cazuri pe sezon în loc de ~499; golurile cele mai mari în aprilie
-- (30 față de 96) și iunie (45 față de 117), adică lunile în care oamenii chiar
-- renunță.
--
-- Regula corectă, și ca semantică de business: „era înrolat când a venit ultima
-- dată". Cine s-a oprit din plată e cazul cel mai valoros din listă, nu unul
-- de exclus. Coerent și cu lecția din 20260722190000 (fără plafon de zile,
-- pentru că tăia tocmai cazurile grave).
--
-- Locația se ia tot de la înrolarea-ancoră: e punctul de lucru la care omul
-- chiar venea, deci cel care răspunde de recuperarea lui.

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
  atingeri as (
    select e.client, e.curs_id,
           (e.ancora + (select zile from param))::date as data_intrare,
           case when e.e_prezenta then e.ancora end as ultima_prezenta,
           e.ancora as de_la
    from episoade e
    where (e.urmatoarea is null or e.urmatoarea > e.ancora + (select zile from param))
      and (e.ancora + (select zile from param))::date between p_de_la and p_pana_la
  ),
  -- Înrolarea care acoperea ANCORA (ultima prezență / începutul înrolării).
  -- Filtrul de reziliere se aplică doar rândurilor încă în vigoare: pe o lună
  -- deja încheiată rezilierea a venit ulterior și nu spune nimic despre atunci
  -- (din 233 de rânduri reziliate ale lui oct. 2025, 191 n-au nici măcar
  -- `data_reziliere` completată).
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
        and e.data_incepere <= a.de_la
        and (e.data_final is null or e.data_final >= a.de_la)
        and (e.reziliat = false or e.data_final < current_date)
      order by e.data_incepere desc
      limit 1
    ) i on true
  )
  select ci.client, ci.curs_id, ci.locatie_id, ci.data_intrare, ci.ultima_prezenta,
         (select zile from param)::int,
         sed.nr
  from cu_inrolare ci
  join lateral (
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
