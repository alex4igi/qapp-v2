-- 4.6 / Faza 3: instructorul (rolul `teacher`) citește din DB doar ce ține de grupele lui.
--
-- De ce în DB: RLS-ul de bază dă `select using (true)` oricărui cont autentificat, deci
-- tokenul unui instructor citea prin API toți clienții, leadurile, încasările, contractele.
-- Filtrul e pe GRUPĂ, nu pe copil (review Codex): un copil care merge la două grupe nu-i
-- dă instructorului A prezențele, banii sau evaluările de la grupa lui B.
--
-- Model: ca `deny_marketing_*` (20260828220100) — fiecare tabel primește o decizie
-- explicită, marcată prin numele politicii restrictive:
--   teacher_scope       — filtrat pe grupele / elevii / rezervările lui
--   teacher_ok          — nomenclator sau tabel deja scopat de politicile lui; marcaj no-op
--   deny_teacher_direct — refuz total
-- Un tabel nou fără niciuna apare în rls_teacher_gap_report() (scripts/check-rls-teacher.mjs).
-- Managerul care predă NU e afectat: filtrul se uită la rol, nu la profilul de instructor.

-- ── Fereastra de sezoane ─────────────────────────────────────────────────────
-- Sezonul activ + orice sezon încheiat după (început sezon activ − 1 an): azi
-- 2026-2027, Vara 2026 și 2025-2026. Pe `data_final`, nu pe `data_incepere`, ca
-- să nu depindă de ziua exactă în care începe sezonul următor.
create or replace function public.teacher_sezoane_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select s.id
  from sezoane s
  where s.data_final >= (
    select a.data_incepere - interval '1 year'
    from sezoane a where a.activ order by a.data_incepere desc limit 1
  );
$$;

create or replace function public.teacher_curs_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select ct.curs_id
  from cursuri_teacheri ct
  join cursuri c on c.id = ct.curs_id
  where ct.teacher_id = (select my_teacher_id())
    and c.sezon in (select teacher_sezoane_ids());
$$;

create or replace function public.teacher_enrollment_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select e.id from enrollments e where e.cursul in (select teacher_curs_ids());
$$;

create or replace function public.teacher_open_sesiuni_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select os.id from open_sesiuni os where os.curs in (select teacher_curs_ids());
$$;

-- Elevii lui: înscriși la grupele lui sau cu o rezervare OPEN neanulată la ele.
create or replace function public.teacher_client_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select e.client from enrollments e
  where e.cursul in (select teacher_curs_ids()) and e.client is not null
  union
  select r.client from open_rezervari r
  where r.sesiune in (select teacher_open_sesiuni_ids())
    and r.status <> 'anulat' and r.client is not null;
$$;

create or replace function public.teacher_familie_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select c.familia from clienti c
  where c.id in (select teacher_client_ids()) and c.familia is not null;
$$;

-- Leadurile programate la proba la grupele lui (numele apare pe roster).
create or replace function public.teacher_lead_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select pl.lead from programari_leads pl
  where pl.cursul_programat in (select teacher_curs_ids()) and pl.lead is not null;
$$;

do $$
declare f text;
begin
  foreach f in array array['teacher_sezoane_ids', 'teacher_curs_ids', 'teacher_enrollment_ids',
    'teacher_open_sesiuni_ids', 'teacher_client_ids', 'teacher_familie_ids', 'teacher_lead_ids'] loop
    execute format('revoke execute on function public.%I() from public, anon', f);
    execute format('grant execute on function public.%I() to authenticated, service_role', f);
  end loop;
end $$;

-- ── Politicile ───────────────────────────────────────────────────────────────
do $$
declare
  r record;
  -- tabel → condiția pentru instructor (restul rolurilor trec neatinse)
  scope jsonb := jsonb_build_object(
    'clienti',              'id in (select teacher_client_ids())',
    'familii',              'id in (select teacher_familie_ids())',
    'enrollments',          'cursul in (select teacher_curs_ids())',
    'prezente',             'enrollment in (select teacher_enrollment_ids())',
    'incasari',             'inregistrare in (select teacher_enrollment_ids())',
    'open_rezervari',       'sesiune in (select teacher_open_sesiuni_ids())',
    'evaluari',             'cursul in (select teacher_curs_ids())',
    'evaluari_exceptii',    'curs_id in (select teacher_curs_ids())',
    'programari_leads',     'cursul_programat in (select teacher_curs_ids())',
    'leads',                'id in (select teacher_lead_ids())',
    'feedback',             '(cursul in (select teacher_curs_ids()) or open_sesiune in (select teacher_open_sesiuni_ids()))',
    'inchirieri',           'teacher = (select my_teacher_id())'
  );
  -- Nomenclatoare fără date personale + tabele deja scopate de politicile lor
  -- (anunțuri, notificări, salariul/pontajul propriu, detaliile proprii).
  ok text[] := array[
    'locatii', 'sali', 'sezoane', 'sezon_calendar', 'vacante', 'cursuri', 'cursuri_teacheri',
    'cursuri_suspendari', 'teacheri', 'teacheri_detalii', 'program_module', 'program_lectii',
    'program_jurnal', 'programe_metodologice', 'curs_lectii_override', 'tarife_inchiriere',
    'tarife_publice', 'parametri_aplicatie', 'unitati_invatamant', 'motive_abandon',
    'open_sesiuni', 'evenimente', 'sesiuni_evaluare', 'sesiune_evaluare_grupe',
    'anunturi', 'anunturi_clienti', 'anunturi_destinatari', 'app_feedback', 'notifications',
    'salarii_teacher', 'staff_pontaj', 'pontaj_luni'
  ];
begin
  for r in
    select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  loop
    execute format('drop policy if exists teacher_scope on public.%I', r.relname);
    execute format('drop policy if exists teacher_ok on public.%I', r.relname);
    execute format('drop policy if exists deny_teacher_direct on public.%I', r.relname);

    if scope ? r.relname then
      execute format(
        'create policy teacher_scope on public.%I as restrictive for all to authenticated '
        || 'using ((select auth_role()) <> %L or %s) with check ((select auth_role()) <> %L or %s)',
        r.relname, 'teacher', scope ->> r.relname, 'teacher', scope ->> r.relname);
    elsif r.relname = any (ok) then
      execute format(
        'create policy teacher_ok on public.%I as restrictive for select to authenticated using (true)',
        r.relname);
    else
      execute format(
        'create policy deny_teacher_direct on public.%I as restrictive for all to authenticated '
        || 'using ((select auth_role()) <> %L) with check ((select auth_role()) <> %L)',
        r.relname, 'teacher', 'teacher');
    end if;
  end loop;
end $$;

-- Raport pentru gardian: tabelele fără RLS sau fără decizie pentru instructor.
create or replace function public.rls_teacher_gap_report()
returns table (tabel text, problema text)
language sql stable security definer set search_path = public as $$
  select c.relname::text,
         case when not c.relrowsecurity then 'RLS dezactivat'
              else 'lipsă decizia pentru instructor (teacher_scope / teacher_ok / deny_teacher_direct)' end
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and (
      not c.relrowsecurity
      or not exists (
        select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = c.relname
          and p.policyname in ('teacher_scope', 'teacher_ok', 'deny_teacher_direct')
      )
    )
  order by 1;
$$;

revoke all on function public.rls_teacher_gap_report() from public, anon, authenticated;
grant execute on function public.rls_teacher_gap_report() to service_role;
