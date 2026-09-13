-- Backfill `cursuri.stil` pentru cursurile fără disciplină din sezonul activ
-- (2026-2027). Doar sezonul activ: el hrănește orarul public și rapoartele pe
-- disciplină; sezoanele arhivate rămân cu stil NULL, nu inventăm date în ele.
--
-- Regula dată de owner: grupele de Teatru sunt teatru, restul e street dance.
-- Excepțiile evidente din nume (Kpop, Zumba) nu sunt street dance, deci se duc
-- pe disciplina lor. Grupa de test „ZZ TEST" rămâne NULL intenționat.

update public.cursuri
set stil = case
  when numele ilike '%teatru%' then 'Teatru'
  when numele ilike '%kpop%' or numele ilike '%k-pop%' then 'K-Pop'
  when numele ilike '%zumba%' then 'Zumba'
  else 'Street Dance'
end
where sezon = '7ef50018-03f9-4e51-8357-1266a4bf9f69'  -- Sezon 2026-2027
  and stil is null
  and numele not ilike 'ZZ TEST%';
