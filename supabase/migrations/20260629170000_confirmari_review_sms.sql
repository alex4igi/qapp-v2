-- SMS-ul de review Google, trimis la conversia unui lead, cu fereastra de undo
-- de 5 minute (timp sa prinzi o conversie gresita inainte sa plece SMS-ul).
-- Flow (oglindit dupa confirmari_programare_sms, 20260625130000):
--   1) La conversie (lead → 'convertit'), frontend-ul cheama RPC-ul
--      enqueue_confirmare_review → upsert un rand aici (send_after = now()+5min).
--   2) Edge fn process-review-sms (cron ~1 min) dreneaza randurile scadente:
--      reciteste leadul; daca nu mai e 'convertit' → marcheaza 'anulat' (fara SMS),
--      altfel compune SMS-ul de review (link Google pe locatie) si il trimite;
--      dedup prin sms_logs (lead_id + tip='review').

create table if not exists confirmari_review_sms (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references leads(id) on delete cascade,
  status      text not null default 'programat',  -- programat | trimis | anulat | esuat
  send_after  timestamptz not null default now() + interval '5 minutes',
  error       text,
  trimis_la   timestamptz,
  created     timestamptz not null default now()
);

-- Un singur review per lead (anti dublu-submit + permite upsert pe re-conversie).
create unique index if not exists uq_confirmari_review_lead
  on confirmari_review_sms (lead_id);

-- Drenare eficienta: randuri scadente, neprocesate.
create index if not exists idx_confirmari_review_due
  on confirmari_review_sms (status, send_after);

alter table confirmari_review_sms enable row level security;

create policy confirmari_review_insert_staff
  on confirmari_review_sms for insert to authenticated
  with check (true);

create policy confirmari_review_select_staff
  on confirmari_review_sms for select to authenticated
  using (true);

-- RPC: programeaza/reseteaza review-ul (send_after = now()+5min). SECURITY DEFINER
-- ca sa poata face upsert indiferent de politici; rulat de staff autentificat.
create or replace function enqueue_confirmare_review(p_lead uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into confirmari_review_sms (lead_id, status, send_after, error, trimis_la)
  values (p_lead, 'programat', now() + interval '5 minutes', null, null)
  on conflict (lead_id) do update
    set status = 'programat',
        send_after = now() + interval '5 minutes',
        error = null,
        trimis_la = null;
$$;

grant execute on function enqueue_confirmare_review(uuid) to authenticated;
