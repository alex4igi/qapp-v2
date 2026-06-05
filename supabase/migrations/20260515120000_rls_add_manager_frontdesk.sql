-- Adăugăm rolurile `manager` și `front_desk` la lista de roluri ce pot scrie
-- pe tabelele operaționale. (`user` rămâne — alias legacy pentru front_desk.)
-- Limitele exacte per rol vor fi setate ulterior.

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
      'create policy %I on %I for insert to authenticated with check (auth_role() in (''admin'', ''manager'', ''user'', ''front_desk''))',
      t || '_user_insert', t
    );
    execute format(
      'create policy %I on %I for update to authenticated using (auth_role() in (''admin'', ''manager'', ''user'', ''front_desk'')) with check (auth_role() in (''admin'', ''manager'', ''user'', ''front_desk''))',
      t || '_user_update', t
    );
  end loop;
end $$;
