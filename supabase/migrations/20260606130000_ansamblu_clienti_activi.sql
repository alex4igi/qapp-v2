-- Qapp v2 — Privire de ansamblu: KPI clienți activi (headcount)
--
-- „Client activ" = clienti.status = 'Activ' (definiție pe prezență, calculată de
-- cronul auto_mark_inactiv_si_exclient(): prezent în ultimele 21 zile).
--
-- get_clienti_activi() întoarce:
--   - un rând cu locatie_id = NULL → totalul unic pe tot clubul (owner)
--   - câte un rând per locație → clienți activi cu ≥1 înrolare activă într-un curs
--     de la acea locație (manager). Un client poate apărea la mai multe locații;
--     de aceea totalul global NU e suma rândurilor de locație, ci distinct pe club.

create or replace function get_clienti_activi()
returns table (
  locatie_id   uuid,
  locatie_nume text,
  activi       integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with luna as (
    select
      date_trunc('month', current_date)::date as start_luna,
      (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date as end_luna
  ),
  per_locatie as (
    select loc.id as locatie_id, loc.nume as locatie_nume,
           count(distinct cl.id)::int as activi
    from locatii loc
    join cursuri c       on c.locatie = loc.id
    join enrollments e   on e.cursul = c.id
                        and e.activ = true
                        and e.reziliat = false
                        and e.data_incepere <= (select end_luna from luna)
                        and (e.data_final is null or e.data_final >= (select start_luna from luna))
    join clienti cl      on cl.id = e.client and cl.status = 'Activ'
    group by loc.id, loc.nume
  ),
  total as (
    select null::uuid as locatie_id, 'Total club'::text as locatie_nume,
           count(distinct cl.id)::int as activi
    from clienti cl
    where cl.status = 'Activ'
  )
  select locatie_id, locatie_nume, activi from total
  union all
  select locatie_id, locatie_nume, activi from per_locatie
  order by locatie_id nulls first, locatie_nume;
$$;

grant execute on function get_clienti_activi() to authenticated;
