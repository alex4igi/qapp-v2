-- Turele rămase DESCHISE din mecanismul vechi (derivat din auth) trebuie închise
-- odată cu redesign-ul, altfel primul „Închei tura" din noul sistem le transformă
-- în ore plătibile: start_at e momentul unui login de acum câteva zile, nu ora la
-- care omul a ajuns la muncă. Le închidem la ora de închidere a locației și le
-- lăsăm `legacy`, deci în afara oricărei propuneri de salariu. Toată lumea
-- pornește de la zero pe pontarea explicită.

update staff_pontaj
   set end_at = least(now(), pontaj_closing_at(start_at, locatie_id)),
       source = 'auto_close',
       status = 'legacy'
 where end_at is null
   and status = 'legacy';
