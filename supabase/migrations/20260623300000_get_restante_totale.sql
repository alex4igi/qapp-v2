-- Qapp v2 — RPC restanțe totale: net recuperabil + prescris separat.
--
-- Context: KPI-ul „Total restanțe" de pe dashboard citea statistica_restante_totale
-- (total − incasat), care e BRUT (include prescrisele) și nu expune flagul prescris.
-- /financiar și /statistici arată însă NET recuperabil. Decizia userului: toate KPI-urile
-- de raportare arată net + „din care prescrise" separat, identic peste tot.
--
-- Aceeași bază canonică ca plati_inrolari: înrolări ne-reziliate, rest = suma − Σ încasări,
-- prescris = data_incepere < current_date − 2 ani. p_locatie opțional (paritate cu dashboard).

create or replace function get_restante_totale(p_locatie uuid default null)
returns table (
  rest_net      numeric,
  rest_prescris numeric,
  rest_total    numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with per_enroll as (
    select
      coalesce(e.suma, 0)
        - coalesce((select sum(i.suma) from incasari i where i.inregistrare = e.id), 0) as rest,
      (e.data_incepere < (current_date - interval '2 years')) as prescris
    from enrollments e
    left join cursuri c on c.id = e.cursul
    left join sali s on s.id = c.sala
    where e.reziliat = false
      and (p_locatie is null or s.locatie = p_locatie)
  )
  select
    coalesce(sum(rest) filter (where rest > 0 and not prescris), 0) as rest_net,
    coalesce(sum(rest) filter (where rest > 0 and prescris), 0)     as rest_prescris,
    coalesce(sum(rest) filter (where rest > 0), 0)                  as rest_total
  from per_enroll;
$$;

grant execute on function get_restante_totale(uuid) to authenticated;
