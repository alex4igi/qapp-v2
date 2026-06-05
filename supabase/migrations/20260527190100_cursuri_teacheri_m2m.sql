-- Qapp v2 — Co-trainer: un curs poate avea mai mulți teacheri (ex: Eva + Andrei la UNIQ).
-- Tabel M:N `cursuri_teacheri`. Backfill din cursuri.teacher (păstrat ca „titular default").
-- RLS pe `evaluari` actualizat să folosească M:N în loc de doar cursuri.teacher.

-- ============================================================
-- 1) Tabel M:N
-- ============================================================
create table cursuri_teacheri (
  curs_id    uuid not null references cursuri(id) on delete cascade,
  teacher_id uuid not null references teacheri(id) on delete cascade,
  rol        text not null default 'titular' check (rol in ('titular', 'asistent')),
  created    timestamptz not null default now(),
  primary key (curs_id, teacher_id)
);

create index idx_cursuri_teacheri_teacher on cursuri_teacheri(teacher_id);
create index idx_cursuri_teacheri_curs    on cursuri_teacheri(curs_id);

-- ============================================================
-- 2) Backfill din cursuri.teacher → ca titular
-- ============================================================
insert into cursuri_teacheri (curs_id, teacher_id, rol)
select id, teacher, 'titular'
from cursuri
where teacher is not null
on conflict (curs_id, teacher_id) do nothing;

-- ============================================================
-- 3) Helper: teacherul curent are acces la curs (titular sau asistent)?
-- ============================================================
create or replace function teacher_can_access_curs(p_curs uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from cursuri_teacheri ct
    where ct.curs_id = p_curs
      and ct.teacher_id = current_teacher_id()
  );
$$;

grant execute on function teacher_can_access_curs(uuid) to authenticated;

-- ============================================================
-- 4) RLS pe cursuri_teacheri
-- ============================================================
alter table cursuri_teacheri enable row level security;

create policy cursuri_teacheri_select_all on cursuri_teacheri
  for select to authenticated using (true);

create policy cursuri_teacheri_admin_all on cursuri_teacheri
  for all to authenticated
  using (is_admin()) with check (is_admin());

-- Manager poate gestiona asocierile la cursurile din locația lui.
create policy cursuri_teacheri_manager_write on cursuri_teacheri
  for all to authenticated
  using (
    is_manager() and exists (
      select 1
      from cursuri c
      join sali s on s.id = c.sala
      where c.id = cursuri_teacheri.curs_id
        and is_in_my_locatie(s.locatie)
    )
  )
  with check (
    is_manager() and exists (
      select 1
      from cursuri c
      join sali s on s.id = c.sala
      where c.id = cursuri_teacheri.curs_id
        and is_in_my_locatie(s.locatie)
    )
  );

-- ============================================================
-- 5) RLS evaluari: teacher poate insera/edita evaluare doar dacă
--    are acces la curs prin M:N (titular sau asistent).
-- ============================================================
drop policy if exists evaluari_teacher_insert on evaluari;

create policy evaluari_teacher_insert
  on evaluari for insert to authenticated
  with check (
    is_teacher()
    and teacher = current_teacher_id()
    and teacher_can_access_curs(evaluari.cursul)
    and exists (
      select 1 from enrollments e
      where e.cursul = evaluari.cursul and e.client = evaluari.client
    )
  );

-- update/delete rămân ca înainte (teacher = current_teacher_id())
