-- Evaluare profesor (HR): owner/manager evaluează performanța unui profesor, lunar.
-- DISTINCT de tabelul `evaluari` (acolo PROFESORUL notează CURSANTUL).
-- Vizibil DOAR owner/admin/manager (dosar HR privat). front_desk + teacher NU văd.
-- feedback_cursanti = scor manual în v1 (managerul îl strânge offline); Faza 2 =
-- populat dintr-un flux de rating din portalul de client.

create table evaluari_teacher (
  id                 uuid primary key default gen_random_uuid(),
  teacher_id         uuid not null references teacheri(id) on delete cascade,
  evaluator_id       uuid not null default auth.uid(),
  luna               smallint not null check (luna between 1 and 12),
  anul               smallint not null check (anul between 2020 and 2100),
  scor_punctualitate smallint check (scor_punctualitate between 1 and 5),
  scor_pregatire     smallint check (scor_pregatire between 1 and 5),
  scor_energie       smallint check (scor_energie between 1 and 5),
  scor_comunicare    smallint check (scor_comunicare between 1 and 5),
  scor_disciplina    smallint check (scor_disciplina between 1 and 5),
  scor_rezultate     smallint check (scor_rezultate between 1 and 5),
  feedback_cursanti  smallint check (feedback_cursanti between 1 and 5),
  observatii         text,
  created            timestamptz not null default now(),
  updated            timestamptz not null default now(),
  unique (teacher_id, luna, anul)
);

create index idx_evaluari_teacher_teacher on evaluari_teacher(teacher_id);

alter table evaluari_teacher enable row level security;

-- owner/admin: acces complet
create policy evaluari_teacher_admin_all on evaluari_teacher
  for all to authenticated
  using (is_admin()) with check (is_admin());

-- manager: select + insert + update + delete (NU există policy de select pentru
-- front_desk/teacher → ei nu văd evaluările deloc)
create policy evaluari_teacher_manager_select on evaluari_teacher
  for select to authenticated
  using (is_manager());

create policy evaluari_teacher_manager_insert on evaluari_teacher
  for insert to authenticated
  with check (is_manager());

create policy evaluari_teacher_manager_update on evaluari_teacher
  for update to authenticated
  using (is_manager()) with check (is_manager());

create policy evaluari_teacher_manager_delete on evaluari_teacher
  for delete to authenticated
  using (is_manager());
