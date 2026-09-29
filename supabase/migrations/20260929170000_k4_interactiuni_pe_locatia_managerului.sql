-- Interacțiunile K4: managerul introduce doar pentru locația lui (Alex, 29 sept. 2026) —
-- managerul de la Nicolina doar Nicolina, cel de la Ștefan doar Ștefan. Owner/admin: toate.
-- Locația managerului = `manageri_locatii` (aceeași ca la salarizarea lui), valabilă azi.

-- Security definer: `manageri_locatii` e tabel de salarizare, managerul nu-l citește direct.
-- Întoarce doar locațiile celui care întreabă, deci nu scapă nimic.
create or replace function public.locatii_manager_curent()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.locatie_id
  from manageri_locatii m
  where m.user_id = auth.uid()
    and m.valabil_de_la <= (now() at time zone 'Europe/Bucharest')::date
    and (m.valabil_pana_la is null or m.valabil_pana_la >= (now() at time zone 'Europe/Bucharest')::date);
$$;

revoke execute on function public.locatii_manager_curent() from anon, public;
grant execute on function public.locatii_manager_curent() to authenticated;

drop policy if exists k4_interactiuni_zi_manager on public.k4_interactiuni_zi;
create policy k4_interactiuni_zi_manager on public.k4_interactiuni_zi
  for all to authenticated
  using (
    (select auth_role()) in ('owner', 'admin')
    or ((select auth_role()) = 'manager' and locatie_id in (select locatii_manager_curent()))
  )
  with check (
    (select auth_role()) in ('owner', 'admin')
    or ((select auth_role()) = 'manager' and locatie_id in (select locatii_manager_curent()))
  );

create or replace function public.k4_puncte_interactiuni()
returns table (locatie_id uuid, locatie_nume text, cu_meta boolean)
language sql
stable
set search_path = public
as $$
  select lo.id, lo.nume,
         bool_or(coalesce((l.parametri ->> 'include_meta')::int, 0) = 1)
  from kpi_grile g
  join kpi_grila_linii l on l.grila_id = g.id and l.activ
  join kpi_definitii d on d.id = l.kpi_id and d.cheie = 'raspuns_24h'
  join kpi_grila_locatii gl on gl.grila_id = g.id
  join locatii lo on lo.id = gl.locatie
  where g.stare = 'activa' and l.parametri ? 'rata_peste'
    and ((select auth_role()) in ('owner', 'admin')
         or lo.id in (select locatii_manager_curent()))
  group by lo.id, lo.nume
  order by lo.nume;
$$;
