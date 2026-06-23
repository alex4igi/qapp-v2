-- Qapp v2 — Manager poate crea/edita teacheri (aliniere RLS cu UI).
-- UI-ul permite deja managerului editarea (isManagerOrHigher) și nu gata butonul
-- „+ Teacher nou", dar RLS lăsa scrierea pe `teacheri` doar pentru admin/owner
-- (is_admin), deci managerul primea eroare RLS la salvare.
-- DELETE rămâne doar pentru admin/owner (via teacheri_admin_all) — distructiv.

create policy teacheri_manager_insert on teacheri
  for insert to authenticated
  with check (auth_role() in ('admin', 'owner', 'manager'));

create policy teacheri_manager_update on teacheri
  for update to authenticated
  using (auth_role() in ('admin', 'owner', 'manager'))
  with check (auth_role() in ('admin', 'owner', 'manager'));
