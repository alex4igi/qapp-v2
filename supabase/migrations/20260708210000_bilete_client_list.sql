-- Ticketing spectacole — listare pentru portal (rol parinte).
-- Părintele nu poate citi `bilete` direct (gardul deny_parinte_direct), deci locurile
-- rămase se calculează într-un RPC SECURITY DEFINER. Doar evenimente publice, viitoare,
-- neanulate, cu preț de bilet valid.

create or replace function list_bilete_evenimente()
returns table (
  id uuid, nume text, data date, locatie text,
  pret_bilet numeric, capacitate integer, locuri_ramase integer
)
language sql stable security definer set search_path = public as $$
  select
    e.id, e.nume_eveniment, e.data, e.locatia, e.pret_bilet, e.capacitate,
    case
      when e.capacitate is null then null
      else greatest(
        0,
        e.capacitate - (
          select count(*)::int from bilete b
          where b.eveniment = e.id and b.status <> 'anulat'
        )
      )
    end as locuri_ramase
  from evenimente e
  where e.public
    and e.pret_bilet is not null and e.pret_bilet > 0
    and coalesce(e.data::date, current_date) >= current_date
    and (e.status is null or e.status <> 'Anulat')
  order by e.data asc nulls last;
$$;

grant execute on function list_bilete_evenimente() to authenticated, anon;
