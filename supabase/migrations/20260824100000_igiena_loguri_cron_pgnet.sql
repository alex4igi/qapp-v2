-- Igiena bazei. Pe 24 august 2026 baza ajunsese la 806 MB (limita free Supabase = 500 MB),
-- din care 622 MB erau loguri de sistem — de aproape 4x cât datele reale de business:
--
--   cron.job_run_details   432 MB / 263.910 rânduri, cel mai vechi din 28 mai
--   net._http_response     190 MB / doar 568 rânduri vii
--
-- pg_cron NU curăță niciodată singur `job_run_details`, iar 94% din rânduri vin de la cele
-- trei joburi care rulează în fiecare minut (process-programare-sms / -review-sms /
-- -sms-amanate) = 4.320 rânduri/zi. Fiecare rând stochează comanda completă, cu tot cu
-- headerele lui net.http_post, deci ~1,6 KB bucata.
--
-- pg_net își șterge răspunsurile după TTL, dar spațiul nu se întoarce la Postgres fără
-- VACUUM, iar autovacuum nu ținea pasul. Nu putem regla autovacuum pe tabel — e al lui
-- supabase_admin și ALTER dă 42501 — deci îl vacuumăm explicit, programat.
--
-- Fereastra de 7 zile trebuie să rămână sincronizată cu `p_days` din CronJobsSection.tsx,
-- altfel ecranul de monitorizare din Setări cere istoric care nu mai există.

select cron.unschedule('purge-cron-history')
  where exists (select 1 from cron.job where jobname = 'purge-cron-history');

select cron.schedule(
  'purge-cron-history',
  '0 3 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$
);

select cron.unschedule('vacuum-pgnet-responses')
  where exists (select 1 from cron.job where jobname = 'vacuum-pgnet-responses');

select cron.schedule(
  'vacuum-pgnet-responses',
  '10 3 * * *',
  $$vacuum full net._http_response$$
);
