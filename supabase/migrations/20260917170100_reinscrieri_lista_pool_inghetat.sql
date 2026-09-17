-- Lista din spatele board-ului de reînscrieri primește aceeași fereastră ca
-- numărătoarea din 20260917170000: pool-ul îngheață la finalul sezonului sursă
-- și se filtrează pe `data_reziliere`, nu pe bifa `reziliat`.
--
-- Fără asta cele două nu s-ar mai potrivi: cardul ar zice „35 eligibili", iar
-- modalul deschis pe el ar fi gol, fiindcă sezonul sursă s-a închis.

create or replace function list_reinscrieri_clienti(p_curs_tinta_id uuid)
returns table (
  client_id     uuid,
  nume          text,
  prenume       text,
  telefon       text,
  email         text,
  activata      boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with target as (
    select c.id, c.sezon, c.cursul_original,
           least(current_date, coalesce(so.data_final, current_date)) as la_data
    from cursuri c
    left join cursuri o  on o.id  = c.cursul_original
    left join sezoane so on so.id = o.sezon
    where c.id = p_curs_tinta_id
  ),
  eligibili as (
    select distinct e.client
    from enrollments e
    join target t on e.cursul = t.cursul_original
    where t.cursul_original is not null
      and e.activ = true
      and e.data_reziliere is null
      and (e.data_incepere is null or e.data_incepere <= t.la_data)
      and (e.data_final is null or e.data_final >= t.la_data)
  ),
  activate as (
    select distinct e.client
    from enrollments e, target t
    where e.cursul = t.id
      and e.sezon_id = t.sezon
      and e.este_reinscriere = true
      and e.data_reziliere is null
  )
  select
    c.id,
    c.nume,
    c.prenume,
    c.telefon,
    c.email,
    (a.client is not null) as activata
  from eligibili el
  join clienti c on c.id = el.client
  left join activate a on a.client = el.client
  order by c.nume, c.prenume;
$$;

grant execute on function list_reinscrieri_clienti(uuid) to authenticated;
revoke execute on function list_reinscrieri_clienti(uuid) from anon, public;
