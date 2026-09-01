-- Documentele clientului aveau DOUĂ forme pentru aceeași informație: câmpul
-- liber `clienti.link_contract` (editabil din fișă, afișat ca rând de text) și
-- tabelul `documente_client` (tabul Documente, cu tip/expirare/observații).
-- Recepția nu știa unde să pună contractul, iar profilul arăta un contract în
-- două stiluri diferite. Rămâne o singură formă: tabul Documente.
--
-- Aici mutăm linkurile deja introduse în câmpul vechi. Idempotent: sărim peste
-- clienții care au deja același link în documente — cazul contractelor semnate
-- electronic, care până acum scriau în ambele locuri (contract-finalize).
-- Comparăm normalizat (fără spații, fără slash final) ca să nu producem dubluri
-- pentru același fișier Drive.

insert into documente_client (client, tip, titlu, link, observatii)
select
  c.id,
  'Contract'::tip_document,
  'Contract',
  btrim(c.link_contract),
  'Importat automat din câmpul „Link contract" al fișei (1 sept 2026).'
from clienti c
where btrim(coalesce(c.link_contract, '')) <> ''
  and not exists (
    select 1
    from documente_client d
    where d.client = c.id
      and rtrim(btrim(d.link), '/') = rtrim(btrim(c.link_contract), '/')
  );

-- Coloana NU se șterge: rămâne ca istoric (de unde a venit importul) și e
-- referită de view-ul `profil_client`. Din acest moment nimic nu mai scrie în ea.
comment on column clienti.link_contract is
  'DEPRECAT (1 sept 2026) — sursa de adevăr e documente_client (tabul Documente). '
  'Coloana rămâne doar ca istoric al importului și pentru view-ul profil_client; '
  'nicio suprafață din app nu o mai citește sau scrie.';
