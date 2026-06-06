-- Qapp v2 — Anunțuri (announcements): broadcast staff (in-app) + fundație clienți.
--
-- Două canale:
--   * 'staff'  → livrare prin `notifications` (🔔); read receipts în anunturi_destinatari.
--   * 'client' → DOAR fundație (fără UI): mesaj stocat per client pentru viitorul portal
--                de membru. Fără SMS/email/cost/opt-out.
--
-- De ce read-receipt separat de notifications.read_at: userii își pot șterge propriile
-- notificări (notifications_self_delete) → ar corupe statistica „citit de X/Y".

-- ============================================================
-- 1) Tabele
-- ============================================================
create table anunturi (
  id                uuid primary key default gen_random_uuid(),
  expeditor_user_id uuid references auth.users(id) on delete set null,
  expeditor_email   text,
  canal             text not null check (canal in ('staff', 'client')),
  titlu             text not null,
  continut          text not null,
  audienta          jsonb,
  nr_destinatari    integer not null default 0,
  created           timestamptz not null default now()
);
create index idx_anunturi_expeditor on anunturi(expeditor_user_id);
create index idx_anunturi_created   on anunturi(created desc);

create table anunturi_destinatari (
  anunt_id          uuid not null references anunturi(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  read_at           timestamptz,
  primary key (anunt_id, recipient_user_id)
);
create index idx_anunturi_dest_recipient on anunturi_destinatari(recipient_user_id);

create table anunturi_clienti (
  anunt_id  uuid not null references anunturi(id) on delete cascade,
  client_id uuid not null references clienti(id) on delete cascade,
  read_at   timestamptz,   -- null până când clientul îl citește în portal (viitor)
  primary key (anunt_id, client_id)
);
create index idx_anunturi_clienti_client on anunturi_clienti(client_id);

-- ============================================================
-- 2) RLS
-- ============================================================
alter table anunturi enable row level security;
alter table anunturi_destinatari enable row level security;
alter table anunturi_clienti enable row level security;

-- anunturi: expeditor + admin/owner + destinatar staff. INSERT/UPDATE doar prin RPC
-- (SECURITY DEFINER bypass RLS). DELETE pentru expeditor/admin (cleanup).
create policy anunturi_select on anunturi
  for select to authenticated using (
    expeditor_user_id = auth.uid()
    or is_admin()
    or exists (
      select 1 from anunturi_destinatari d
      where d.anunt_id = anunturi.id and d.recipient_user_id = auth.uid()
    )
  );

create policy anunturi_delete on anunturi
  for delete to authenticated
  using (expeditor_user_id = auth.uid() or is_admin());

-- anunturi_destinatari: recipient vede/marchează rândul propriu; expeditorul/adminul
-- văd rândurile mesajelor proprii (read receipts).
create policy anunturi_dest_select on anunturi_destinatari
  for select to authenticated using (
    recipient_user_id = auth.uid()
    or is_admin()
    or exists (
      select 1 from anunturi a
      where a.id = anunturi_destinatari.anunt_id and a.expeditor_user_id = auth.uid()
    )
  );

create policy anunturi_dest_update on anunturi_destinatari
  for update to authenticated
  using (recipient_user_id = auth.uid())
  with check (recipient_user_id = auth.uid());

-- anunturi_clienti: expeditor + admin acum. Policy pentru client se adaugă când există portalul.
create policy anunturi_clienti_select on anunturi_clienti
  for select to authenticated using (
    is_admin()
    or exists (
      select 1 from anunturi a
      where a.id = anunturi_clienti.anunt_id and a.expeditor_user_id = auth.uid()
    )
  );
