-- ============================================================
-- SEED TEMPORAR: 2 săli (Sala A + Sala B) la Ștefan cel Mare
-- Scop: testare dashboard cu 2 săli/locație, cursuri pentru Marți (azi 2026-05-19),
-- cursanți cu mix de plăți (integrale / parțiale / neplătite).
-- Toate înregistrările au marcaj 'TEST_2SALI' pentru cleanup ușor.
-- Cleanup: vezi blocul de la final (comentat).
-- ============================================================

BEGIN;

-- IDs cunoscute (din DB remote)
-- Locație Ștefan cel Mare : 4cc39dcb-3f6d-4ef0-aac4-a5ece1ccb7a1
-- Sala A                  : 1e809847-e2f6-4cb9-836c-5c5bfef17ab1
-- Sala B                  : 931eaa15-f0c7-44b1-92f0-7448543dd208
-- Teacher Bianca David    : 4b7aa069-415c-4c75-a9cc-73ec6ce314cc
-- Sezon 2025-2026         : 6fe5bb4f-53f1-41af-bc80-e0b1e705291e

-- ------------------------------------------------------------
-- 1) 4 cursuri (2/sală) — toate Marți, sezon curent
-- ------------------------------------------------------------
INSERT INTO public.cursuri
  (id, numele, stil, nivelul, varsta, teacher, sala, sezon, facultativ,
   pret_lunar, capacitate_maxima, zile, ora, durata_cursului, suspendat)
VALUES
  ('aaaaaaaa-0001-0000-0000-000000000001', 'TEST_2SALI Street Junior', 'Street Dance', 'Incepator', 'Junior 7-10',
   '4b7aa069-415c-4c75-a9cc-73ec6ce314cc', '1e809847-e2f6-4cb9-836c-5c5bfef17ab1',
   '6fe5bb4f-53f1-41af-bc80-e0b1e705291e', false, 170, 16,
   ARRAY['Marti']::zi_saptamana[], '16:30', 60, false),

  ('aaaaaaaa-0001-0000-0000-000000000003', 'TEST_2SALI K-pop Teens', 'K-pop Covers', 'Intermediar', 'Teens 15-20',
   '4b7aa069-415c-4c75-a9cc-73ec6ce314cc', '931eaa15-f0c7-44b1-92f0-7448543dd208',
   '6fe5bb4f-53f1-41af-bc80-e0b1e705291e', false, 170, 16,
   ARRAY['Marti']::zi_saptamana[], '17:30', 60, false),

  ('aaaaaaaa-0001-0000-0000-000000000002', 'TEST_2SALI Acro Varsity', 'Acrobatica', 'Intermediar', 'Varsity 11-15',
   '4b7aa069-415c-4c75-a9cc-73ec6ce314cc', '1e809847-e2f6-4cb9-836c-5c5bfef17ab1',
   '6fe5bb4f-53f1-41af-bc80-e0b1e705291e', false, 200, 14,
   ARRAY['Marti']::zi_saptamana[], '18:30', 90, false),

  ('aaaaaaaa-0001-0000-0000-000000000004', 'TEST_2SALI Street Adults', 'Street Dance', 'Avansat', 'Adults 25+',
   '4b7aa069-415c-4c75-a9cc-73ec6ce314cc', '931eaa15-f0c7-44b1-92f0-7448543dd208',
   '6fe5bb4f-53f1-41af-bc80-e0b1e705291e', false, 200, 12,
   ARRAY['Marti']::zi_saptamana[], '19:30', 90, false);

-- ------------------------------------------------------------
-- 2) 10 clienți de test (status Activ)
-- ------------------------------------------------------------
INSERT INTO public.clienti (id, nume, prenume, telefon, status) VALUES
  ('cccccccc-2541-0000-0000-000000000001', 'TEST_2SALI Popescu',  'Andrei',   '0700000001', 'Activ'),
  ('cccccccc-2541-0000-0000-000000000002', 'TEST_2SALI Ionescu',  'Maria',    '0700000002', 'Activ'),
  ('cccccccc-2541-0000-0000-000000000003', 'TEST_2SALI Constantin','Ion',     '0700000003', 'Activ'),
  ('cccccccc-2541-0000-0000-000000000004', 'TEST_2SALI Dumitrescu','Elena',   '0700000004', 'Activ'),
  ('cccccccc-2541-0000-0000-000000000005', 'TEST_2SALI Stoica',   'Mihai',    '0700000005', 'Activ'),
  ('cccccccc-2541-0000-0000-000000000006', 'TEST_2SALI Marin',    'Ana',      '0700000006', 'Activ'),
  ('cccccccc-2541-0000-0000-000000000007', 'TEST_2SALI Radu',     'Cristian', '0700000007', 'Activ'),
  ('cccccccc-2541-0000-0000-000000000008', 'TEST_2SALI Tudor',    'Sofia',    '0700000008', 'Activ'),
  ('cccccccc-2541-0000-0000-000000000009', 'TEST_2SALI Niculescu','Vlad',     '0700000009', 'Activ'),
  ('cccccccc-2541-0000-0000-000000000010', 'TEST_2SALI Gheorghiu','Diana',    '0700000010', 'Activ');

-- ------------------------------------------------------------
-- 3) Enrollments — luna mai 2026, tip Per luna, activ
--    Distribuție:
--      Sala A 17:00 (Street Junior, 170 RON) → 5 cursanți
--      Sala A 18:30 (Acro Varsity, 200 RON)  → 4 cursanți
--      Sala B 17:00 (K-pop Teens, 170 RON)   → 6 cursanți
--      Sala B 18:30 (Street Adults, 200 RON) → 4 cursanți
-- ------------------------------------------------------------
INSERT INTO public.enrollments
  (id, client, cursul, tip_plata, suma, suma_baza, politica_discount,
   data_incepere, data_final, activ, foloseste_pret_promo, retrogradat, reziliat)
VALUES
  -- Sala A 17:00 — Street Junior
  ('eeeeeeee-2541-0001-0000-000000000001', 'cccccccc-2541-0000-0000-000000000001', 'aaaaaaaa-0001-0000-0000-000000000001', 'Per luna', 170, 170, 0, '2026-05-01', '2026-05-31', true, false, false, false),
  ('eeeeeeee-2541-0001-0000-000000000002', 'cccccccc-2541-0000-0000-000000000002', 'aaaaaaaa-0001-0000-0000-000000000001', 'Per luna', 170, 170, 0, '2026-05-01', '2026-05-31', true, false, false, false),
  ('eeeeeeee-2541-0001-0000-000000000003', 'cccccccc-2541-0000-0000-000000000003', 'aaaaaaaa-0001-0000-0000-000000000001', 'Per luna', 170, 170, 0, '2026-05-01', '2026-05-31', true, false, false, false),
  ('eeeeeeee-2541-0001-0000-000000000004', 'cccccccc-2541-0000-0000-000000000004', 'aaaaaaaa-0001-0000-0000-000000000001', 'Per luna', 170, 170, 0, '2026-05-01', '2026-05-31', true, false, false, false),
  ('eeeeeeee-2541-0001-0000-000000000005', 'cccccccc-2541-0000-0000-000000000005', 'aaaaaaaa-0001-0000-0000-000000000001', 'Per luna', 170, 170, 0, '2026-05-01', '2026-05-31', true, false, false, false),

  -- Sala A 18:30 — Acro Varsity
  ('eeeeeeee-2541-0002-0000-000000000001', 'cccccccc-2541-0000-0000-000000000006', 'aaaaaaaa-0001-0000-0000-000000000002', 'Per luna', 200, 200, 0, '2026-05-01', '2026-05-31', true, false, false, false),
  ('eeeeeeee-2541-0002-0000-000000000002', 'cccccccc-2541-0000-0000-000000000007', 'aaaaaaaa-0001-0000-0000-000000000002', 'Per luna', 200, 200, 0, '2026-05-01', '2026-05-31', true, false, false, false),
  ('eeeeeeee-2541-0002-0000-000000000003', 'cccccccc-2541-0000-0000-000000000008', 'aaaaaaaa-0001-0000-0000-000000000002', 'Per luna', 200, 200, 0, '2026-05-01', '2026-05-31', true, false, false, false),
  ('eeeeeeee-2541-0002-0000-000000000004', 'cccccccc-2541-0000-0000-000000000009', 'aaaaaaaa-0001-0000-0000-000000000002', 'Per luna', 200, 200, 0, '2026-05-01', '2026-05-31', true, false, false, false),

  -- Sala B 17:00 — K-pop Teens (reutilizăm cursanți pe altă grupă)
  ('eeeeeeee-2541-0003-0000-000000000001', 'cccccccc-2541-0000-0000-000000000001', 'aaaaaaaa-0001-0000-0000-000000000003', 'Per luna', 170, 170, 0, '2026-05-01', '2026-05-31', true, false, false, false),
  ('eeeeeeee-2541-0003-0000-000000000002', 'cccccccc-2541-0000-0000-000000000002', 'aaaaaaaa-0001-0000-0000-000000000003', 'Per luna', 170, 170, 0, '2026-05-01', '2026-05-31', true, false, false, false),
  ('eeeeeeee-2541-0003-0000-000000000003', 'cccccccc-2541-0000-0000-000000000006', 'aaaaaaaa-0001-0000-0000-000000000003', 'Per luna', 170, 170, 0, '2026-05-01', '2026-05-31', true, false, false, false),
  ('eeeeeeee-2541-0003-0000-000000000004', 'cccccccc-2541-0000-0000-000000000007', 'aaaaaaaa-0001-0000-0000-000000000003', 'Per luna', 170, 170, 0, '2026-05-01', '2026-05-31', true, false, false, false),
  ('eeeeeeee-2541-0003-0000-000000000005', 'cccccccc-2541-0000-0000-000000000010', 'aaaaaaaa-0001-0000-0000-000000000003', 'Per luna', 170, 170, 0, '2026-05-01', '2026-05-31', true, false, false, false),
  ('eeeeeeee-2541-0003-0000-000000000006', 'cccccccc-2541-0000-0000-000000000008', 'aaaaaaaa-0001-0000-0000-000000000003', 'Per luna', 170, 170, 0, '2026-05-01', '2026-05-31', true, false, false, false),

  -- Sala B 18:30 — Street Adults
  ('eeeeeeee-2541-0004-0000-000000000001', 'cccccccc-2541-0000-0000-000000000005', 'aaaaaaaa-0001-0000-0000-000000000004', 'Per luna', 200, 200, 0, '2026-05-01', '2026-05-31', true, false, false, false),
  ('eeeeeeee-2541-0004-0000-000000000002', 'cccccccc-2541-0000-0000-000000000009', 'aaaaaaaa-0001-0000-0000-000000000004', 'Per luna', 200, 200, 0, '2026-05-01', '2026-05-31', true, false, false, false),
  ('eeeeeeee-2541-0004-0000-000000000003', 'cccccccc-2541-0000-0000-000000000010', 'aaaaaaaa-0001-0000-0000-000000000004', 'Per luna', 200, 200, 0, '2026-05-01', '2026-05-31', true, false, false, false),
  ('eeeeeeee-2541-0004-0000-000000000004', 'cccccccc-2541-0000-0000-000000000003', 'aaaaaaaa-0001-0000-0000-000000000004', 'Per luna', 200, 200, 0, '2026-05-01', '2026-05-31', true, false, false, false);

-- ------------------------------------------------------------
-- 4) Încasări — mix pentru a vedea: KPI „Încasări azi" + restanțe
--    - Plăți cu data=2026-05-19 (AZI) → contează la KPI „Încasări azi"
--    - Plăți cu dată anterioară (8 mai)  → nu apar la KPI azi, dar reduc restanța
--    - Enrollment-uri fără plată → restanță 100%
-- ------------------------------------------------------------
INSERT INTO public.incasari
  (inregistrare, client, data, suma, metoda, categorie, locatie, sezon)
VALUES
  -- Sala A 17:00 — Street Junior (5 enr; 170 RON)
  ('eeeeeeee-2541-0001-0000-000000000001', 'cccccccc-2541-0000-0000-000000000001', '2026-05-19', 170, 'Card',     'Abonament', '4cc39dcb-3f6d-4ef0-aac4-a5ece1ccb7a1', '6fe5bb4f-53f1-41af-bc80-e0b1e705291e'), -- integral azi
  ('eeeeeeee-2541-0001-0000-000000000002', 'cccccccc-2541-0000-0000-000000000002', '2026-05-19',  80, 'Cash',     'Abonament', '4cc39dcb-3f6d-4ef0-aac4-a5ece1ccb7a1', '6fe5bb4f-53f1-41af-bc80-e0b1e705291e'), -- parțial azi (restanță 90)
  ('eeeeeeee-2541-0001-0000-000000000003', 'cccccccc-2541-0000-0000-000000000003', '2026-05-08', 170, 'Transfer', 'Abonament', '4cc39dcb-3f6d-4ef0-aac4-a5ece1ccb7a1', '6fe5bb4f-53f1-41af-bc80-e0b1e705291e'), -- integral data anterioară
  -- enr 04 și 05 → fără plată (restanță 170 fiecare)

  -- Sala A 18:30 — Acro Varsity (4 enr; 200 RON)
  ('eeeeeeee-2541-0002-0000-000000000001', 'cccccccc-2541-0000-0000-000000000006', '2026-05-19', 200, 'Revolut',  'Abonament', '4cc39dcb-3f6d-4ef0-aac4-a5ece1ccb7a1', '6fe5bb4f-53f1-41af-bc80-e0b1e705291e'),
  ('eeeeeeee-2541-0002-0000-000000000002', 'cccccccc-2541-0000-0000-000000000007', '2026-05-08', 100, 'Cash',     'Abonament', '4cc39dcb-3f6d-4ef0-aac4-a5ece1ccb7a1', '6fe5bb4f-53f1-41af-bc80-e0b1e705291e'), -- parțial (restanță 100)
  -- enr 03 și 04 → fără plată (restanță 200 fiecare)

  -- Sala B 17:00 — K-pop Teens (6 enr; 170 RON)
  ('eeeeeeee-2541-0003-0000-000000000001', 'cccccccc-2541-0000-0000-000000000001', '2026-05-19', 170, 'Card',     'Abonament', '4cc39dcb-3f6d-4ef0-aac4-a5ece1ccb7a1', '6fe5bb4f-53f1-41af-bc80-e0b1e705291e'),
  ('eeeeeeee-2541-0003-0000-000000000002', 'cccccccc-2541-0000-0000-000000000002', '2026-05-19', 170, 'Card',     'Abonament', '4cc39dcb-3f6d-4ef0-aac4-a5ece1ccb7a1', '6fe5bb4f-53f1-41af-bc80-e0b1e705291e'),
  ('eeeeeeee-2541-0003-0000-000000000004', 'cccccccc-2541-0000-0000-000000000007', '2026-05-08',  70, 'Cash',     'Abonament', '4cc39dcb-3f6d-4ef0-aac4-a5ece1ccb7a1', '6fe5bb4f-53f1-41af-bc80-e0b1e705291e'), -- parțial (restanță 100)
  -- enr 03, 05, 06 → fără plată (restanță 170 fiecare)

  -- Sala B 18:30 — Street Adults (4 enr; 200 RON)
  ('eeeeeeee-2541-0004-0000-000000000001', 'cccccccc-2541-0000-0000-000000000005', '2026-05-19', 200, 'Transfer', 'Abonament', '4cc39dcb-3f6d-4ef0-aac4-a5ece1ccb7a1', '6fe5bb4f-53f1-41af-bc80-e0b1e705291e'),
  ('eeeeeeee-2541-0004-0000-000000000003', 'cccccccc-2541-0000-0000-000000000010', '2026-05-19', 120, 'Cash',     'Abonament', '4cc39dcb-3f6d-4ef0-aac4-a5ece1ccb7a1', '6fe5bb4f-53f1-41af-bc80-e0b1e705291e'); -- parțial (restanță 80)
  -- enr 02 și 04 → fără plată (restanță 200 fiecare)

COMMIT;

-- ============================================================
-- REZUMAT AȘTEPTAT PE DASHBOARD (azi 2026-05-19, Marți):
--   KPI „Încasări azi" = 170+80+200+170+170+200+120 = 1110 RON
--   4 carduri cursuri (toate sălile): 2 la 17:00, 2 la 18:30
--   Cu filtrul „Sala A" → vezi doar Street Junior + Acro Varsity
--   Cu filtrul „Sala B" → vezi doar K-pop Teens + Street Adults
--   Chart restanțe (cumulativ pe înrolări active):
--     Street Junior  : 90 + 170 + 170 = 430 restanță; încasări 420
--     Acro Varsity   : 100 + 200 + 200 = 500 restanță; încasări 300
--     K-pop Teens    : 100 + 170 + 170 + 170 = 610 restanță; încasări 410
--     Street Adults  : 200 + 80 + 200 = 480 restanță; încasări 320
-- ============================================================

-- ============================================================
-- CLEANUP (rulează manual când vrei să ștergi datele de test):
--
-- BEGIN;
--   DELETE FROM public.incasari      WHERE inregistrare IN (SELECT id FROM public.enrollments WHERE cursul::text LIKE 'aaaaaaaa-0001-%');
--   DELETE FROM public.prezente      WHERE enrollment   IN (SELECT id FROM public.enrollments WHERE cursul::text LIKE 'aaaaaaaa-0001-%');
--   DELETE FROM public.enrollments   WHERE cursul::text LIKE 'aaaaaaaa-0001-%';
--   DELETE FROM public.cursuri       WHERE id::text LIKE 'aaaaaaaa-0001-%';
--   DELETE FROM public.clienti       WHERE id::text LIKE 'cccccccc-2541-%';
-- COMMIT;
-- ============================================================
