-- Urmele semnării (`contract_events.meta`) țin IP-ul, browserul, emailul și telefonul
-- (mascat) al semnatarului. Anonimizarea nu le atingea, iar exportul nu le includea.
do $$
declare
  v_def text;
  v_nou text;
begin
  v_def := pg_get_functiondef('anonimizeaza_client(uuid, text)'::regprocedure);
  if v_def not like '%update contract_events%' then
    v_nou := replace(v_def,
      E'  update recomandari set nume_declarat = null\n',
      E'  update contract_events set meta = meta - ''ip'' - ''ua'' - ''email'' - ''telefon_mascat'' - ''link''\n'
      || E'   where contract_id in (select id from contracte where client_id = p_client\n'
      || E'                         or (familie_id = v_familia and client_id is null\n'
      || E'                             and not exists (select 1 from clienti where familia = v_familia and anonimizat_la is null)));\n'
      || E'  update recomandari set nume_declarat = null\n');
    if v_nou = v_def then
      raise exception 'anonimizeaza_client: markerul nu a fost găsit';
    end if;
    execute v_nou;
  end if;

  v_def := pg_get_functiondef('gdpr_export_client(uuid, text)'::regprocedure);
  if v_def not like '%contract_events%' then
    v_nou := replace(v_def,
      E'    ''recomandari'', (select',
      E'    ''semnare_contracte'', (select coalesce(jsonb_agg(jsonb_build_object(''data'', ev.created, ''pas'', ev.tip, ''detalii'', ev.meta) order by ev.created), ''[]'')\n'
      || E'                          from contract_events ev join contracte c on c.id = ev.contract_id\n'
      || E'                          where c.client_id = p_client or (c.familie_id = v_familia and c.client_id is null)),\n'
      || E'    ''recomandari'', (select');
    if v_nou = v_def then
      raise exception 'gdpr_export_client: markerul nu a fost găsit';
    end if;
    execute v_nou;
  end if;
end $$;
