-- Categorii pentru încasări și cheltuieli
--
-- Pentru încasări: 4 categorii care reflectă sursa banilor:
--   Abonament — încasare legată de un enrollment (plată curs)
--   Bilet     — încasare legată de un eveniment/concurs
--   Merch     — încasare legată de un articol din inventar
--   Taxa      — încasare fără FK (reînscrieri, taxe de participare etc.)
--
-- Pentru cheltuieli: două categorii operaționale + un coș „Alta".
--   Administrativa — chirie, utilități, internet, consumabile
--   Salariala      — salarii + bonusuri teacheri / personal
--   Alta           — diverse, până la rafinare

create type categorie_incasare as enum ('Abonament', 'Bilet', 'Merch', 'Taxa');
create type categorie_cheltuiala as enum ('Administrativa', 'Salariala', 'Alta');

alter table incasari   add column categorie categorie_incasare;
alter table cheltuieli add column categorie categorie_cheltuiala;

-- Backfill: pentru încasările existente derivăm categoria din FK-ul setat.
-- Ordinea contează (un rând nu ar trebui să aibă mai multe FK-uri în mod normal).
update incasari set categorie = 'Abonament' where inregistrare     is not null and categorie is null;
update incasari set categorie = 'Bilet'     where bilet            is not null and categorie is null;
update incasari set categorie = 'Merch'     where articol_inventar is not null and categorie is null;
-- restul rămân null — admin le poate marca explicit ca Taxa din UI

-- Index util pentru graficele „pe categorie" filtrate pe interval de date
create index if not exists incasari_categorie_data_idx   on incasari   (categorie, data);
create index if not exists cheltuieli_categorie_dl_idx   on cheltuieli (categorie, deadline);
