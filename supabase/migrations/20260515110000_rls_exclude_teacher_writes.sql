-- Politica inițială permitea ORICĂRUI utilizator autentificat să facă INSERT/UPDATE
-- pe tabelele operaționale. Acum că avem rolul `teacher`, restrângem aceste
-- politici la rolurile `admin` și `user` (recepție). Teacherii pot scrie doar pe
-- `evaluari` (politici dedicate în migration-ul anterior).

do $$
declare
  user_write_tables text[] := array[
    'clienti','familii','enrollments','incasari','prezente','leads',
    'programari_leads','prospecti','situatie_sms_uri','feedback'
  ];
  t text;
begin
  foreach t in array user_write_tables loop
    execute format('drop policy if exists %I on %I', t || '_user_insert', t);
    execute format('drop policy if exists %I on %I', t || '_user_update', t);

    execute format(
      'create policy %I on %I for insert to authenticated with check (auth_role() in (''admin'', ''user''))',
      t || '_user_insert', t
    );
    execute format(
      'create policy %I on %I for update to authenticated using (auth_role() in (''admin'', ''user'')) with check (auth_role() in (''admin'', ''user''))',
      t || '_user_update', t
    );
  end loop;
end $$;
