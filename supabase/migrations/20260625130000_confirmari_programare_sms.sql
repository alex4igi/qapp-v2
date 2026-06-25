-- Confirmare programare lead prin SMS, cu fereastra de undo de 2 minute.
-- Flow:
--   1) La programarea unui lead (data + curs/eveniment), frontend-ul cheama RPC-ul
--      enqueue_confirmare_programare → upsert un rand aici (send_after = now()+2min).
--      Re-editarea in fereastra reseteaza send_after (timer-ul porneste din nou).
--   2) Edge fn process-programare-sms (cron ~1 min) dreneaza randurile scadente:
--      reciteste lead + ultima programare (deci ora e mereu la zi), compune mesajul
--      si il trimite; daca leadul nu mai e 'programat' → marcheaza 'anulat'.
-- Pattern oglindit dupa confirmari_inrolare_sms (20260621210000).

create table if not exists confirmari_programare_sms (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references leads(id) on delete cascade,
  status      text not null default 'programat',  -- programat | trimis | anulat | esuat
  send_after  timestamptz not null default now() + interval '2 minutes',
  error       text,
  trimis_la   timestamptz,
  created     timestamptz not null default now()
);

-- O singura confirmare per lead (anti dublu-submit + permite upsert pe re-editare).
create unique index if not exists uq_confirmari_programare_lead
  on confirmari_programare_sms (lead_id);

-- Drenare eficienta: randuri scadente, neprocesate.
create index if not exists idx_confirmari_programare_due
  on confirmari_programare_sms (status, send_after);

alter table confirmari_programare_sms enable row level security;

create policy confirmari_programare_insert_staff
  on confirmari_programare_sms for insert to authenticated
  with check (true);

create policy confirmari_programare_select_staff
  on confirmari_programare_sms for select to authenticated
  using (true);

-- RPC: programeaza/reseteaza confirmarea (send_after = now()+2min). SECURITY DEFINER
-- ca sa poata face upsert indiferent de politici; rulat de staff autentificat.
create or replace function enqueue_confirmare_programare(p_lead uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into confirmari_programare_sms (lead_id, status, send_after, error, trimis_la)
  values (p_lead, 'programat', now() + interval '2 minutes', null, null)
  on conflict (lead_id) do update
    set status = 'programat',
        send_after = now() + interval '2 minutes',
        error = null,
        trimis_la = null;
$$;

grant execute on function enqueue_confirmare_programare(uuid) to authenticated;
