-- Evaluări cursanți: cine le vede și când ajung la părinte.
--
-- Două schimbări de fond:
--   1. `evaluari_select_all using (true)` dădea ORICĂRUI cont autentificat toate
--      evaluările tuturor copiilor. Recepția rămâne cu cele deja trimise (ce a ajuns
--      la părinte e oricum cunoscut familiei); ciornele și cele în verificare rămân
--      între instructor și manager.
--   2. get_evaluari_client publica orice rând, indiferent de stare. De acum publică
--      exclusiv `trimisa` — poarta pe care se sprijină tot fluxul de verificare.

-- ============================================================
-- 1) Citirea în staff
-- ============================================================
drop policy if exists evaluari_select_all on evaluari;

create policy evaluari_select_scoped on evaluari
  for select to authenticated
  using (
    is_admin()
    or (is_manager() and evaluare_in_locatia_mea(cursul))
    or exists (
      select 1 from cursuri c
      where c.id = evaluari.cursul
        and (c.teacher = current_teacher_id()
             or exists (select 1 from cursuri_teacheri ct
                        where ct.curs_id = c.id and ct.teacher_id = current_teacher_id()))
    )
    or (auth_role() = 'front_desk' and stare = 'trimisa')
  );

-- ============================================================
-- 2) Scrierea se oprește la trimiterea spre manager
-- ============================================================
-- Odată plecată la verificare, evaluarea nu se mai rescrie pe sub mâna managerului:
-- corectura se face pe drumul explicit (respingere cu motiv → teacherul reia).
-- Trecerile de stare se fac prin RPC-uri SECURITY DEFINER, care ocolesc politicile.
drop policy if exists evaluari_teacher_update on evaluari;
create policy evaluari_teacher_update
  on evaluari for update to authenticated
  using (is_teacher() and teacher = current_teacher_id() and stare in ('ciorna','respinsa'))
  with check (is_teacher() and teacher = current_teacher_id() and stare in ('ciorna','respinsa'));

drop policy if exists evaluari_teacher_delete on evaluari;
create policy evaluari_teacher_delete
  on evaluari for delete to authenticated
  using (is_teacher() and teacher = current_teacher_id() and stare in ('ciorna','respinsa'));

drop policy if exists evaluari_manager_update on evaluari;
create policy evaluari_manager_update
  on evaluari for update to authenticated
  using (is_manager() and evaluare_in_locatia_mea(evaluari.cursul) and stare in ('ciorna','respinsa'))
  with check (is_manager() and evaluare_in_locatia_mea(evaluari.cursul) and stare in ('ciorna','respinsa'));

drop policy if exists evaluari_manager_delete on evaluari;
create policy evaluari_manager_delete
  on evaluari for delete to authenticated
  using (is_manager() and evaluare_in_locatia_mea(evaluari.cursul) and stare in ('ciorna','respinsa'));

-- ============================================================
-- 3) Poarta portalului
-- ============================================================
create or replace function get_evaluari_client(p_client uuid)
returns table (
  id uuid, data date, curs_nume text, teacher_nume text, nivel_grupa text, feedback_general text,
  skill_ritm integer, skill_pasi_baza integer, skill_coregrafie integer, skill_izolari integer,
  skill_coordonare integer, skill_freeze integer, skill_sincronizare integer,
  skill_improvizatie integer, skill_expresivitate integer, skill_prezentare integer
)
language sql stable security definer set search_path = public as $$
  select e.id, e.data_evaluarii::date, c.numele, t.nume, e.nivel_grupa, e.feedback_general,
    e.skill_ritm, e.skill_pasi_baza, e.skill_coregrafie, e.skill_izolari, e.skill_coordonare,
    e.skill_freeze, e.skill_sincronizare, e.skill_improvizatie, e.skill_expresivitate, e.skill_prezentare
  from evaluari e
  left join cursuri c on c.id = e.cursul
  left join teacheri t on t.id = e.teacher
  where e.client = p_client
    and p_client in (select client_member_ids())
    -- Poarta: doar ce a aprobat managerul și a expediat cronul.
    and e.stare = 'trimisa'
  order by e.data_evaluarii desc nulls last;
$$;

revoke execute on function get_evaluari_client(uuid) from anon, public;
grant execute on function get_evaluari_client(uuid) to authenticated;
