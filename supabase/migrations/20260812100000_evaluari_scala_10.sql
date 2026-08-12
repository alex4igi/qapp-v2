-- Evaluări cursanți: scala trece de la 1–5 întregi la 1–10, ca UI-ul să poată oferi
-- jumătăți de stea păstrând 5 stele afișate (jumătatea = 1 treaptă, steaua = 2).
-- DB-ul ține treptele; conversia la stele se face DOAR la afișare (scale.ts în ambele
-- app-uri). `null` rămâne „neevaluat", distinct de orice notă.
--
-- Idempotență: gardul verifică dacă mai există vreun check `<= 5` pe tabel. Fără el,
-- o a doua rulare ar dubla notele încă o dată (4 → 8 → 16) și le-ar rupe pe toate.

do $$
declare
  v_cols text[] := array[
    'skill_ritm', 'skill_pasi_baza', 'skill_coregrafie', 'skill_izolari',
    'skill_coordonare', 'skill_freeze', 'skill_sincronizare', 'skill_improvizatie',
    'skill_expresivitate', 'skill_prezentare'
  ];
  v_col  text;
  v_con  text;
  v_n    integer;
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'evaluari'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%<= 5)%'
  ) then
    raise notice 'evaluari: scala e deja 1-10, migrația sare peste conversie.';
    return;
  end if;

  -- 1) Scoatem checkurile vechi (numele sunt cele generate de Postgres la create table,
  --    dar le căutăm dinamic ca migrația să nu depindă de ele).
  foreach v_col in array v_cols loop
    for v_con in
      select c.conname
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public'
        and t.relname = 'evaluari'
        and c.contype = 'c'
        and pg_get_constraintdef(c.oid) like '%' || v_col || '%'
    loop
      execute format('alter table evaluari drop constraint %I', v_con);
    end loop;
  end loop;

  -- 2) Conversia: 1–5 → 2–10 (nota veche N devine N stele întregi).
  foreach v_col in array v_cols loop
    execute format('update evaluari set %I = %I * 2 where %I is not null', v_col, v_col, v_col);
  end loop;

  get diagnostics v_n = row_count;
  raise notice 'evaluari: scala convertită la 1-10.';

  -- 3) Checkurile noi.
  foreach v_col in array v_cols loop
    execute format(
      'alter table evaluari add constraint %I check (%I between 1 and 10)',
      'evaluari_' || v_col || '_check', v_col
    );
  end loop;
end $$;

comment on column evaluari.skill_ritm is
  'Trepte 1-10; UI-ul afișează 5 stele cu jumătăți (treapta/2). Null = neevaluat.';
