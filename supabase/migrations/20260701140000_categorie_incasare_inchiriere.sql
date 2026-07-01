-- Închirieri săli (cursuri private) — categorie nouă de încasare.
-- ALTER TYPE ... ADD VALUE nu poate rula în aceeași tranzacție cu folosirea
-- valorii, deci stă singur în acest fișier (Postgres requirement). Se face push
-- înaintea migrațiilor care inserează cu 'Inchiriere'.
alter type categorie_incasare add value if not exists 'Inchiriere';
