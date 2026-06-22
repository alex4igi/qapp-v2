-- Metodă de plată „Online" — distinge plățile prin procesatorul Netopia de cardul de la POS.
-- Trebuie singură în fișierul ei: ALTER TYPE ADD VALUE nu poate fi folosit ca literal în
-- aceeași tranzacție în care e adăugat (recrearea funcției confirm_netopia_payment vine în
-- migrația următoare, care doar definește text SQL, fără să-l execute).
alter type metoda_plata add value if not exists 'Online';
