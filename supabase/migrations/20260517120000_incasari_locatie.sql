-- Adaugă locație directă pe incasari.
--
-- Înainte: locația unei încasări era derivată indirect prin FK (enrollment →
-- curs → sala → locatie pentru Abonament; inventar.locatie pentru Merch).
-- Pentru Bilet și Taxa nu exista deloc — încasarea „se pierdea" din raportul
-- pe locație. Acum o stocăm explicit pe rând, ca o singură sursă de adevăr.
--
-- Operatorul de la recepție alege locația când înregistrează plata
-- (default = locația de unde lucrează).

alter table incasari add column locatie uuid;
alter table incasari
  add constraint fk_incasari_locatie
  foreign key (locatie) references locatii(id) on delete set null;

-- Backfill: pentru încasările existente folosim chain-urile cunoscute.
-- 1) Abonament: enrollment → curs → sala → locatie
update incasari i
set locatie = s.locatie
from enrollments e
join cursuri c on c.id = e.cursul
join sali s on s.id = c.sala
where i.inregistrare = e.id
  and i.locatie is null
  and s.locatie is not null;

-- 2) Merch: inventar.locatie
update incasari i
set locatie = inv.locatie
from inventar inv
where i.articol_inventar = inv.id
  and i.locatie is null
  and inv.locatie is not null;

-- Bilet și Taxa rămân null — admin/recepție le pot completa manual.

create index incasari_locatie_idx on incasari (locatie);
create index incasari_data_locatie_idx on incasari (data, locatie);
