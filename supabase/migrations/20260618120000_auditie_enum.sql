-- Audiții catalogate ca evenimente (decizie business): un nou tip de eveniment
-- și o categorie de încasare dedicată, simetric cu Workshop.
-- ALTER TYPE ... ADD VALUE rulează în afara unei tranzacții și nu poate fi
-- folosit în aceeași migrație — îl adăugăm doar; folosirea vine din cod.
ALTER TYPE tip_eveniment ADD VALUE IF NOT EXISTS 'Auditie';
ALTER TYPE categorie_incasare ADD VALUE IF NOT EXISTS 'Auditie';
