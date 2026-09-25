-- REVENIRE pentru rls_teacher_pe_grupa (4.6 / Faza 3): scoate filtrul pe grupă al
-- instructorului, fără redeploy. Funcțiile teacher_*_ids() și raportul rămân (inofensive).
-- Se aplică DOAR dacă filtrul blochează ecrane de instructor; apoi se repară cauza și se
-- reaplică migrația originală (e idempotentă).
do $$
declare r record;
begin
  for r in
    select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  loop
    execute format('drop policy if exists teacher_scope on public.%I', r.relname);
    execute format('drop policy if exists teacher_ok on public.%I', r.relname);
    execute format('drop policy if exists deny_teacher_direct on public.%I', r.relname);
  end loop;
end $$;
