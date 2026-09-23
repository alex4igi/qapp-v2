-- `netopia_orders.ntp_id` — identificatorul Netopia al tranzacției, știut din clipa în care
-- pornește plata (răspunsul lui `/payment/card/start`).
--
-- De ce: reconcilierea comenzilor rămase în așteptare (audit 2026-09-20, 4.2) trebuie să
-- întrebe Netopia ce s-a întâmplat. Singurul endpoint de stare, `/operation/status`, cere
-- `ntpID`: cu `orderID` singur răspunde „error 99: Invalid ntpID" (verificat pe 2026-09-23,
-- cu API-ul de producție). `netopia_transaction_id` NU ține locul: se scrie abia la
-- confirmare, adică exact în cazul care nu are nevoie de reconciliere.
--
-- Comenzile de dinainte de migrație rămân fără `ntp_id` — pentru ele starea se verifică
-- manual în panoul Netopia.
alter table public.netopia_orders add column if not exists ntp_id text;

comment on column public.netopia_orders.ntp_id is
  'ID-ul tranzacției la Netopia, salvat la pornirea plății. Cheia de interogare pentru /operation/status (reconciliere).';

create index if not exists netopia_orders_ntp_id_idx on public.netopia_orders (ntp_id)
  where ntp_id is not null;
