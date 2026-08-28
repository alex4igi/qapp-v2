-- Clasele demonstrative din campaniile de recrutare („Back to Dance School") sunt
-- evenimente cu tip propriu: au dată+oră+locație și primesc lead-uri programate,
-- dar nu sunt spectacole și nu se vând bilete pe ele.
-- ALTER TYPE ... ADD VALUE rulează în afara unei tranzacții și nu poate fi folosit
-- în aceeași migrație — îl adăugăm doar; folosirea vine din cod.
ALTER TYPE tip_eveniment ADD VALUE IF NOT EXISTS 'DEMO Class';
