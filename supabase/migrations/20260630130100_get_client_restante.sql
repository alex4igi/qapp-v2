-- Restanțele unui client, defalcate pe sezon — pentru flag-ul de datorii la înrolare.
--
-- Reutilizează definiția canonică (rest = suma − sum(incasari), reziliat exclus,
-- prescriere la 2 ani pe data_incepere ca în plati_inrolari) + datoriile one-off
-- din datorii_rest. Întoarce un rând per (sezon, sursă) cu rest > 0; UI-ul agregă
-- totalul și evidențiază restul din sezonul anterior.

create or replace function get_client_restante(p_client uuid)
returns table (
  sezon_id   uuid,
  sezon_nume text,
  sursa      text,        -- 'abonament' | 'oneoff'
  rest       numeric
)
language sql
stable
security definer
set search_path = public
as $$
  -- Abonamente: rest ne-prescris per înrolare, grupat pe sezon.
  select
    e.sezon_id,
    s.numele_sezonului,
    'abonament'::text,
    sum(coalesce(e.suma, 0) - coalesce(p.platit, 0))::numeric
  from enrollments e
  left join sezoane s on s.id = e.sezon_id
  left join lateral (
    select sum(i.suma) as platit from incasari i where i.inregistrare = e.id
  ) p on true
  where e.client = p_client
    and e.reziliat = false
    and e.data_incepere >= (current_date - interval '2 years')
  group by e.sezon_id, s.numele_sezonului
  having sum(coalesce(e.suma, 0) - coalesce(p.platit, 0)) > 0

  union all

  -- One-off (Bilet/Merch/Taxă): rest din datorii_rest, grupat pe sezon.
  select
    dr.sezon,
    s.numele_sezonului,
    'oneoff'::text,
    sum(dr.rest)::numeric
  from datorii_rest dr
  left join sezoane s on s.id = dr.sezon
  where dr.client = p_client
    and dr.rest > 0
  group by dr.sezon, s.numele_sezonului;
$$;

grant execute on function get_client_restante(uuid) to authenticated;
