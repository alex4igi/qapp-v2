-- Decuplare plată/factură pe fluxul Banca din /facturare:
-- emiterea facturii FGO NU mai înregistrează automat încasarea (FIFO). Plata se
-- încasează separat, prin „Plată nouă" (unde operatorul controlează alocarea).
-- Acest RPC face DOAR upsert-ul registrului facturi_fgo la status='Emisa' cu
-- numărul/link-ul facturii — fără niciun insert în `incasari`.

create or replace function record_bank_factura(
  p_ref          text,
  p_sursa        text,
  p_firma_cui    text,
  p_client_id    uuid,
  p_familia_id   uuid,
  p_client_nume  text,
  p_suma         numeric,
  p_data         date,
  p_descriere    text,
  p_factura      text,
  p_factura_link text
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_existing facturi_fgo%rowtype;
begin
  -- claim/dedup pe ref (ca record_bank_incasare: for update + gardă de status)
  select * into v_existing from facturi_fgo where ref = p_ref for update;
  if found and v_existing.status in ('Emisa', 'Marcata') then
    return jsonb_build_object('ok', true, 'idempotent', true);
  end if;

  insert into facturi_fgo (ref, sursa, firma_cui, client_nume, suma, data_tranzactie, descriere,
                           client_id, familia_id, incasare_id, factura_fgo, factura_link, status, emis_la)
  values (p_ref, p_sursa::factura_fgo_sursa, p_firma_cui, coalesce(p_client_nume, ''), p_suma, p_data, p_descriere,
          p_client_id, p_familia_id, null, p_factura, p_factura_link, 'Emisa', now())
  on conflict (ref) do update set
    client_id    = excluded.client_id,
    familia_id   = excluded.familia_id,
    incasare_id  = null,
    factura_fgo  = excluded.factura_fgo,
    factura_link = excluded.factura_link,
    descriere    = excluded.descriere,
    status       = 'Emisa',
    eroare_mesaj = null,
    emis_la      = now();

  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function record_bank_factura(text, text, text, uuid, uuid, text, numeric, date, text, text, text) from public, authenticated;
grant execute on function record_bank_factura(text, text, text, uuid, uuid, text, numeric, date, text, text, text) to service_role;
