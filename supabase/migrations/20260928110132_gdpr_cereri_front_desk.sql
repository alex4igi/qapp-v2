-- Cererile GDPR (copia datelor, ștergerea) le primește și le rezolvă recepția
-- (decizie Alex, 28 sept. 2026) — nu doar owner/admin. Previzualizarea anonimizării
-- lunare rămâne la owner/admin.
do $$
declare
  f text;
  v_def text;
  v_nou text;
begin
  foreach f in array array['gdpr_export_client(uuid, text)', 'anonimizeaza_client(uuid, text)'] loop
    v_def := pg_get_functiondef(f::regprocedure);
    v_nou := replace(v_def,
      $q$(select auth_role()) not in ('owner', 'admin') then$q$,
      $q$(select auth_role()) not in ('owner', 'admin', 'manager', 'front_desk') then$q$);
    if v_nou = v_def then
      raise exception '%: gardul de rol nu a fost găsit', f;
    end if;
    execute v_nou;
  end loop;
end $$;
