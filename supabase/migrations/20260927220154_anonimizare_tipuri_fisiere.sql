-- Tipuri explicite în lista de fișiere: UNION cu null netipat cădea la prima rulare.

create or replace function anonimizeaza_client(p_client uuid, p_motiv text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_familia uuid;
  v_blocaj text;
  v_leads uuid[];
  v_portal uuid[];
  v_eticheta text := '#' || left(p_client::text, 8);
begin
  if auth.uid() is not null and (select auth_role()) not in ('owner', 'admin') then
    raise exception 'Acces refuzat.' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(p_motiv, '')), '') is null then
    raise exception 'Motivul e obligatoriu.';
  end if;

  select familia into v_familia from clienti where id = p_client for update;
  if not found then
    raise exception 'Clientul nu există.';
  end if;
  v_blocaj := gdpr_blocaj(p_client);
  if v_blocaj is not null then
    raise exception 'Nu se poate anonimiza: %.', v_blocaj;
  end if;

  select coalesce(array_agg(id), '{}') into v_leads from leads where id_client = p_client;
  select coalesce(array_agg(auth_user_id), '{}') into v_portal
  from clienti where id = p_client and auth_user_id is not null;

  -- Fișierele se notează ÎNAINTE ca legăturile să fie golite.
  insert into gdpr_fisiere_de_sters (client_id, familie_id, bucket, cale)
  select p_client, null::uuid, 'contracte'::text, storage_path from documente_client
   where client = p_client and storage_path is not null
  union all
  select p_client, null::uuid, null::text, link from documente_client
   where client = p_client and storage_path is null and nullif(link, '') is not null
  union all
  select p_client, familie_id, 'contracte', x from contracte,
         unnest(array[semnatura_path, pdf_storage_path]) x
   where client_id = p_client and x is not null
  union all
  select p_client, familie_id, null::text, pdf_drive_link from contracte
   where client_id = p_client and pdf_drive_link is not null;

  -- reprezinta_familia = false oprește trg_clienti_sync_familie_reprezentant: familia
  -- (poate cu frați activi) nu trebuie redenumită „Anonim".
  update clienti set
    nume = 'Anonim', prenume = v_eticheta,
    email = null, telefon = null, telefonul_2 = null, foto = null, link_contract = null,
    data_nasterii = make_date(extract(year from data_nasterii)::int, 1, 1),
    marime_tricou = null, old_user_id = null,
    unitate_invatamant = null, unitate_invatamant_id = null,
    opt_out_motiv = null, auth_user_id = null, reprezinta_familia = false,
    anonimizat_la = now()
  where id = p_client;

  delete from clienti_facturare where client_id = p_client;
  update client_contacte set observatii = null where client_id = p_client;
  update documente_client set observatii = null, titlu = null where client = p_client;
  update contracte set valori = null, semnatura_path = null, pdf_storage_path = null, pdf_drive_link = null
   where client_id = p_client;
  update motivari_absenta set observatii = null where client = p_client;
  update evenimente_participanti set observatii = null where client = p_client;
  update incasari set observatii = null where client = p_client;
  update evaluari set feedback_general = null, motiv_respingere = null where client = p_client;
  update feedback set nume = null, detalii = null, detalii_rezolvare = null where autor = p_client;
  update inchirieri set guest_nume = null, guest_tel = null, observatii = null where client = p_client;
  update reinscrieri_semnate set nume_excel = null, dublura_nume = null where client = p_client;
  update facturi_fgo set client_nume = 'Anonim ' || v_eticheta where client_id = p_client;
  update app_feedback set autor_email = null where autor_client_id = p_client;
  update email_logs set to_email = 'anonimizat' where client_id = p_client or lead_id = any(v_leads);
  update confirmari_inrolare_sms s set telefon = null, mesaj = null
    from enrollments e where e.id = s.enrollment_id and e.client = p_client;

  if cardinality(v_leads) > 0 then
    update leads set nume = 'Anonim', prenume = v_eticheta, nume_parinte = null,
                     telefon = null, email = null, observatii = null
     where id = any(v_leads);
    update lead_history set old_value = null, new_value = null, payload = null
     where lead_id = any(v_leads) and action_type = 'note_added';
    update lead_contacte set observatii = null where lead_id = any(v_leads);
    update programari_leads set observatii = null where lead = any(v_leads);
    update sms_logs set telefon = null, mesaj = null where lead_id = any(v_leads);
    update sms_amanate set telefon = '', mesaj = '' where lead_id = any(v_leads);
    update leads_intake_log set telefon = null, detalii = null where lead_id = any(v_leads);
  end if;

  -- Urmele vechi din jurnal pot conține datele de dinainte (ex. client_data_changed).
  update audit_log set old_value = null, new_value = null
   where entity_id = p_client or entity_id = any(v_leads);

  -- Familia se anonimizează doar când nu mai are niciun membru neanonimizat.
  if v_familia is not null and not exists (
    select 1 from clienti where familia = v_familia and anonimizat_la is null
  ) then
    insert into gdpr_fisiere_de_sters (client_id, familie_id, bucket, cale)
    select null::uuid, v_familia, 'contracte'::text, x from contracte,
           unnest(array[semnatura_path, pdf_storage_path]) x
     where familie_id = v_familia and x is not null
    union all
    select null::uuid, v_familia, null::text, pdf_drive_link from contracte
     where familie_id = v_familia and pdf_drive_link is not null;

    select v_portal || coalesce(array_agg(auth_user_id), '{}') into v_portal
    from familii where id = v_familia and auth_user_id is not null;

    update familii set
      nume_familie = 'Familie anonimă #' || left(v_familia::text, 8),
      nume_reprezentant = null, prenume_reprezentant = null,
      email = null, telefon = null, telefon_2 = null,
      opt_out_motiv = null, auth_user_id = null, anonimizat_la = now()
    where id = v_familia;
    delete from familii_date_semnatar where familie_id = v_familia;
    update familii_facturare set firma_adresa = null, firma_iban = null, observatii = null
     where familie_id = v_familia;
    update contracte set valori = null, semnatura_path = null, pdf_storage_path = null, pdf_drive_link = null
     where familie_id = v_familia;
    update email_logs set to_email = 'anonimizat' where familia_id = v_familia;
    update facturi_fgo set client_nume = 'Familie anonimă' where familia_id = v_familia;
    update audit_log set old_value = null, new_value = null where entity_id = v_familia;
  end if;

  -- Contul de portal se închide doar dacă nu mai e legat de nimeni neanonimizat.
  update portal_accounts pa set
    status = 'disabled',
    email = 'anonim-' || pa.id || '@invalid',
    password_hash = 'anonimizat'
  where pa.id = any(v_portal)
    and not exists (select 1 from clienti where auth_user_id = pa.id)
    and not exists (select 1 from familii where auth_user_id = pa.id);
  delete from portal_sessions where account_id = any(v_portal)
    and account_id in (select id from portal_accounts where status = 'disabled');
  delete from portal_reset_tokens where account_id = any(v_portal)
    and account_id in (select id from portal_accounts where status = 'disabled');

  -- Fără nume în urmă: doar id-ul (care nu mai duce la nimeni) și motivul.
  insert into audit_log (actor_id, actor_role, action, entity_type, entity_id, reason)
  values (auth.uid(), case when auth.uid() is null then 'system' else (select auth_role()) end, 'client_anonimizat', 'client', p_client, p_motiv);
end;
$$;
