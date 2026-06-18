-- Obiectivele lunare se setează de admin (face și marketing), nu doar owner.
-- Înlocuiește policy-ul de scriere is_owner() cu admin-or-owner.

drop policy if exists scorecard_obiective_write on scorecard_obiective;

create policy scorecard_obiective_write on scorecard_obiective
  for all to authenticated
  using (is_admin() or is_owner())
  with check (is_admin() or is_owner());
