-- Portal membri (qapp-membri) — grupul 🟠, taskul Calendar: a treia sursă de
-- evenimente = rezervările OPEN class PLĂTITE ale unui membru. Pattern identic cu
-- celelalte RPC-uri client (SECURITY DEFINER, scopat la familia contului prin
-- client_member_ids()). Vezi 20260619110000_portal_client_rpcs.sql.
--
-- Doar status='platit' (rezervări confirmate). Holdurile 'rezervat' neplătite
-- expiră prin cron (expire_open_holds) și nu trebuie să apară în calendar.

create or replace function get_rezervari_client(p_client uuid)
returns table (
  rezervare_id uuid,
  sesiune_id uuid,
  curs_nume text,
  data date,
  locatie text,
  instructor_nume text,
  suma numeric,
  status status_rezervare
)
language sql stable security definer set search_path = public as $$
  select r.id, s.id, c.numele, s.data, l.nume, t.nume, r.suma, r.status
  from open_rezervari r
  join open_sesiuni s on s.id = r.sesiune
  join cursuri c on c.id = s.curs
  left join locatii l on l.id = c.locatie
  left join teacheri t on t.id = s.instructor
  where r.client = p_client
    and p_client in (select client_member_ids())
    and r.status = 'platit'
  order by s.data asc;
$$;

grant execute on function get_rezervari_client(uuid) to authenticated;
