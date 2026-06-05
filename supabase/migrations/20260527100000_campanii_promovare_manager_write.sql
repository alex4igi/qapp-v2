-- Qapp v2 — permite rolului `manager` să creeze/editeze/șteargă campanii promovare.
-- Pagina `/campanii` e accesibilă admin+manager (vezi navConfig.ts), deci RLS
-- trebuie să fie consistent cu ProtectedRoute.

drop policy if exists campanii_promovare_manager_write on campanii_promovare;

create policy campanii_promovare_manager_write on campanii_promovare
  for all to authenticated
  using (auth_role() in ('admin', 'manager'))
  with check (auth_role() in ('admin', 'manager'));
