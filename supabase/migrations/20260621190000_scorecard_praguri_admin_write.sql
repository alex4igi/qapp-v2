-- Pragurile scorecard pot fi ajustate de admin SAU owner (nu doar owner).
-- Managerul rămâne exclus. is_admin() întoarce true doar pt rolul 'admin',
-- deci avem nevoie de (is_admin() or is_owner()).
drop policy if exists scorecard_praguri_write on scorecard_praguri;

create policy scorecard_praguri_write on scorecard_praguri
  for all to authenticated
  using (is_admin() or is_owner())
  with check (is_admin() or is_owner());
