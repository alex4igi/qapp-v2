-- Facturile emise din aplicație se trec „plătite" și în FGO (/factura/incasare, abonament Premium).
--   fgo_incasata_la     — când a fost înregistrată plata în FGO
--   fgo_incasare_eroare — de ce n-a mers; recepția o marchează manual în FGO sau reîncearcă
-- Facturile emise înainte rămân cu ambele null (plata lor a fost marcată manual).
alter table facturi_fgo add column if not exists fgo_incasata_la timestamptz;
alter table facturi_fgo add column if not exists fgo_incasare_eroare text;
