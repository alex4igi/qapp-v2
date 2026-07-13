-- Portal: prezențele unui membru dintr-un INTERVAL de date (perioada sezonului
-- activ), indiferent de sezonul cursului. Decizie user 2026-07-13: „prezențele
-- din sezonul desfășurat" = prezențele a căror DATĂ cade în perioada sezonului
-- activ (ex. o prezență din 27 iun. pe un curs de sezon vechi apare, fiindcă e
-- în intervalul curent). Un interval de sezon are < 1000 rânduri → un singur apel.

create or replace function get_prezente_interval_client(
  p_client uuid,
  p_from   date,
  p_to     date
)
returns table (data date, curs_nume text, status status_prezenta)
language sql stable security definer set search_path = public as $$
  select p.data::date, c.numele, p.status
  from prezente p
  left join enrollments e on e.id = p.enrollment
  left join cursuri c on c.id = e.cursul
  where p.client = p_client
    and p_client in (select client_member_ids())
    and p.data >= p_from
    and p.data <= p_to
  order by p.data desc nulls last;
$$;

grant execute on function get_prezente_interval_client(uuid, date, date) to authenticated;
