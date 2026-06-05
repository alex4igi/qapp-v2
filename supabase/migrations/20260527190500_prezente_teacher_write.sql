-- Qapp v2 — Teacher poate marca prezența la cursurile asociate (M:N).
-- Recap Phase 6: teacherul e responsabilul primar pentru marcat prezența;
-- front-desk e backup.

-- Politica `prezente_user_insert` deja restricționează la admin/owner/manager/front_desk
-- (din migrațiile anterioare). Adăugăm politici dedicate pentru teacher.

create policy prezente_teacher_insert on prezente
  for insert to authenticated
  with check (
    is_teacher()
    and exists (
      select 1 from enrollments e
      where e.id = prezente.enrollment
        and teacher_can_access_curs(e.cursul)
    )
  );

create policy prezente_teacher_update on prezente
  for update to authenticated
  using (
    is_teacher()
    and exists (
      select 1 from enrollments e
      where e.id = prezente.enrollment
        and teacher_can_access_curs(e.cursul)
    )
  )
  with check (
    is_teacher()
    and exists (
      select 1 from enrollments e
      where e.id = prezente.enrollment
        and teacher_can_access_curs(e.cursul)
    )
  );
