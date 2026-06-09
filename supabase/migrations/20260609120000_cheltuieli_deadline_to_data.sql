-- Cheltuieli: „deadline" devine „data" = ziua în care s-a făcut cheltuiala.
-- Coloana funcționa deja ca dată de raportare (statistici și raport pe zile
-- filtrau cheltuielile pe ea); redenumirea elimină denumirea înșelătoare și
-- aliniază semantica cu incasari.data.
alter table cheltuieli rename column deadline to data;
alter index if exists cheltuieli_categorie_dl_idx rename to cheltuieli_categorie_data_idx;
