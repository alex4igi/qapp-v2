-- Conversii offline către Meta: îi spunem lui Facebook care lead a devenit elev.
--
-- Problema (audit 2026-09-03): Meta vede doar completarea formularului, pentru că
-- de la lead la înscriere trec în mediană 12 zile, iar fereastra lui de atribuire e
-- de 7. Din 15 conversii venite din reclame, 9 s-au produs după ce Meta încetase să
-- se uite. Deci algoritmul optimizează pentru completatori de formulare — singurul
-- rezultat pe care apucă să-l vadă. Singura cale de a-i arăta înscrierile e o
-- încărcare explicită de conversii, cu timpul REAL al evenimentului.
--
-- DECIZIE (Alex, 2026-09-03): se trimit DOAR conversiile de la lansare încolo.
-- Istoricul rămâne netrimis. De aceea pragul `p_from` e o CONSTANTĂ cu default în
-- semnătura funcției, nu o variabilă de mediu: un secret lipsă ar face trimiterea
-- retroactivă în tăcere, iar un default hardcodat nu poate aluneca. Ca să se schimbe
-- pragul, trebuie o migrație — adică o decizie vizibilă în istoric.

-- ============================================================
-- 1. Jurnalul trimiterilor — și gardul de idempotență
-- ============================================================
create table if not exists conversii_ads_trimise (
  id         uuid primary key default gen_random_uuid(),
  lead       uuid not null references leads(id) on delete cascade,
  platforma  text not null default 'meta',
  event_id   text not null,
  event_name text not null,
  valoare    numeric,
  moneda     text not null default 'RON',
  rezultat   text not null check (rezultat in ('trimis', 'esuat')),
  eroare     text,
  raspuns    jsonb,
  created    timestamptz not null default now()
);

comment on table conversii_ads_trimise is
  'Ce conversii s-au trimis către platformele de ads. Un rând per încercare; '
  'indexul unic lasă o singură trimitere REUȘITĂ per (lead, platformă) — '
  'reîncercările după eșec rămân permise.';

-- Idempotența e pe reușite: un eșec nu blochează reîncercarea, dar o reușită
-- blochează dublarea. Fără asta, o rulare de cron repetată ar raporta aceeași
-- înscriere de două ori și ar umfla rezultatele campaniei.
create unique index if not exists conversii_ads_trimise_unic_reusit
  on conversii_ads_trimise (lead, platforma)
  where rezultat = 'trimis';

create index if not exists conversii_ads_trimise_created_idx
  on conversii_ads_trimise (created desc);

alter table conversii_ads_trimise enable row level security;

drop policy if exists conversii_ads_trimise_select on conversii_ads_trimise;
create policy conversii_ads_trimise_select on conversii_ads_trimise
  for select to authenticated
  using (auth_role() in ('owner', 'admin', 'manager'));

-- Gard `parinte` (CLAUDE.md: obligatoriu la orice tabel nou).
drop policy if exists deny_parinte_direct on conversii_ads_trimise;
create policy deny_parinte_direct on conversii_ads_trimise
  as restrictive for all to authenticated
  using (auth_role() <> 'parinte') with check (auth_role() <> 'parinte');

-- Gard `marketing` — decizie EXPLICITĂ: deny total, nu read-only. Tabelul conține
-- `valoare` (venitul lunar per client convertit); agenția de ads n-are nevoie de
-- venitul pe client ca să-și facă treaba. Reconcilierea o vede prin
-- get_marketing_reconciliere, care e gated pe rol și nu expune sume.
drop policy if exists deny_marketing_direct on conversii_ads_trimise;
create policy deny_marketing_direct on conversii_ads_trimise
  as restrictive for all to authenticated
  using (auth_role() <> 'marketing') with check (auth_role() <> 'marketing');

-- ============================================================
-- 2. Cine se trimite
-- ============================================================
-- Regula stă în DB o singură dată (CLAUDE.md); edge function-ul doar apelează.
create or replace function conversii_ads_de_trimis(
  p_limit int  default 200,
  p_from  date default date '2026-09-03'   -- pragul „de acum înainte"; vezi antetul
)
returns table (
  lead_id        uuid,
  data_conversie timestamptz,
  telefon        text,
  email          text,
  valoare        numeric,
  platforma      text,
  campanie       text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    l.id,
    l.data_conversie,
    l.telefon,
    l.email,
    -- Valoarea lunară a înrolărilor active, nu valoarea pe viață: e proxy-ul
    -- conservator: nu presupunem câte luni rămâne elevul.
    coalesce((
      select sum(e.suma)
      from enrollments e
      where e.client = l.id_client
        and e.activ
        and not coalesce(e.reziliat, false)
    ), 0)::numeric,
    lower(coalesce(l.platform, l.utm_source, 'meta')),
    coalesce(l.utm_campaign, l.campaign_id)
  from leads l
  where l.data_conversie is not null
    and l.data_conversie >= p_from
    and l.id_client is not null
    -- Cine a cerut să nu fie contactat nu se trimite nici la Meta: opt-out-ul e
    -- despre prelucrarea datelor lui, nu doar despre canalul SMS.
    and coalesce(l.opt_out_marketing, false) = false
    -- Doar lead-uri atribuibile unei reclame plătite. Un walk-in trimis la Meta
    -- i-ar spune că reclama a produs ceva ce n-a produs.
    and (
      lower(coalesce(l.utm_source, '')) in ('meta', 'metayouplus', 'facebook', 'instagram')
      or l.utm_medium like 'lead_ads%'
      or l.utm_medium = 'paid'
    )
    and not exists (
      select 1 from conversii_ads_trimise t
      where t.lead = l.id and t.platforma = 'meta' and t.rezultat = 'trimis'
    )
  order by l.data_conversie
  limit greatest(1, least(p_limit, 1000));
$$;

-- CLAUDE.md: default privileges dau `anon` EXECUTE pe orice funcție nouă, iar
-- auth_role() cade pe front_desk fără rol ⇒ ar fi apelabilă cu cheia publică.
revoke execute on function conversii_ads_de_trimis(int, date) from anon, public;

-- ============================================================
-- 3. Cron zilnic — 04:15, după cronurile de noapte
-- ============================================================
create extension if not exists pg_net;

select cron.unschedule(jobid)
  from cron.job where jobname = 'push-meta-conversions';

select cron.schedule(
  'push-meta-conversions',
  '15 4 * * *',
  $$
  select net.http_post(
    url := 'https://cbftxkwvoboqahzsldcp.supabase.co/functions/v1/push-meta-conversions',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZnR4a3d2b2JvcWFoenNsZGNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MjA0MzYsImV4cCI6MjA5NDI5NjQzNn0.qmNmi-M0zOLWJ82Y9jFUDAJxLCfvJW0HV51ss6Pe59w',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZnR4a3d2b2JvcWFoenNsZGNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MjA0MzYsImV4cCI6MjA5NDI5NjQzNn0.qmNmi-M0zOLWJ82Y9jFUDAJxLCfvJW0HV51ss6Pe59w'
    ),
    body := '{}'::jsonb
  );
  $$
);
