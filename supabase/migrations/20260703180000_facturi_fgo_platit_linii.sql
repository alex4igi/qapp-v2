-- Model per rând pe fluxul Banca din /facturare:
--   platit_la — marchează „înregistrat" (plată încasată din acel transfer), independent
--               de starea de facturare (status).
--   linii     — liniile facturii derivate din plata înregistrată: [{articol, suma}].
--               Se emit ca linii separate în FGO la „Facturează".
alter table facturi_fgo add column if not exists platit_la timestamptz;
alter table facturi_fgo add column if not exists linii jsonb;
