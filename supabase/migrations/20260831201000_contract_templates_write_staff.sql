-- Editarea șabloanelor de contract coboară de la owner/admin la tot staff-ul
-- (owner, admin, manager, front_desk) — recepția întreține șabloanele.
--
-- Ce NU se schimbă: un șablon care are deja contracte trimise rămâne imutabil
-- (`locked_at` + trg_contract_template_lock oprește orice UPDATE pe fields /
-- pdf_storage_path). Deci „editarea" pe un șablon folosit înseamnă tot clonă
-- într-o versiune nouă, care pornește inactivă. Teacher / parinte / marketing
-- rămân în afară (primele două prin lista de mai jos, ultimele prin gardurile
-- restrictive deny_parinte_direct / deny_marketing_*).
--
-- Notă: auth_role() cade pe 'front_desk' pentru un token autentificat fără
-- app_metadata.role — același default pe care îl aplică deja restul aplicației
-- unui cont de staff fără rol setat.

drop policy if exists contract_templates_write_admin on contract_templates;

create policy contract_templates_write_staff on contract_templates
  for all to authenticated
  using (auth_role() in ('owner', 'admin', 'manager', 'front_desk'))
  with check (auth_role() in ('owner', 'admin', 'manager', 'front_desk'));
