-- Instructorul își rezervă sala la ORICE locație.
--
-- Regula din 20260721150100 („teacher rezervă doar la locația lui, dacă are una
-- asignată") a fost copiată din logica recepției, unde are sens: front_desk
-- încasează bani în casa locației ei. Pentru instructor nu are — sala pe care o
-- folosește pentru antrenament n-are legătură cu locația unde predă. Efectul era
-- că un instructor de la Nicolina nu putea rezerva pe Ștefan cel Mare (decizie
-- user 2026-07-28).
--
-- Restul gardurilor rămân neatinse: rezervă DOAR pentru el (teacher =
-- current_teacher_id()), DOAR tier 'staff', fără bani (trigger-ul
-- inchirieri_guard) și doar pe sloturi libere (exclusion constraint).
-- front_desk rămâne legat de locația lui.

drop policy if exists inchirieri_teacher_insert on inchirieri;

create policy inchirieri_teacher_insert on inchirieri
  for insert to authenticated
  with check (
    auth_role() = 'teacher'
    and teacher is not null
    and teacher = current_teacher_id()
    and tier::text = 'staff'
  );
