-- Orar diferit pe zile (excepție): unele cursuri încep la ore diferite în zile
-- diferite (ex. Luni 17:00, Vineri 18:00). Mod implicit rămâne `ora` unic pentru
-- toate zilele; când `ore_pe_zi` e populat, ține map zi -> ora (ex. {"Luni":"17:00"}).
-- `ora` rămâne populat (cu prima zi) ca fallback pentru căile vechi de afișare.
alter table public.cursuri
  add column if not exists ore_pe_zi jsonb;

comment on column public.cursuri.ore_pe_zi is
  'Orar diferit pe zile (excepție): map zi_saptamana -> ora "HH:MM". NULL = ora unică din coloana `ora`.';
