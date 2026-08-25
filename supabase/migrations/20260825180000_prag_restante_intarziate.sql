-- „Pachetul de luni" (/analytics) are propriul prag pentru KPI-ul „Restanțe
-- (>7z peste scadență)". Până acum împrumuta ținta de la `rata_restante`, deși
-- numără altceva: doar ratele trecute cu >7 zile peste scadență (scadența = 15
-- ale lunii), pe când `rata_restante` (/datorii + /scorecard) numără tot ce e
-- neîncasat din luna facturată, din prima zi. Aceeași etichetă „5%" pe două
-- numere necomparabile intra-lună (pe 10 septembrie: 0% vs ~60%).
--
-- Decizie user 2026-08-25 (varianta b): metricile rămân distincte, dar fiecare
-- cu ținta ei. Valoarea de start e 5 = exact ce afișa până acum, deci nimic nu
-- se schimbă vizual; de acum se reglează independent din ⚙ Praguri.

insert into scorecard_praguri
  (cheie, faza, eticheta, unitate, prag_standard, prag_peste, directie, pondere, scorat, descriere)
values
  ('restante_intarziate', 2, 'Restanțe întârziate >7z (țintă Pachetul de luni)', 'procent', 5, 5, 'mai_mic_e_bine', 0, false,
    'Țintă pentru KPI-ul din /analytics: rate cu >7 zile peste scadență ÷ facturarea lunii. Bază diferită de rata restanțe din /datorii.')
on conflict (cheie) do nothing;
