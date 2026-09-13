-- Închide gaura „cron-uri apelabile public": toate edge functions de cron răspundeau
-- HTTP 200 la un POST fără niciun header (verificat cu curl 2026-09-08), fiindcă garda
-- din cod era condiționată de existența secretului — iar secretul nu era setat.
--
-- Aici se face jumătatea de DB: fiecare apel programat trimite `Authorization: Bearer
-- <secret>`. Secretul NU stă în migrație (ar ajunge în git): stă în Vault, sub numele
-- `cron_secret`, și se citește la fiecare rulare prin `cron_call_headers()`.
--
-- Ordinea de aplicare care nu rupe nimic: (1) migrația asta, (2) `supabase secrets set
-- CRON_SECRET=…` cu ACEEAȘI valoare, (3) redeploy la funcții cu garda necondiționată.
-- Între (1) și (2) funcțiile vechi ignoră headerul; între (2) și (3) garda veche cere
-- exact headerul pe care migrația îl trimite deja. Zero fereastră fără cron-uri.

create or replace function cron_call_headers()
returns jsonb
language sql
stable
security definer
set search_path = public, vault
as $$
  select jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || coalesce(
      (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'), '')
  );
$$;

comment on function cron_call_headers() is
  'Headerele cu care pg_cron cheamă edge functions: secretul partajat din Vault (`cron_secret`). Doar postgres/service_role — oricine altcineva l-ar putea citi apelând funcția.';

revoke execute on function cron_call_headers() from anon, public, authenticated;
grant execute on function cron_call_headers() to postgres, service_role;

-- ── Cele 7 apeluri programate, rescrise cu header de autentificare ────────────────
do $do$
declare
  j record;
  v_url text;
begin
  for j in
    select * from (values
      ('qapp-cron-morning-a',        '0 7 * * *',     'cron-morning'),
      ('qapp-cron-morning-b',        '0 8 * * *',     'cron-morning'),
      ('qapp-cron-evening',          '30 21 * * *',   'cron-evening'),
      ('qapp-cron-season-end',       '0 22 * * *',    'cron-season-end'),
      ('process-contract-reminders', '0 9 * * *',     'process-contract-reminders'),
      ('pull-meta-leads',            '*/15 * * * *',  'pull-meta-leads'),
      ('push-meta-conversions',      '15 4 * * *',    'push-meta-conversions')
    ) as t(jobname, schedule, fn)
  loop
    v_url := 'https://cbftxkwvoboqahzsldcp.supabase.co/functions/v1/' || j.fn;
    perform cron.schedule(
      j.jobname,
      j.schedule,
      format(
        $cmd$select net.http_post(url := %L, headers := cron_call_headers(), body := '{}'::jsonb);$cmd$,
        v_url
      )
    );
  end loop;
end
$do$;

-- ── Coada de SMS-uri (rulează în fiecare minut) cheamă tot edge functions ─────────
create or replace function proceseaza_cozi_sms()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hdr jsonb := cron_call_headers();
  v_fn  text;
begin
  foreach v_fn in array array['process-programare-sms', 'process-review-sms', 'process-sms-amanate']
  loop
    perform net.http_post(
      url     := 'https://cbftxkwvoboqahzsldcp.supabase.co/functions/v1/' || v_fn,
      headers := v_hdr,
      body    := '{}'::jsonb
    );
  end loop;
end;
$$;

revoke execute on function proceseaza_cozi_sms() from anon, public, authenticated;
grant execute on function proceseaza_cozi_sms() to postgres, service_role;
