-- Modul Evaluări — Raport Evaluare STREETDANCE
-- Instructorii completează un formular per cursant, doar pentru studenții
-- înrolați la cursurile predate de ei.

-- 1) Legătura teacheri ↔ auth.users (instructorii au cont propriu)
alter table teacheri
  add column auth_user_id uuid references auth.users(id) on delete set null;
create unique index teacheri_auth_user_id_key
  on teacheri(auth_user_id)
  where auth_user_id is not null;

-- 2) Tabel evaluări
create table evaluari (
  id                  uuid primary key default gen_random_uuid(),
  client              uuid not null references clienti(id)  on delete cascade,
  cursul              uuid not null references cursuri(id)  on delete cascade,
  teacher             uuid not null references teacheri(id) on delete set null,
  data_evaluarii      date not null default current_date,
  nivel_grupa         text,
  skill_ritm          smallint check (skill_ritm          between 1 and 5),
  skill_pasi_baza     smallint check (skill_pasi_baza     between 1 and 5),
  skill_coregrafie    smallint check (skill_coregrafie    between 1 and 5),
  skill_izolari       smallint check (skill_izolari       between 1 and 5),
  skill_coordonare    smallint check (skill_coordonare    between 1 and 5),
  skill_freeze        smallint check (skill_freeze        between 1 and 5),
  skill_sincronizare  smallint check (skill_sincronizare  between 1 and 5),
  skill_improvizatie  smallint check (skill_improvizatie  between 1 and 5),
  skill_expresivitate smallint check (skill_expresivitate between 1 and 5),
  skill_prezentare    smallint check (skill_prezentare    between 1 and 5),
  feedback_general    text,
  created             timestamptz not null default now(),
  updated             timestamptz not null default now()
);

create index idx_evaluari_client  on evaluari(client);
create index idx_evaluari_cursul  on evaluari(cursul);
create index idx_evaluari_teacher on evaluari(teacher);

-- 3) Helpere RLS
create or replace function current_teacher_id()
returns uuid
language sql
stable
as $$
  select id from teacheri where auth_user_id = auth.uid() limit 1;
$$;

create or replace function is_teacher()
returns boolean
language sql
stable
as $$
  select auth_role() = 'teacher';
$$;

-- 4) RLS pe evaluari
alter table evaluari enable row level security;

-- admin: full
create policy evaluari_admin_all
  on evaluari for all to authenticated
  using (is_admin()) with check (is_admin());

-- user (recepție): citește tot (read-only)
create policy evaluari_select_all
  on evaluari for select to authenticated
  using (true);

-- teacher: poate insera doar pentru cursurile predate de el și
-- doar pentru cursanți înrolați la acel curs
create policy evaluari_teacher_insert
  on evaluari for insert to authenticated
  with check (
    is_teacher()
    and teacher = current_teacher_id()
    and exists (
      select 1 from cursuri c
      where c.id = evaluari.cursul and c.teacher = current_teacher_id()
    )
    and exists (
      select 1 from enrollments e
      where e.cursul = evaluari.cursul and e.client = evaluari.client
    )
  );

-- teacher: poate edita doar evaluările proprii
create policy evaluari_teacher_update
  on evaluari for update to authenticated
  using (is_teacher() and teacher = current_teacher_id())
  with check (is_teacher() and teacher = current_teacher_id());

-- teacher: poate șterge doar evaluările proprii
create policy evaluari_teacher_delete
  on evaluari for delete to authenticated
  using (is_teacher() and teacher = current_teacher_id());
