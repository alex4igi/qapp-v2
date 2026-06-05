-- Workshop-uri ocazionale — categorie nouă de încasare.
-- ALTER TYPE ... ADD VALUE nu poate rula în aceeași tranzacție cu folosirea
-- valorii, deci stă singur în acest fișier (Postgres requirement).
alter type categorie_incasare add value if not exists 'Workshop';
