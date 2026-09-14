-- Ținte pentru trimiterea în bulk a contractelor pe o selecție de clienți
-- (independent de campaniile de reînscriere, care nu au fost folosite niciodată).
--
-- Un rând per client cu o înrolare în curs sau viitoare. „Nereziliat" înseamnă
-- `data_reziliere is null`, NU steagul `reziliat` — acela e bifat și pe lunile
-- încheiate normal. Contactul e al familiei, exact ca în contract-send: SMS dacă
-- are telefon, altfel email. Locația vine prin sala cursului (ca în plati_inrolari),
-- cu cădere pe `cursuri.locatie`.
create or replace function list_targets_contracte(
  p_sezon   uuid default null,
  p_locatie uuid default null,
  p_curs    uuid default null
)
returns table (
  client_id     uuid,
  client_nume   text,
  familie_id    uuid,
  familie_nume  text,
  telefon       text,
  email         text,
  locatie_nume  text,
  cursuri       text[]
)
language sql
stable
security invoker
set search_path = public
as $$
  with elig as (
    select distinct
      e.client,
      c.numele as curs_nume,
      l.nume as locatie_nume
    from enrollments e
    join cursuri c on c.id = e.cursul
    left join sali s on s.id = c.sala
    left join locatii l on l.id = coalesce(s.locatie, c.locatie)
    where e.client is not null
      and e.data_reziliere is null
      and (e.data_final is null or e.data_final >= current_date)
      and (p_sezon is null or coalesce(e.sezon_id, c.sezon) = p_sezon)
      and (p_curs is null or c.id = p_curs)
      and (p_locatie is null or coalesce(s.locatie, c.locatie) = p_locatie)
  )
  select
    cl.id,
    trim(cl.nume || ' ' || coalesce(cl.prenume, ''))::text,
    f.id,
    f.nume_familie,
    nullif(trim(f.telefon), ''),
    nullif(trim(f.email), ''),
    max(el.locatie_nume),
    array_agg(distinct el.curs_nume order by el.curs_nume)
  from elig el
  join clienti cl on cl.id = el.client
  left join familii f on f.id = cl.familia
  group by cl.id, cl.nume, cl.prenume, f.id, f.nume_familie, f.telefon, f.email
  order by f.nume_familie nulls last, cl.nume, cl.prenume;
$$;

grant execute on function list_targets_contracte(uuid, uuid, uuid) to authenticated;
revoke execute on function list_targets_contracte(uuid, uuid, uuid) from anon, public;
