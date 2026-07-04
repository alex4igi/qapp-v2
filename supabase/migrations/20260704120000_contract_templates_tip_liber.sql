-- Editorul de template-uri (Faza 3) permite adăugarea liberă de tipuri noi de
-- contract, nu doar cele 4 predefinite — relaxăm CHECK-ul rigid la un IN-list.
-- Constraint-ul original a fost creat inline (fără nume explicit), deci îi
-- descoperim dinamic numele generat automat de Postgres în loc să-l ghicim.
do $$
declare
  con record;
begin
  for con in
    select conname from pg_constraint
    where conrelid = 'contract_templates'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%tip%in%'
  loop
    execute format('alter table contract_templates drop constraint %I', con.conname);
  end loop;
end $$;

alter table contract_templates
  add constraint contract_templates_tip_nu_gol check (length(trim(tip)) > 0);
