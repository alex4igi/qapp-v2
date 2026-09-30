-- Preînscrieri Valea Lupului: și weekendul, 10–12 și 12–14 (Alex, 30.09.2026).
-- În timpul săptămânii rămân 13–15 / 15–17 / 17–19.
alter table public.preinscrieri_campanie drop constraint preinscrieri_campanie_disponibilitate_check;
alter table public.preinscrieri_campanie add constraint preinscrieri_campanie_disponibilitate_check
  check (disponibilitate <@ array[
    'Lu 13-15', 'Lu 15-17', 'Lu 17-19',
    'Ma 13-15', 'Ma 15-17', 'Ma 17-19',
    'Mi 13-15', 'Mi 15-17', 'Mi 17-19',
    'Jo 13-15', 'Jo 15-17', 'Jo 17-19',
    'Vi 13-15', 'Vi 15-17', 'Vi 17-19',
    'Sa 10-12', 'Sa 12-14',
    'Du 10-12', 'Du 12-14']);
