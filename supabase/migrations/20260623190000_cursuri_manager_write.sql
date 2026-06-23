-- Qapp v2 — Manager poate crea/edita cursuri (aliniere RLS cu UI).
-- UI-ul afișează deja butonul „+ Curs nou" pentru manager (isManagerOrHigher),
-- dar RLS lăsa scrierea pe `cursuri` doar pentru admin/owner (is_admin), deci
-- managerul primea eroare RLS la salvare — inclusiv pe cursurile din sezonul nou.
-- DELETE rămâne doar pentru admin/owner (via cursuri_admin_all) — distructiv.

create policy cursuri_manager_insert on cursuri
  for insert to authenticated
  with check (auth_role() in ('admin', 'owner', 'manager'));

create policy cursuri_manager_update on cursuri
  for update to authenticated
  using (auth_role() in ('admin', 'owner', 'manager'))
  with check (auth_role() in ('admin', 'owner', 'manager'));
