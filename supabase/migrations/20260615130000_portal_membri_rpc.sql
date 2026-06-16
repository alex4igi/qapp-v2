-- Portal membri — RPC complementar: lista membrilor familiei (pt selectorul de copil).
-- get_sold_familie întoarce doar membrii cu înrolări; switcher-ul are nevoie de TOȚI.

create or replace function get_membri_familie()
returns table (client_id uuid, nume text, prenume text, data_nasterii date)
language sql stable security definer set search_path = public as $$
  select c.id, c.nume, c.prenume, c.data_nasterii::date
  from clienti c
  where c.id in (select client_member_ids())
  order by c.data_nasterii nulls last, c.nume;
$$;

grant execute on function get_membri_familie() to authenticated;
