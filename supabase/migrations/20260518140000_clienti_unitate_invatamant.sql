-- Adaugă unitatea de învățământ (școala/liceul) pe profilul clientului.
-- Câmp opțional — nu toți clienții studiază (adulții).

alter table public.clienti
  add column if not exists unitate_invatamant text;
