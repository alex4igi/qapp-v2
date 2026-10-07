-- Septembrie 2026 (Alex, 6 oct. 2026): ocuparea se plătește după date, la instructori și la manageri.
-- Retenția rămâne la standard: grupele sezonului sunt rânduri noi, fără lună anterioară (banda `prima_luna`).
-- Înlocuiește decizia din 25 sept. (`standard_fix`). Nicio lună de septembrie nu era confirmată.

update public.salarizare_sezon s
set mod_ocupare_instructori = 'masurat',
    mod_ocupare_manageri    = 'masurat',
    nota = 'Sept. 2026: ocuparea după date, retenția la standard (prima lună a grupei) — Alex, 6 oct. 2026.'
from public.sezoane z
where z.id = s.sezon_id
  and z.numele_sezonului = 'Sezon 2026-2027';
