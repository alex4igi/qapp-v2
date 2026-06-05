-- ============================================================
-- SEED TEMPORAR: 1 sală + 2 cursuri la Nicolina
-- Scop: a confirma că dashboard-ul filtrează după locația globală.
-- Reutilizează clienții TEST_2SALI deja creați (cccccccc-2541-...).
-- Cleanup: vezi blocul de la final (comentat).
-- ============================================================

BEGIN;

-- Locație Nicolina: 8dab1e53-7949-407d-9406-2b3366424a8a
-- Teacher Bianca David: 4b7aa069-415c-4c75-a9cc-73ec6ce314cc
-- Sezon 2025-2026: 6fe5bb4f-53f1-41af-bc80-e0b1e705291e

-- 1) 1 sală la Nicolina
INSERT INTO public.sali (id, nume, locatie, capacitate)
VALUES
  ('aabbccdd-0002-0000-0000-000000000001', 'TEST_2SALI Sala Mare', '8dab1e53-7949-407d-9406-2b3366424a8a', 20);

-- 2) 2 cursuri Marți la acea sală
INSERT INTO public.cursuri
  (id, numele, stil, nivelul, varsta, teacher, sala, sezon, facultativ,
   pret_lunar, capacitate_maxima, zile, ora, durata_cursului, suspendat)
VALUES
  ('aaaaaaaa-0002-0000-0000-000000000001', 'TEST_2SALI Hip-Hop Adults', 'Street Dance', 'Intermediar', 'Adults 25+',
   '4b7aa069-415c-4c75-a9cc-73ec6ce314cc', 'aabbccdd-0002-0000-0000-000000000001',
   '6fe5bb4f-53f1-41af-bc80-e0b1e705291e', false, 200, 16,
   ARRAY['Marti']::zi_saptamana[], '17:00', 60, false),

  ('aaaaaaaa-0002-0000-0000-000000000002', 'TEST_2SALI Acro Junior', 'Acrobatica', 'Incepator', 'Junior 7-10',
   '4b7aa069-415c-4c75-a9cc-73ec6ce314cc', 'aabbccdd-0002-0000-0000-000000000001',
   '6fe5bb4f-53f1-41af-bc80-e0b1e705291e', false, 170, 14,
   ARRAY['Marti']::zi_saptamana[], '18:30', 90, false);

-- 3) Enrollments (reutilizăm 6 cursanți existenți, 3/curs)
INSERT INTO public.enrollments
  (id, client, cursul, tip_plata, suma, suma_baza, politica_discount,
   data_incepere, data_final, activ, foloseste_pret_promo, retrogradat, reziliat)
VALUES
  -- Hip-Hop Adults (200 RON) — 3 cursanți
  ('eeeeeeee-2542-0001-0000-000000000001', 'cccccccc-2541-0000-0000-000000000001', 'aaaaaaaa-0002-0000-0000-000000000001', 'Per luna', 200, 200, 0, '2026-05-01', '2026-05-31', true, false, false, false),
  ('eeeeeeee-2542-0001-0000-000000000002', 'cccccccc-2541-0000-0000-000000000004', 'aaaaaaaa-0002-0000-0000-000000000001', 'Per luna', 200, 200, 0, '2026-05-01', '2026-05-31', true, false, false, false),
  ('eeeeeeee-2542-0001-0000-000000000003', 'cccccccc-2541-0000-0000-000000000008', 'aaaaaaaa-0002-0000-0000-000000000001', 'Per luna', 200, 200, 0, '2026-05-01', '2026-05-31', true, false, false, false),

  -- Acro Junior (170 RON) — 3 cursanți
  ('eeeeeeee-2542-0002-0000-000000000001', 'cccccccc-2541-0000-0000-000000000002', 'aaaaaaaa-0002-0000-0000-000000000002', 'Per luna', 170, 170, 0, '2026-05-01', '2026-05-31', true, false, false, false),
  ('eeeeeeee-2542-0002-0000-000000000002', 'cccccccc-2541-0000-0000-000000000006', 'aaaaaaaa-0002-0000-0000-000000000002', 'Per luna', 170, 170, 0, '2026-05-01', '2026-05-31', true, false, false, false),
  ('eeeeeeee-2542-0002-0000-000000000003', 'cccccccc-2541-0000-0000-000000000010', 'aaaaaaaa-0002-0000-0000-000000000002', 'Per luna', 170, 170, 0, '2026-05-01', '2026-05-31', true, false, false, false);

-- 4) Încasări mix
INSERT INTO public.incasari
  (inregistrare, client, data, suma, metoda, categorie, locatie, sezon)
VALUES
  -- Hip-Hop Adults
  ('eeeeeeee-2542-0001-0000-000000000001', 'cccccccc-2541-0000-0000-000000000001', '2026-05-19', 200, 'Card',     'Abonament', '8dab1e53-7949-407d-9406-2b3366424a8a', '6fe5bb4f-53f1-41af-bc80-e0b1e705291e'),
  ('eeeeeeee-2542-0001-0000-000000000002', 'cccccccc-2541-0000-0000-000000000004', '2026-05-08', 100, 'Cash',     'Abonament', '8dab1e53-7949-407d-9406-2b3366424a8a', '6fe5bb4f-53f1-41af-bc80-e0b1e705291e'), -- parțial (restanță 100)
  -- enr 03 → fără plată (restanță 200)

  -- Acro Junior
  ('eeeeeeee-2542-0002-0000-000000000001', 'cccccccc-2541-0000-0000-000000000002', '2026-05-19', 170, 'Transfer', 'Abonament', '8dab1e53-7949-407d-9406-2b3366424a8a', '6fe5bb4f-53f1-41af-bc80-e0b1e705291e');
  -- enr 02 și 03 → fără plată (restanță 170 fiecare)

COMMIT;

-- ============================================================
-- AȘTEPTAT (azi 2026-05-19, Marți):
--   Locație Nicolina → 2 cards (17:00 Hip-Hop Adults, 18:30 Acro Junior)
--                      Selector săli ASCUNS (doar 1 sală la Nicolina)
--                      Încasări azi: 200 + 170 = 370 RON (din cursuri Nicolina)
--   Locație Ștefan cel Mare → 4 cards TEST_2SALI (cele dinainte)
--                              Selector săli VIZIBIL (Sala A + Sala B)
-- ============================================================

-- ============================================================
-- CLEANUP:
-- BEGIN;
--   DELETE FROM public.incasari    WHERE inregistrare IN (SELECT id FROM public.enrollments WHERE cursul::text LIKE 'aaaaaaaa-0002-%');
--   DELETE FROM public.prezente    WHERE enrollment   IN (SELECT id FROM public.enrollments WHERE cursul::text LIKE 'aaaaaaaa-0002-%');
--   DELETE FROM public.enrollments WHERE cursul::text LIKE 'aaaaaaaa-0002-%';
--   DELETE FROM public.cursuri     WHERE id::text LIKE 'aaaaaaaa-0002-%';
--   DELETE FROM public.sali        WHERE id::text LIKE 'aabbccdd-0002-%';
-- COMMIT;
-- ============================================================
