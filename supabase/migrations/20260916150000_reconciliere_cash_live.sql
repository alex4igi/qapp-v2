-- /financiar citea `reconcilieri_cash.total_sistem` — un snapshot înghețat în
-- momentul salvării reconcilierii. Orice corecție ulterioară a unei încasări
-- (ex. 14 sept 2026: 410 lei mutați de pe Cash pe Card la 2 minute după
-- salvare) lăsa coloana veche, deci tabul Cash raporta o „lipsă" fantomă, în
-- timp ce /situatie-zilnica — care recalculează live — arăta 0.
--
-- View-ul recalculează încasările cash ale zilei exact ca situația zilnică:
-- pe (data, locatie) din `incasari`, aceeași sursă și același filtru.
-- `total_sistem` rămâne în tabel ca urmă a ce a văzut recepția la numărare.

drop view if exists reconcilieri_cash_live;

create view reconcilieri_cash_live as
select
  r.id,
  r.data,
  r.locatie,
  l.nume as locatie_nume,
  r.denominatii,
  r.total_numarat,
  r.total_sistem,
  coalesce(cash.total, 0) as total_sistem_live,
  r.total_cheltuieli,
  r.notite,
  r.created_by,
  r.created,
  r.updated
from reconcilieri_cash r
left join locatii l on l.id = r.locatie
left join lateral (
  select sum(i.suma) as total
  from incasari i
  where i.data = r.data
    and i.locatie = r.locatie
    and i.metoda = 'Cash'
) cash on true;

alter view reconcilieri_cash_live set (security_invoker = true);

revoke all on reconcilieri_cash_live from anon, public;
grant select on reconcilieri_cash_live to authenticated;
