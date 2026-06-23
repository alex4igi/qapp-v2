-- Qapp v2 — Ștergere definitivă teacher / curs (admin), cu gardă pe dependențe.
--
-- Context: instructori și cursuri pot fi create din greșeală. Adminul vrea să le
-- poată șterge complet. RLS permite deja DELETE pentru admin/owner, DAR majoritatea
-- FK-urilor sunt ON DELETE SET NULL/CASCADE — un delete naiv ar orfana TĂCUT istoricul
-- (enrollments rămân fără curs, plățile pierd legătura etc.) fără nicio eroare.
--
-- De aceea ștergerea trece prin aceste RPC-uri SECURITY DEFINER care:
--   1) verifică rolul (doar admin/owner),
--   2) blochează dacă există dependențe reale (mesaj clar → folosește Arhivează),
--   3) altfel șterg rândul + scriu în audit_log.
-- „Creat din greșeală" = fără dependențe → se șterge curat.

-- ============================================================
-- Teacher
-- ============================================================
create or replace function delete_teacher_safe(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_blockers text[] := '{}';
  v_n int;
  v_has_account boolean;
begin
  if not is_admin() then
    raise exception 'Doar adminul poate șterge definitiv instructori.'
      using errcode = '42501';
  end if;

  if not exists (select 1 from teacheri where id = p_id) then
    raise exception 'Instructorul nu există (poate a fost deja șters).';
  end if;

  select count(*) into v_n from cursuri where teacher = p_id;
  if v_n > 0 then v_blockers := v_blockers || format('%s curs(uri) ca titular', v_n); end if;

  select count(*) into v_n from cursuri_teacheri where teacher_id = p_id;
  if v_n > 0 then v_blockers := v_blockers || format('%s asociere(i) la cursuri', v_n); end if;

  select count(*) into v_n from salarii_teacher where teacher = p_id;
  if v_n > 0 then v_blockers := v_blockers || format('%s salariu(i)', v_n); end if;

  select count(*) into v_n from evaluari_teacher where teacher_id = p_id;
  if v_n > 0 then v_blockers := v_blockers || format('%s evaluare(ări) HR', v_n); end if;

  select count(*) into v_n from evaluari where teacher = p_id;
  if v_n > 0 then v_blockers := v_blockers || format('%s evaluare(ări) de cursant', v_n); end if;

  select count(*) into v_n from evenimente where organizator = p_id;
  if v_n > 0 then v_blockers := v_blockers || format('%s eveniment(e)', v_n); end if;

  select count(*) into v_n from open_sesiuni where instructor = p_id;
  if v_n > 0 then v_blockers := v_blockers || format('%s sesiune(i) OPEN', v_n); end if;

  select (auth_user_id is not null) into v_has_account from teacheri where id = p_id;
  if v_has_account then v_blockers := v_blockers || 'cont de login'; end if;

  if array_length(v_blockers, 1) > 0 then
    raise exception 'Instructorul nu poate fi șters: are % . Arhivează-l în loc.',
      array_to_string(v_blockers, ', ');
  end if;

  insert into audit_log (actor_id, actor_role, action, entity_type, entity_id, old_value, reason)
  select auth.uid(), auth_role(), 'teacher_deleted', 'teacher', p_id,
         to_jsonb(t.*), 'Ștergere definitivă (admin)'
  from teacheri t where t.id = p_id;

  delete from teacheri where id = p_id;
end;
$$;

-- ============================================================
-- Curs
-- ============================================================
create or replace function delete_curs_safe(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_blockers text[] := '{}';
  v_n int;
begin
  if not is_admin() then
    raise exception 'Doar adminul poate șterge definitiv cursuri.'
      using errcode = '42501';
  end if;

  if not exists (select 1 from cursuri where id = p_id) then
    raise exception 'Cursul nu există (poate a fost deja șters).';
  end if;

  select count(*) into v_n from enrollments where cursul = p_id;
  if v_n > 0 then v_blockers := v_blockers || format('%s înrolare(i)', v_n); end if;

  select count(*) into v_n from evaluari where cursul = p_id;
  if v_n > 0 then v_blockers := v_blockers || format('%s evaluare(ări)', v_n); end if;

  select count(*) into v_n from feedback where cursul = p_id;
  if v_n > 0 then v_blockers := v_blockers || format('%s feedback', v_n); end if;

  select count(*) into v_n from reinscrieri_gate where curs_tinta_id = p_id;
  if v_n > 0 then v_blockers := v_blockers || format('%s reînscriere(i)', v_n); end if;

  select count(*) into v_n from open_sesiuni where curs = p_id;
  if v_n > 0 then v_blockers := v_blockers || format('%s sesiune(i) OPEN', v_n); end if;

  select count(*) into v_n from cursuri where cursul_original = p_id;
  if v_n > 0 then v_blockers := v_blockers || format('%s curs(uri) clonat(e) din el', v_n); end if;

  if array_length(v_blockers, 1) > 0 then
    raise exception 'Cursul nu poate fi șters: are % . Arhivează-l în loc.',
      array_to_string(v_blockers, ', ');
  end if;

  insert into audit_log (actor_id, actor_role, action, entity_type, entity_id, old_value, reason)
  select auth.uid(), auth_role(), 'curs_deleted', 'curs', p_id,
         to_jsonb(c.*), 'Ștergere definitivă (admin)'
  from cursuri c where c.id = p_id;

  delete from cursuri where id = p_id;
end;
$$;

grant execute on function delete_teacher_safe(uuid) to authenticated;
grant execute on function delete_curs_safe(uuid) to authenticated;
