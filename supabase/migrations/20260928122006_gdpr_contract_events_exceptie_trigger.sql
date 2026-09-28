-- Jurnalul semnării e append-only (probă). Excepția: anonimizarea poate ȘTERGE chei
-- din `meta` (niciodată adăuga/schimba, și nimic în afara lui `meta`), cu semnalul
-- `qapp.gdpr_anonimizare` ridicat doar în tranzacția ei.
create or replace function _contract_events_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('qapp.gdpr_anonimizare', true) = 'on'
     and (to_jsonb(new) - 'meta') = (to_jsonb(old) - 'meta')
     and coalesce(new.meta, '{}'::jsonb) <@ coalesce(old.meta, '{}'::jsonb) then
    return new;
  end if;
  raise exception 'contract_events este append-only (jurnal probatoriu).';
end;
$$;

do $$
declare
  v_def text;
  v_nou text;
begin
  v_def := pg_get_functiondef('anonimizeaza_client(uuid, text)'::regprocedure);
  if v_def not like '%qapp.gdpr_anonimizare%' then
    v_nou := replace(v_def,
      E'  update contract_events set meta',
      E'  perform set_config(''qapp.gdpr_anonimizare'', ''on'', true);\n  update contract_events set meta');
    if v_nou = v_def then
      raise exception 'anonimizeaza_client: markerul nu a fost găsit';
    end if;
    execute v_nou;
  end if;
end $$;
