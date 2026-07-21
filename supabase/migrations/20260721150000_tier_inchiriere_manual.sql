-- Tip nou de tarif pentru închirieri: 'manual' — preț liber pentru proiecte
-- speciale, stabilit DOAR de manager+ (gardurile sunt în migrația următoare:
-- politici RLS + trigger pe inchirieri). Ținut într-o migrație separată pentru
-- că o valoare nouă de enum nu poate fi folosită în aceeași tranzacție.
alter type tier_inchiriere add value if not exists 'manual';
