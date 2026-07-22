-- „Marcată" (facturat de mână în FGO) cerea doar un click și scria placeholderul
-- 'manual (FGO)' — o afirmație nefalsificabilă. Un click greșit pe rândul de lângă
-- „Facturează" scotea transferul din lista de lucru ca facturat, fără să existe factura
-- (cazul SOPCU GIORGIANA, 260 RON, 17.07.2026). Acum numărul facturii e obligatoriu:
-- nu ai ce număr să scrii dacă n-ai emis nimic, iar registrul devine verificabil.

drop function if exists mark_bank_factura(text, text, text, text, numeric, date, text);

create or replace function mark_bank_factura(
  p_ref           text,
  p_sursa         text,
  p_firma_cui     text,
  p_client_nume   text,
  p_suma          numeric,
  p_data          date,
  p_descriere     text,
  p_numar_factura text
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_existing facturi_fgo%rowtype;
  v_numar    text := nullif(btrim(coalesce(p_numar_factura, '')), '');
begin
  if v_numar is null or length(v_numar) < 2 then
    raise exception 'Numarul facturii din FGO este obligatoriu pentru marcare.';
  end if;

  select * into v_existing from facturi_fgo where ref = p_ref for update;
  if found and v_existing.status in ('Emisa', 'Marcata') then
    return jsonb_build_object('ok', true, 'idempotent', true);
  end if;

  insert into facturi_fgo (ref, sursa, firma_cui, client_nume, suma, data_tranzactie, descriere, factura_fgo, status, emis_la)
  values (p_ref, p_sursa::factura_fgo_sursa, p_firma_cui, coalesce(p_client_nume, ''), p_suma, p_data, p_descriere, v_numar, 'Marcata', now())
  on conflict (ref) do update set status = 'Marcata', factura_fgo = v_numar, emis_la = now();
  return jsonb_build_object('ok', true, 'factura', v_numar);
end;
$$;

revoke all on function mark_bank_factura(text, text, text, text, numeric, date, text, text) from public, anon, authenticated;
grant execute on function mark_bank_factura(text, text, text, text, numeric, date, text, text) to service_role;
