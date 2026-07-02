-- Adaugă capacitatea totală în list_open_sesiuni_client, pentru afișarea „X/Y locuri"
-- în portalul de membri (qapp-membri). Modificare ADITIVĂ: coloană nouă în RETURNS TABLE.
-- Clientul deja deployat (care nu citește coloana) NU se strică.
-- Corp copiat 1:1 din 20260615120000_portal_membri_foundation.sql, cu s.capacitate adăugat.

drop function if exists list_open_sesiuni_client(uuid);

create function list_open_sesiuni_client(p_locatie uuid default null)
returns table (
  sesiune_id uuid,
  curs_id uuid,
  curs_nume text,
  data date,
  locuri_ramase integer,
  capacitate integer,
  pret numeric,
  instructor_nume text
)
language sql stable security definer set search_path = public as $$
  select s.id, c.id, c.numele, s.data::date,
         (s.capacitate - count(r.id))::integer,
         s.capacitate,
         c.pret_sedinta,
         t.nume
  from open_sesiuni s
  join cursuri c on c.id = s.curs and coalesce(c.facultativ, false)
  left join open_rezervari r on r.sesiune = s.id and r.status <> 'anulat'
  left join teacheri t on t.id = s.instructor
  where s.data >= current_date
    and s.status <> 'anulata'
    and (p_locatie is null or c.locatie = p_locatie)
  group by s.id, c.id, c.numele, s.data, s.capacitate, c.pret_sedinta, t.nume
  having (s.capacitate - count(r.id)) > 0
  order by s.data asc;
$$;

grant execute on function list_open_sesiuni_client(uuid) to authenticated;
