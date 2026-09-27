-- GDPR, Faza 4 din planul de securizare: păstrarea datelor e limitată.
-- Un client fără activitate de `prag_ani` ani e ANONIMIZAT, nu șters: rândul rămâne
-- (încasări, prezențe, înscrieri, statistici neatinse), dar nimic nu mai duce la om.
-- Aceeași funcție rezolvă cererile „ștergeți-mi datele" (art. 17), cu motiv.
--
-- Decizie Alex, 28 sept. 2026: prag 5 ani; istoricul 2017–2024 a venit la import în
-- bloc și nu se poate separa, deci ceasul pornește de la 1 ian. 2026 (`ceas_de_la`).
-- Ambele se schimbă dintr-un singur rând, fără cod.

create table if not exists gdpr_config (
  id          boolean primary key default true check (id),
  prag_ani    integer not null default 5 check (prag_ani >= 1),
  ceas_de_la  date    not null default '2026-01-01',
  actualizat  timestamptz not null default now()
);
insert into gdpr_config (id) values (true) on conflict do nothing;

-- Fișierele (PDF-uri de contract, semnături, documente) nu se pot șterge din SQL.
-- Anonimizarea le trece aici, iar ștergerea din Storage/Drive se face separat.
create table if not exists gdpr_fisiere_de_sters (
  id         bigint generated always as identity primary key,
  client_id  uuid,
  familie_id uuid,
  bucket     text,
  cale       text not null,
  creat      timestamptz not null default now(),
  sters_la   timestamptz
);

alter table clienti add column if not exists anonimizat_la timestamptz;
alter table familii add column if not exists anonimizat_la timestamptz;

do $$
declare t text;
begin
  foreach t in array array['gdpr_config', 'gdpr_fisiere_de_sters'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated, public', t);
    execute format('grant all on table public.%I to service_role', t);
    execute format('create policy deny_parinte_direct on public.%I as restrictive for all to authenticated '
      || 'using ((select auth_role()) <> %L) with check ((select auth_role()) <> %L)', t, 'parinte', 'parinte');
    execute format('create policy deny_marketing_direct on public.%I as restrictive for all to authenticated '
      || 'using ((select auth_role()) <> %L) with check ((select auth_role()) <> %L)', t, 'marketing', 'marketing');
    execute format('create policy deny_teacher_direct on public.%I as restrictive for all to authenticated '
      || 'using ((select auth_role()) <> %L) with check ((select auth_role()) <> %L)', t, 'teacher', 'teacher');
  end loop;
end $$;

-- Ultima activitate reală. `clienti.created` și `leads.created` NU intră: la import
-- au primit toți data importului (sept. 2025).
create or replace function gdpr_ultima_activitate(p_client uuid)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    (select max(data) from prezente where client = p_client),
    (select max(data::date) from incasari where client = p_client),
    (select max(coalesce(data_final, data_incepere)) from enrollments where client = p_client),
    (select max(created::date) from open_rezervari where client = p_client),
    (select max(created::date) from client_contacte where client_id = p_client),
    (select max(semnat_la::date) from contracte where client_id = p_client),
    (select max(created::date) from bilete where client = p_client)
  );
$$;

-- De ce NU se poate anonimiza (null = se poate). Datoria și înscrierea în curs sunt
-- temeiuri legale de păstrare (contract, recuperare creanță).
create or replace function gdpr_blocaj(p_client uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (select 1 from clienti where id = p_client and anonimizat_la is not null)
      then 'deja anonimizat'
    when coalesce((select sum(rest) from datorii_rest where client = p_client), 0) > 0.009
      then 'are datorie neachitată'
    when exists (select 1 from enrollments where client = p_client
                 and data_reziliere is null
                 and coalesce(data_final, current_date) >= current_date)
      then 'are o înscriere în curs'
  end;
$$;

-- Previzualizare: cine ar fi anonimizat la următoarea rulare. Nu schimbă nimic.
create or replace function gdpr_clienti_de_anonimizat()
returns table (client_id uuid, nume text, ultima_activitate date, blocaj text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cfg gdpr_config;
begin
  if auth.uid() is not null and (select auth_role()) not in ('owner', 'admin') then
    raise exception 'Acces refuzat.' using errcode = '42501';
  end if;
  select * into v_cfg from gdpr_config;

  return query
  select c.id, trim(c.nume || ' ' || coalesce(c.prenume, '')), u.ultima, gdpr_blocaj(c.id)
  from clienti c
  cross join lateral (select greatest(gdpr_ultima_activitate(c.id), v_cfg.ceas_de_la) ultima) u
  where c.anonimizat_la is null
    and u.ultima < current_date - make_interval(years => v_cfg.prag_ani)
  order by u.ultima;
end;
$$;

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
  select p_client, null, 'contracte', storage_path from documente_client
   where client = p_client and storage_path is not null
  union all
  select p_client, null, null, link from documente_client
   where client = p_client and storage_path is null and nullif(link, '') is not null
  union all
  select p_client, familie_id, 'contracte', x from contracte,
         unnest(array[semnatura_path, pdf_storage_path]) x
   where client_id = p_client and x is not null
  union all
  select p_client, familie_id, null, pdf_drive_link from contracte
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
    select null, v_familia, 'contracte', x from contracte,
           unnest(array[semnatura_path, pdf_storage_path]) x
     where familie_id = v_familia and x is not null
    union all
    select null, v_familia, null, pdf_drive_link from contracte
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

-- Rularea lunară. Sare peste cei blocați (datorie, înscriere în curs) — apar la
-- previzualizare cu motivul.
create or replace function anonimizeaza_clienti_inactivi()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n integer := 0;
  v_prag integer;
begin
  select prag_ani into v_prag from gdpr_config;
  for r in select client_id from gdpr_clienti_de_anonimizat() where blocaj is null limit 500 loop
    perform anonimizeaza_client(r.client_id, format('retenție: fără activitate de %s ani', v_prag));
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke execute on function gdpr_ultima_activitate(uuid) from anon, authenticated, public;
revoke execute on function gdpr_blocaj(uuid) from anon, authenticated, public;
revoke execute on function gdpr_clienti_de_anonimizat() from anon, public;
revoke execute on function anonimizeaza_client(uuid, text) from anon, public;
revoke execute on function anonimizeaza_clienti_inactivi() from anon, authenticated, public;
grant execute on function gdpr_ultima_activitate(uuid), gdpr_blocaj(uuid),
  gdpr_clienti_de_anonimizat(), anonimizeaza_client(uuid, text), anonimizeaza_clienti_inactivi()
  to service_role;
grant execute on function gdpr_clienti_de_anonimizat(), anonimizeaza_client(uuid, text) to authenticated;

select cron.unschedule('gdpr-anonimizare-lunar')
  where exists (select 1 from cron.job where jobname = 'gdpr-anonimizare-lunar');
select cron.schedule('gdpr-anonimizare-lunar', '40 4 1 * *', $$select anonimizeaza_clienti_inactivi()$$);
