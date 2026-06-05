-- ============================================================
-- CLEANUP datele de test create prin seed_test_2sali.sql + seed_test_nicolina.sql
-- NU șterge sălile create manual de user (Sala A, Sala B la Ștefan cel Mare).
-- ============================================================
BEGIN;

-- Plăți tied de înrolările de test
DELETE FROM public.incasari
 WHERE inregistrare IN (SELECT id FROM public.enrollments WHERE cursul::text LIKE 'aaaaaaaa-000%');

-- Prezențe tied de înrolările de test
DELETE FROM public.prezente
 WHERE enrollment IN (SELECT id FROM public.enrollments WHERE cursul::text LIKE 'aaaaaaaa-000%');

-- Înrolările
DELETE FROM public.enrollments
 WHERE cursul::text LIKE 'aaaaaaaa-000%';

-- Cursurile
DELETE FROM public.cursuri
 WHERE id::text LIKE 'aaaaaaaa-000%';

-- Sala creată la Nicolina
DELETE FROM public.sali
 WHERE id::text LIKE 'aabbccdd-0002-%';

-- Clienții de test
DELETE FROM public.clienti
 WHERE id::text LIKE 'cccccccc-2541-%';

COMMIT;

-- Raport rapid de verificare (rulează separat dacă vrei):
-- SELECT 'cursuri'      AS t, count(*) FROM public.cursuri WHERE id::text LIKE 'aaaaaaaa-000%'
-- UNION ALL SELECT 'sali',     count(*) FROM public.sali  WHERE id::text LIKE 'aabbccdd-0002-%'
-- UNION ALL SELECT 'clienti',  count(*) FROM public.clienti WHERE id::text LIKE 'cccccccc-2541-%'
-- UNION ALL SELECT 'enrollments', count(*) FROM public.enrollments WHERE cursul::text LIKE 'aaaaaaaa-000%';
