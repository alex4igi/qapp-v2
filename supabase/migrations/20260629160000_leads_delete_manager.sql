-- Ștergere completă (hard delete) a unui lead — permisă de la manager în sus.
-- Până acum DELETE pe `leads` era acoperit doar de politica `leads_admin_all`
-- (is_admin() = doar rolul 'admin', nici măcar owner). Adăugăm o politică
-- DELETE permisivă explicită pentru manager/admin/owner.
--
-- Dependențele se rezolvă singure: programari_leads, sms_logs, lead_history,
-- lead_contacte, confirmari_programare_sms = ON DELETE CASCADE;
-- email_logs, vouchere = ON DELETE SET NULL.

drop policy if exists leads_delete_manager on leads;

create policy leads_delete_manager on leads
  for delete to authenticated
  using (auth_role() in ('admin', 'manager', 'owner'));
