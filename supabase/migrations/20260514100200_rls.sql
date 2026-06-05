-- Qapp v2 — Row Level Security
-- Două roluri: `admin` (manager) și `user` (recepție).
-- Rolul se stochează în app_metadata.role al utilizatorului Supabase Auth
-- (app_metadata nu poate fi modificat de utilizator — sigur pentru autorizare).

-- ============================================================
-- HELPERE
-- ============================================================
create or replace function auth_role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'role', ''),
    'user'
  );
$$;

create or replace function is_admin()
returns boolean
language sql
stable
as $$
  select auth_role() = 'admin';
$$;

-- ============================================================
-- POLITICI
-- Toți utilizatorii autentificați: SELECT pe tot.
-- admin: INSERT / UPDATE / DELETE pe tot.
-- user (recepție): INSERT / UPDATE pe tabelele operaționale.
-- ============================================================
do $$
declare
  all_tables text[] := array[
    'locatii','sezoane','sali','teacheri','familii','campanii_promovare','clienti',
    'cursuri','vouchere','enrollments','inventar','evenimente','incasari','prezente',
    'concursuri','feedback','cheltuieli','leads','programari_leads','prospecti',
    'situatie_sms_uri','parametri_aplicatie'
  ];
  -- Tabele pe care recepția le poate completa/edita
  user_write_tables text[] := array[
    'clienti','familii','enrollments','incasari','prezente','leads',
    'programari_leads','prospecti','situatie_sms_uri','feedback'
  ];
  t text;
begin
  foreach t in array all_tables loop
    execute format('alter table %I enable row level security', t);

    execute format(
      'create policy %I on %I for select to authenticated using (true)',
      t || '_select_all', t
    );

    execute format(
      'create policy %I on %I for all to authenticated using (is_admin()) with check (is_admin())',
      t || '_admin_all', t
    );

    if t = any(user_write_tables) then
      execute format(
        'create policy %I on %I for insert to authenticated with check (true)',
        t || '_user_insert', t
      );
      execute format(
        'create policy %I on %I for update to authenticated using (true) with check (true)',
        t || '_user_update', t
      );
    end if;
  end loop;
end $$;

-- ============================================================
-- VIEW-URI: security_invoker pentru a respecta RLS pe tabelele de bază
-- ============================================================
do $$
declare v text;
begin
  foreach v in array array[
    'clienti_unici','de_incasat_pe_luna','incasat_pe_luna','incasari_curs_luna',
    'incasari_locatie_luna','incasari_sala_luna','incasari_teacher_luna',
    'inrolari_clienti','lista_clienti','lista_cursuri','lista_familii','lista_incasari',
    'plati_inrolari','profil_client','profil_teacher','raport_financiar','raport_incasari',
    'restante_curs_luna','restante_locatie_luna','restante_sala_luna','restante_teacher_luna',
    'statistica_incasari_totale','statistica_prezente_curs','statistica_restante_totale'
  ]
  loop
    execute format('alter view %I set (security_invoker = true)', v);
  end loop;
end $$;
