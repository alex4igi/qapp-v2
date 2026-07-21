-- Anti-dublă-rezervare la nivel de DB. Verificarea de conflict din UI e
-- client-side (TOCTOU): două recepții care rezervă simultan același slot
-- treceau amândouă. Constraint-ul EXCLUDE respinge a doua tranzacție.
-- Suprapunerea cu CURSURILE rămâne verificată doar în UI (orarul cursurilor
-- nu trăiește ca intervale în DB) — acceptat, cursurile se schimbă rar.
create extension if not exists btree_gist;

-- ora_final e mereu în aceeași zi (UI-ul plafonează la 23:59), deci intervalul
-- e bine ordonat; îl garantăm și aici.
alter table inchirieri
  add constraint inchirieri_interval_valid check (ora_final > ora_start);

alter table inchirieri
  add constraint inchirieri_no_overlap
  exclude using gist (
    sala with =,
    tsrange(data + ora_start, data + ora_final, '[)') with &&
  );
