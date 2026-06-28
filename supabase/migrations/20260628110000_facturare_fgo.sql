-- Facturare FGO — registru unificat pentru ambele fluxuri:
--   * sursa 'banca'  → transferuri din extrasul de cont (Autofgo în qapp v2)
--   * sursa 'portal' → plăți online Netopia, factură auto la confirmare
-- Cheia FGO (privateKey per CUI) NU stă aici — doar în secretul edge `FGO_KEYS`.
-- Config non-secret (ibans/serie/cotă) trăiește pe organizatie_firme.

-- ============================================================
-- 1) Config FGO non-secret pe organizatie_firme
-- ============================================================
alter table organizatie_firme
  add column if not exists ibans               text[]  not null default '{}',
  add column if not exists serie               text,
  add column if not exists cota_tva            numeric not null default 0,
  add column if not exists tip_factura         text    not null default 'Factura',
  add column if not exists judet               text    default 'Iasi',
  add column if not exists localitate          text    default 'Iasi',
  add column if not exists factureaza          boolean not null default false, -- are cheie API => poate emite din extras
  add column if not exists auto_factura_portal boolean not null default false; -- emite auto factura la plata din portal

-- Studio (49361270) — activă: cheie API, serie QDS, cotă TVA 21, IBAN-ul contului.
update organizatie_firme
  set ibans = array['RO85INGB0000999914989082'], serie = 'QDS', cota_tva = 21, factureaza = true
  where cui = '49361270';
-- Dance (40569057) — AMÂNATĂ (fără abonament API FGO): doar IBAN + cotă, factureaza rămâne false.
update organizatie_firme
  set ibans = array['RO64INGB0000999908827632'], cota_tva = 0
  where cui = '40569057';

-- ============================================================
-- 2) Registru/dedup facturi_fgo
-- ============================================================
do $$ begin
  create type factura_fgo_sursa as enum ('banca', 'portal');
exception when duplicate_object then null; end $$;

do $$ begin
  create type factura_fgo_status as enum ('Pending', 'Matched', 'Emisa', 'Marcata', 'Eroare', 'Ignorata');
exception when duplicate_object then null; end $$;

create table if not exists facturi_fgo (
  ref             text primary key,             -- ref bancară unică SAU order_ref Netopia = cheie de dedup
  sursa           factura_fgo_sursa not null,
  firma_cui       text not null,
  client_nume     text not null default '',     -- numele plătitorului din extras / clientul portal
  suma            numeric not null,
  valuta          text not null default 'RON',
  data_tranzactie date not null,
  descriere       text,                          -- descrierea de pe factură (editabilă în UI la fluxul bancă)
  client_id       uuid references clienti(id),
  familia_id      uuid references familii(id),
  incasare_id     uuid references incasari(id),
  factura_fgo     text,                          -- ex. "QDS 1697" / "manual (FGO)"
  factura_link    text,
  status          factura_fgo_status not null default 'Pending',
  eroare_mesaj    text,
  emis_la         timestamptz,
  created         timestamptz not null default now(),
  updated         timestamptz not null default now()
);

create index if not exists facturi_fgo_status_idx on facturi_fgo(status);
create index if not exists facturi_fgo_sursa_idx  on facturi_fgo(sursa);
create index if not exists facturi_fgo_data_idx   on facturi_fgo(data_tranzactie);

drop trigger if exists trg_facturi_fgo_updated on facturi_fgo;
create trigger trg_facturi_fgo_updated
  before update on facturi_fgo
  for each row execute function set_updated_timestamp();

alter table facturi_fgo enable row level security;

drop policy if exists facturi_fgo_staff_select on facturi_fgo;
create policy facturi_fgo_staff_select on facturi_fgo
  for select to authenticated
  using (auth_role() in ('owner', 'admin', 'manager', 'front_desk'));

drop policy if exists facturi_fgo_staff_write on facturi_fgo;
create policy facturi_fgo_staff_write on facturi_fgo
  for all to authenticated
  using (auth_role() in ('owner', 'admin', 'manager', 'front_desk'))
  with check (auth_role() in ('owner', 'admin', 'manager', 'front_desk'));
-- service_role (edge functions) ocolește RLS.

-- Seed: rândul deja facturat din vechiul processed.json (păstrează dedup-ul).
insert into facturi_fgo (ref, sursa, firma_cui, client_nume, suma, data_tranzactie, factura_fgo, status, emis_la)
values ('75e5db16-02b8-35c2-80aa-8fbfc7590dfc', 'banca', '49361270', 'Georgiana Baban', 30, '2026-06-10', 'QDS 1697', 'Emisa', '2026-06-10T21:31:13Z')
on conflict (ref) do nothing;

-- ============================================================
-- 3) Tracking FGO pe netopia_orders (idempotență flux portal)
-- ============================================================
alter table netopia_orders
  add column if not exists fgo_emitat  timestamptz,
  add column if not exists fgo_factura text;

-- ============================================================
-- 4) Potrivire fuzzy plătitor → client/familie
-- ============================================================
create extension if not exists pg_trgm;
create index if not exists clienti_nume_trgm    on clienti using gin (nume gin_trgm_ops);
create index if not exists clienti_prenume_trgm on clienti using gin (prenume gin_trgm_ops);
create index if not exists familii_nume_trgm    on familii using gin (nume_familie gin_trgm_ops);
create index if not exists familii_repr_trgm    on familii using gin (nume_reprezentant gin_trgm_ops);

-- Întoarce candidați (clienți + familii) potriviți pe numele plătitorului din extras.
-- p_detalii = textul „detalii tranzacție" (numele cursantului-copil apare des doar acolo,
-- plătitorul fiind părintele) — îl folosim ca semnal suplimentar via word_similarity.
create or replace function match_bank_payer(p_nume text, p_detalii text default '')
returns table (
  tip        text,   -- 'client' | 'familie'
  id         uuid,
  nume       text,
  familia_id uuid,
  scor       real
)
language sql stable security definer set search_path = public as $$
  with q as (
    select lower(coalesce(p_nume, ''))                                   as nm,
           lower(coalesce(p_nume, '') || ' ' || coalesce(p_detalii, '')) as txt
  )
  select s.tip, s.id, s.nume, s.familia_id, s.scor
  from (
    select 'client'::text as tip,
           c.id,
           trim(c.nume || ' ' || coalesce(c.prenume, '')) as nume,
           c.familia                                       as familia_id,
           greatest(
             similarity(lower(c.nume || ' ' || coalesce(c.prenume, '')), q.nm),
             similarity(lower(coalesce(c.prenume, '') || ' ' || c.nume), q.nm),
             word_similarity(lower(c.nume || ' ' || coalesce(c.prenume, '')), q.txt)
           ) as scor
    from clienti c cross join q
    union all
    select 'familie'::text,
           f.id,
           coalesce(nullif(trim(f.nume_familie), ''),
                    trim(coalesce(f.nume_reprezentant, '') || ' ' || coalesce(f.prenume_reprezentant, ''))) as nume,
           f.id as familia_id,
           greatest(
             similarity(lower(coalesce(f.nume_familie, '')), q.nm),
             similarity(lower(coalesce(f.nume_reprezentant, '') || ' ' || coalesce(f.prenume_reprezentant, '')), q.nm),
             word_similarity(lower(coalesce(f.nume_familie, '') || ' ' || coalesce(f.nume_reprezentant, '')), q.txt)
           ) as scor
    from familii f cross join q
  ) s
  where s.scor > 0.28
  order by s.scor desc
  limit 8;
$$;
grant execute on function match_bank_payer(text, text) to authenticated;

-- Avertisment dublă-înregistrare: există deja o încasare Transfer cu sumă ~egală în ±3 zile?
create or replace function warn_existing_incasare(p_client uuid, p_suma numeric, p_data date)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from incasari
    where client = p_client
      and metoda = 'Transfer'
      and abs(coalesce(suma, 0) - p_suma) < 0.5
      and data between p_data - 3 and p_data + 3
  );
$$;
grant execute on function warn_existing_incasare(uuid, numeric, date) to authenticated;

-- ============================================================
-- 5) Înregistrare atomică încasare bancă + registru (apelat de edge `autofgo`, service_role)
--    FIFO peste înrolările cu rest>0 (vechi→nou); surplusul intră ca încasare nealocată.
-- ============================================================
create or replace function record_bank_incasare(
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
  v_existing  facturi_fgo%rowtype;
  v_remaining numeric := p_suma;
  v_pay       numeric;
  v_inc       uuid;
  v_first_inc uuid;
  v_obs       text := 'Factura FGO ' || coalesce(p_factura, '') || ' / extras ' || p_ref;
  r record;
begin
  -- claim/dedup pe ref (ca netopia: for update + gardă de status)
  select * into v_existing from facturi_fgo where ref = p_ref for update;
  if found and v_existing.status in ('Emisa', 'Marcata') then
    return jsonb_build_object('ok', true, 'idempotent', true);
  end if;

  if p_client_id is not null then
    for r in
      select t.id_enrollment, t.rest, c.locatie
      from plati_inrolari t
      join enrollments e on e.id = t.id_enrollment
      join cursuri c on c.id = e.cursul
      where t.id_cursant = p_client_id and t.rest > 0
      order by t.data_incepere asc nulls last, t.id_enrollment
    loop
      exit when v_remaining <= 0.004;
      v_pay := least(r.rest, v_remaining);
      insert into incasari (inregistrare, client, data, suma, metoda, categorie, locatie, observatii)
      values (r.id_enrollment, p_client_id, p_data, round(v_pay::numeric, 2), 'Transfer', 'Abonament', r.locatie, v_obs)
      returning id into v_inc;
      if v_first_inc is null then v_first_inc := v_inc; end if;
      v_remaining := round((v_remaining - v_pay)::numeric, 2);
    end loop;

    -- surplus / client fără rest deschis → încasare Transfer nealocată
    if v_remaining > 0.004 then
      insert into incasari (client, data, suma, metoda, categorie, observatii)
      values (p_client_id, p_data, round(v_remaining::numeric, 2), 'Transfer', 'Abonament', v_obs || ' (surplus)')
      returning id into v_inc;
      if v_first_inc is null then v_first_inc := v_inc; end if;
    end if;
  end if;

  insert into facturi_fgo (ref, sursa, firma_cui, client_nume, suma, data_tranzactie, descriere,
                           client_id, familia_id, incasare_id, factura_fgo, factura_link, status, emis_la)
  values (p_ref, p_sursa::factura_fgo_sursa, p_firma_cui, coalesce(p_client_nume, ''), p_suma, p_data, p_descriere,
          p_client_id, p_familia_id, v_first_inc, p_factura, p_factura_link, 'Emisa', now())
  on conflict (ref) do update set
    client_id    = excluded.client_id,
    familia_id   = excluded.familia_id,
    incasare_id  = excluded.incasare_id,
    factura_fgo  = excluded.factura_fgo,
    factura_link = excluded.factura_link,
    descriere    = excluded.descriere,
    status       = 'Emisa',
    eroare_mesaj = null,
    emis_la      = now();

  return jsonb_build_object('ok', true, 'incasare_id', v_first_inc);
end;
$$;
revoke all on function record_bank_incasare(text, text, text, uuid, uuid, text, numeric, date, text, text, text) from public, authenticated;
grant execute on function record_bank_incasare(text, text, text, uuid, uuid, text, numeric, date, text, text, text) to service_role;

-- „Marchează ca facturat" (istoric emis manual în FGO) — doar registru, fără incasari.
create or replace function mark_bank_factura(
  p_ref         text,
  p_sursa       text,
  p_firma_cui   text,
  p_client_nume text,
  p_suma        numeric,
  p_data        date,
  p_descriere   text
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_existing facturi_fgo%rowtype;
begin
  select * into v_existing from facturi_fgo where ref = p_ref for update;
  if found and v_existing.status in ('Emisa', 'Marcata') then
    return jsonb_build_object('ok', true, 'idempotent', true);
  end if;
  insert into facturi_fgo (ref, sursa, firma_cui, client_nume, suma, data_tranzactie, descriere, factura_fgo, status, emis_la)
  values (p_ref, p_sursa::factura_fgo_sursa, p_firma_cui, coalesce(p_client_nume, ''), p_suma, p_data, p_descriere, 'manual (FGO)', 'Marcata', now())
  on conflict (ref) do update set status = 'Marcata', factura_fgo = 'manual (FGO)', emis_la = now();
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function mark_bank_factura(text, text, text, text, numeric, date, text) from public, authenticated;
grant execute on function mark_bank_factura(text, text, text, text, numeric, date, text) to service_role;
