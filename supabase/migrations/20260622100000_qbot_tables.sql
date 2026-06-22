-- Q-bot — tabele: qbot_kb (bază de cunoștințe editabilă) + chat_logs (audit).
-- RBAC: qbot_kb SELECT pt orice autentificat (staff + parinte); scriere doar manager+.
--       chat_logs SELECT owner/admin (tot) sau user (propriile); INSERT doar service-role (funcția).

create table if not exists qbot_kb (
  id uuid primary key default gen_random_uuid(),
  audienta text not null check (audienta in ('staff','membri','ambele')),
  categorie text not null check (categorie in ('workflow','politica','contract','glosar')),
  titlu text not null,
  continut text not null,
  rol_necesar text check (rol_necesar in ('owner','admin','manager','teacher','front_desk')),
  pagina text,
  activ boolean not null default true,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  unique (audienta, titlu)
);

create index if not exists qbot_kb_audienta_activ_idx on qbot_kb (audienta, activ);

alter table qbot_kb enable row level security;

drop policy if exists qbot_kb_select on qbot_kb;
create policy qbot_kb_select on qbot_kb
  for select to authenticated
  using (true);

drop policy if exists qbot_kb_write on qbot_kb;
create policy qbot_kb_write on qbot_kb
  for all to authenticated
  using (auth_role() in ('owner','admin','manager'))
  with check (auth_role() in ('owner','admin','manager'));

create table if not exists chat_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role text not null,
  audienta text not null,
  locatie_id uuid,
  question text not null,
  answer text,
  tools_used text[],
  created_at timestamptz not null default now()
);

create index if not exists chat_logs_created_idx on chat_logs (created_at desc);

alter table chat_logs enable row level security;

-- Citire: owner/admin văd tot; restul doar propriile rânduri. INSERT se face cu service-role
-- (din edge function), care ocolește RLS — deci nu definim policy de insert.
drop policy if exists chat_logs_select on chat_logs;
create policy chat_logs_select on chat_logs
  for select to authenticated
  using (auth_role() in ('owner','admin') or user_id = auth.uid());
