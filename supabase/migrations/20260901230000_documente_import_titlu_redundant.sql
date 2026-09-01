-- Importul din 20260901200000 a pus titlu='Contract' pe rândurile mutate, iar
-- lista din tabul Documente afișează „tip · titlu" ⇒ ieșea „Contract · Contract".
-- Titlul e opțional tocmai pentru cazul în care tipul spune deja totul.
update documente_client
set titlu = null
where titlu = 'Contract'
  and observatii = 'Importat automat din câmpul „Link contract" al fișei (1 sept 2026).';
