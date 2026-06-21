-- M2: managerul poate completa/edita evaluări (e omul care vede instructorii la sală
-- zilnic). Până acum scrierea era doar admin+ (evaluari_admin_all) sau teacher-pe-ale-lui.
-- Adăugăm politici de scriere pentru manager, limitate la cursurile din locația lui.

create or replace function evaluare_in_locatia_mea(p_curs uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from cursuri c
    join sali s on s.id = c.sala
    where c.id = p_curs
      and is_in_my_locatie(s.locatie)
  );
$$;

grant execute on function evaluare_in_locatia_mea(uuid) to authenticated;

-- Idempotent: o versiune anterioară a acestei migrații a fost aplicată pe remote
-- sub alt număr (drift) — drop-uim întâi ca să putem re-rula curat oriunde.
drop policy if exists evaluari_manager_insert on evaluari;
create policy evaluari_manager_insert
  on evaluari for insert to authenticated
  with check (is_manager() and evaluare_in_locatia_mea(evaluari.cursul));

drop policy if exists evaluari_manager_update on evaluari;
create policy evaluari_manager_update
  on evaluari for update to authenticated
  using (is_manager() and evaluare_in_locatia_mea(evaluari.cursul))
  with check (is_manager() and evaluare_in_locatia_mea(evaluari.cursul));

drop policy if exists evaluari_manager_delete on evaluari;
create policy evaluari_manager_delete
  on evaluari for delete to authenticated
  using (is_manager() and evaluare_in_locatia_mea(evaluari.cursul));
