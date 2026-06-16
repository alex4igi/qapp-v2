-- Portal membri — PLĂȚI ONLINE Netopia (Payments API v2).
-- Tabel de comenzi online: sursa de adevăr a sumei + idempotența webhook-ului.
-- O tranzacție Netopia confirmată => exact un set de rânduri `incasari` (vezi
-- confirm_netopia_payment în migrația _netopia_rpc). Clientul NU inserează în
-- `incasari` și NU calculează singur cât datorează — totul server-side.

create table if not exists netopia_orders (
  id uuid primary key default gen_random_uuid(),
  order_ref text unique not null,                 -- referința trimisă la Netopia (o generăm noi)
  client_id uuid not null references clienti(id),  -- membrul plătit
  auth_user_id uuid not null,                      -- cine a inițiat (audit / izolare)
  amount numeric not null,                         -- suma recalculată server-side la intent
  fifo_plan jsonb not null,                        -- [{enrollment_id, pay}] — snapshot auditabil
  status text not null default 'pending'           -- pending | confirmed | failed | canceled
    check (status in ('pending', 'confirmed', 'failed', 'canceled')),
  netopia_transaction_id text unique,              -- dedup webhook
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);

create index if not exists netopia_orders_client_idx on netopia_orders(client_id);

-- RLS: staff (PostgREST) poate citi; `parinte` NU atinge tabelul direct.
-- Edge functions folosesc service_role (bypass RLS); RPC-urile sunt SECURITY DEFINER.
-- Gardul `deny_parinte_direct` din _portal_membri_foundation acoperă doar tabelele
-- existente la acel moment => îl aplicăm MANUAL aici (invariant documentat în ARCHITECTURE.md).
alter table netopia_orders enable row level security;

drop policy if exists netopia_orders_all on netopia_orders;
create policy netopia_orders_all on netopia_orders for all to authenticated using (true) with check (true);

drop policy if exists deny_parinte_direct on netopia_orders;
create policy deny_parinte_direct on netopia_orders as restrictive for all to authenticated
  using (auth_role() <> 'parinte') with check (auth_role() <> 'parinte');
