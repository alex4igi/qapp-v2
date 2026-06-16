-- TEMPORAR (diagnostic) — captează IPN-urile brute de la Netopia ca să verificăm
-- dacă sosesc și de ce eventual eșuează verificarea semnăturii. De șters după debug.
create table if not exists netopia_ipn_debug (
  id uuid primary key default gen_random_uuid(),
  headers jsonb,
  body text,
  verified boolean,
  created timestamptz not null default now()
);
alter table netopia_ipn_debug enable row level security;
-- doar service_role (edge function) scrie; nimeni altcineva
drop policy if exists deny_parinte_direct on netopia_ipn_debug;
create policy deny_parinte_direct on netopia_ipn_debug as restrictive for all to authenticated
  using (auth_role() <> 'parinte') with check (auth_role() <> 'parinte');
