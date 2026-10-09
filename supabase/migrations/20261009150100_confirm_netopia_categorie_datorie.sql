-- confirm_netopia_payment pica la orice plată online care conținea o datorie one-off:
-- `v_categorie` e declarat text, iar `coalesce(v_categorie, 'Taxa')` ajungea text într-o coloană
-- `categorie_incasare` (42804). Prins de scripts/test-plata-familie.sql pe 09.10.2026; până atunci
-- nicio comandă reală nu avusese o datorie în plan, deci n-a pierdut bani.
do $mig$
declare d text; n text;
begin
  d := pg_get_functiondef('public.confirm_netopia_payment(text,text,numeric)'::regprocedure);
  n := replace(d, $x$coalesce(v_categorie, 'Taxa'),$x$, $x$coalesce(v_categorie, 'Taxa')::categorie_incasare,$x$);
  if n = d then raise exception 'confirm: categoria datoriei nu s-a găsit'; end if;
  execute n;
end
$mig$;
