-- Sursă nouă 'client' pentru facturile emise „la cerere" per client (worklist Clienți).
-- Migrație separată: valoarea nouă de enum nu poate fi folosită în DML în aceeași tranzacție.
alter type factura_fgo_sursa add value if not exists 'client';
