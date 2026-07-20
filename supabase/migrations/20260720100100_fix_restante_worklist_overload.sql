-- Fix migrația precedentă (20260720100000): CREATE OR REPLACE cu un parametru nou
-- (p_luna) nu înlocuiește funcția existentă în Postgres — creează un OVERLOAD nou,
-- pentru că semnătura de tipuri (uuid,uuid) diferă de (uuid,uuid,date). Rezultat:
-- get_restante_worklist(p_locatie, p_sezon) devenea ambiguă între cele două funcții
-- ("Could not choose the best candidate function"), depistat imediat la smoke-test.
-- Ștergem overload-ul vechi (2 argumente) — rămâne doar versiunea cu p_luna.

drop function if exists get_restante_worklist(uuid, uuid);
