-- Raportul lunar al plăților online (Netopia) pentru contabilitate.
--
-- Netopia virează banii în loturi (batch): un lot = o virare în cont, din care s-au
-- scăzut deja comisioanele pe tranzacție și taxa de transfer a lotului anterior.
-- Fișierul lotului (batchId.<lot>.<nr>.csv) se încarcă din Facturare FGO; aici
-- păstrăm doar sumele și referința comenzii — numele, emailul și telefonul
-- plătitorului le avem deja în aplicație, nu le copiem a doua oară.

create table public.netopia_decont (
  batch_id        bigint not null,
  linie           integer not null,
  comerciant      text,
  order_ref       text,
  data_platii     date,
  data_operatiei  timestamp,
  procesat        numeric(14, 5) not null default 0,
  comision        numeric(14, 5) not null default 0,
  tva             numeric(14, 5) not null default 0,
  moneda          text,
  descriere       text,
  importat_la     timestamptz not null default now(),
  importat_de     uuid,
  primary key (batch_id, linie)
);

create index netopia_decont_order_ref_idx on public.netopia_decont (order_ref) where order_ref is not null;

-- Doar prin funcțiile de mai jos (security definer).
alter table public.netopia_decont enable row level security;
revoke all on public.netopia_decont from anon, authenticated, public;
grant all on public.netopia_decont to service_role;

create policy deny_parinte_direct on public.netopia_decont as restrictive for all to authenticated
  using ((select auth_role()) <> 'parinte') with check ((select auth_role()) <> 'parinte');
create policy deny_marketing_direct on public.netopia_decont as restrictive for all to authenticated
  using ((select auth_role()) <> 'marketing') with check ((select auth_role()) <> 'marketing');
create policy deny_teacher_direct on public.netopia_decont as restrictive for all to authenticated
  using ((select auth_role()) <> 'teacher') with check ((select auth_role()) <> 'teacher');


-- Importul unuia sau mai multor loturi. Un lot reîncărcat își înlocuiește rândurile,
-- deci încărcarea aceluiași fișier de două ori nu dublează nimic.
create or replace function public.importa_decont_netopia(p_linii jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_loturi bigint[];
  v_n      integer;
begin
  if (select auth_role()) not in ('owner', 'admin') then
    raise exception 'Acces refuzat.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_linii) <> 'array' or jsonb_array_length(p_linii) = 0 then
    raise exception 'Fișierul nu conține nicio linie.';
  end if;

  select array_agg(distinct (x ->> 'batch_id')::bigint)
    into v_loturi
    from jsonb_array_elements(p_linii) x;

  delete from netopia_decont where batch_id = any (v_loturi);

  insert into netopia_decont (
    batch_id, linie, comerciant, order_ref, data_platii, data_operatiei,
    procesat, comision, tva, moneda, descriere, importat_de
  )
  select (x ->> 'batch_id')::bigint,
         (x ->> 'linie')::integer,
         nullif(x ->> 'comerciant', ''),
         nullif(x ->> 'order_ref', ''),
         nullif(x ->> 'data_platii', '')::date,
         nullif(x ->> 'data_operatiei', '')::timestamp,
         coalesce(nullif(x ->> 'procesat', '')::numeric, 0),
         coalesce(nullif(x ->> 'comision', '')::numeric, 0),
         coalesce(nullif(x ->> 'tva', '')::numeric, 0),
         nullif(x ->> 'moneda', ''),
         nullif(x ->> 'descriere', ''),
         auth.uid()
    from jsonb_array_elements(p_linii) x;
  get diagnostics v_n = row_count;

  return jsonb_build_object('loturi', coalesce(array_length(v_loturi, 1), 0), 'linii', v_n);
end;
$$;

revoke execute on function public.importa_decont_netopia(jsonb) from anon, public;
grant execute on function public.importa_decont_netopia(jsonb) to authenticated;


-- Raportul pe o lună calendaristică. Luna plății = ziua în care omul a plătit
-- (ora României), nu ziua în care Netopia a virat banii.
create or replace function public.raport_netopia_luna(p_luna date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start date := date_trunc('month', p_luna)::date;
  v_end   date := (date_trunc('month', p_luna) + interval '1 month')::date;
  v_plati jsonb;
  v_loturi jsonb;
  v_restituiri jsonb;
  v_necunoscute jsonb;
  v_ultim_lot date;
begin
  if (select auth_role()) not in ('owner', 'admin') then
    raise exception 'Acces refuzat.' using errcode = '42501';
  end if;

  with plati as (
    select o.order_ref,
           o.order_type,
           o.plata_integrala,
           o.amount,
           o.created,
           (o.created at time zone 'Europe/Bucharest')::date as data_plata,
           c.id as client_id,
           btrim(regexp_replace(concat_ws(' ', c.nume, c.prenume), '\s+', ' ', 'g')) as membru,
           coalesce(
             nullif(btrim(regexp_replace(concat_ws(' ', fa.nume_reprezentant, fa.prenume_reprezentant), '\s+', ' ', 'g')), ''),
             nullif(btrim(regexp_replace(concat_ws(' ', ca.nume, ca.prenume), '\s+', ' ', 'g')), ''),
             nullif(fa.nume_familie, ''),
             pa.email
           ) as platitor,
           -- Cumpărătorul de pe factură, după aceeași precedență ca emiterea FGO
           -- (_shared/fgo-client.ts): PJ familie > PF alternativ > numele clientului.
           case
             when fc.factura_pe_firma and ff.firma_cif is not null
               then coalesce(ff.firma_denumire, fc.nume_familie) || ' (CUI ' || ff.firma_cif || ')'
             else nullif(cf.facturare_pf_nume, '')
           end as facturat_catre,
           f.factura_fgo,
           f.factura_link,
           f.status::text as factura_status,
           coalesce(f.descriere, case o.order_type
             when 'rezervare' then 'Rezervare ședință'
             when 'bilet' then 'Bilete spectacol'
             else 'Abonament' end) as descriere
      from netopia_orders o
      left join clienti c on c.id = o.client_id
      left join familii fa on fa.auth_user_id = o.auth_user_id
      left join clienti ca on ca.auth_user_id = o.auth_user_id and fa.id is null
      left join portal_accounts pa on pa.id = o.auth_user_id
      left join familii fc on fc.id = c.familia
      left join familii_facturare ff on ff.familie_id = fc.id
      left join clienti_facturare cf on cf.client_id = c.id
      left join facturi_fgo f on f.ref = o.order_ref
     where o.status = 'confirmed'
       and (o.created at time zone 'Europe/Bucharest')::date >= v_start
       and (o.created at time zone 'Europe/Bucharest')::date < v_end
  ),
  decont as (
    select d.order_ref,
           min(d.batch_id) as batch_id,
           min(d.data_platii) as data_virare,
           sum(d.procesat) as procesat,
           sum(d.comision) as comision,
           sum(d.tva) as tva
      from netopia_decont d
     where d.order_ref in (select order_ref from plati)
     group by d.order_ref
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'order_ref', p.order_ref,
           'order_type', p.order_type,
           'plata_integrala', p.plata_integrala,
           'data', p.data_plata,
           'ora', to_char(p.created at time zone 'Europe/Bucharest', 'HH24:MI'),
           'client_id', p.client_id,
           'membru', p.membru,
           'platitor', p.platitor,
           'facturat_catre', p.facturat_catre,
           'descriere', p.descriere,
           'suma', p.amount,
           'factura', p.factura_fgo,
           'factura_link', p.factura_link,
           'factura_status', p.factura_status,
           'batch_id', d.batch_id,
           'data_virare', d.data_virare,
           'procesat_netopia', d.procesat,
           'comision', d.comision,
           'tva_comision', d.tva
         ) order by p.created), '[]'::jsonb)
    into v_plati
    from plati p
    left join decont d on d.order_ref = p.order_ref;

  -- Loturile în care au intrat plățile lunii, întregi (un lot poate amesteca două
  -- luni). Virarea din extrasul ING, dacă extrasul a fost încărcat în Facturare.
  with loturi as (
    select distinct d.batch_id
      from netopia_decont d
     where d.order_ref in (select x ->> 'order_ref' from jsonb_array_elements(v_plati) x)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'batch_id', s.batch_id,
           'data_platii', s.data_platii,
           'nr_plati', s.nr_plati,
           'procesat', s.procesat,
           'comision_tranzactii', s.comision_tranzactii,
           'taxa_transfer', s.taxa_transfer,
           'tva', s.tva,
           'net', s.procesat + s.comision_tranzactii + s.taxa_transfer + s.tva,
           'extras_suma', b.suma,
           'extras_data', b.data_tranzactie
         ) order by s.data_platii, s.batch_id), '[]'::jsonb)
    into v_loturi
    from (
      select d.batch_id,
             max(d.data_platii) as data_platii,
             count(distinct d.order_ref) as nr_plati,
             sum(d.procesat) as procesat,
             sum(d.comision) filter (where d.order_ref is not null) as comision_tranzactii,
             coalesce(sum(d.comision) filter (where d.order_ref is null), 0) as taxa_transfer,
             sum(d.tva) as tva
        from netopia_decont d
       where d.batch_id in (select batch_id from loturi)
       group by d.batch_id
    ) s
    left join lateral (
      select fb.suma, fb.data_tranzactie
        from facturi_fgo fb
       where fb.sursa = 'banca'
         and fb.descriere ~* ('batch\s*id\s*:?\s*' || s.batch_id::text || '\M')
       order by fb.data_tranzactie
       limit 1
    ) b on true;

  select coalesce(jsonb_agg(jsonb_build_object(
           'order_ref', r.order_ref,
           'data', (r.created at time zone 'Europe/Bucharest')::date,
           'suma', r.suma,
           'motiv', r.motiv,
           'mod', r.mod,
           'status', r.status,
           'fgo_status', r.fgo_status,
           'fgo_storno', r.fgo_storno,
           'membru', btrim(regexp_replace(concat_ws(' ', c.nume, c.prenume), '\s+', ' ', 'g')),
           'factura', o.fgo_factura
         ) order by r.created), '[]'::jsonb)
    into v_restituiri
    from restituiri_online r
    left join netopia_orders o on o.order_ref = r.order_ref
    left join clienti c on c.id = o.client_id
   where r.status <> 'esuata'
     and (r.created at time zone 'Europe/Bucharest')::date >= v_start
     and (r.created at time zone 'Europe/Bucharest')::date < v_end;

  -- Tranzacții pe care Netopia le-a decontat, dar pe care aplicația nu le are
  -- confirmate (sau nu le are deloc). Ar trebui să fie zero.
  select coalesce(jsonb_agg(jsonb_build_object(
           'order_ref', t.order_ref,
           'batch_id', t.batch_id,
           'data_operatiei', t.data_operatiei,
           'procesat', t.procesat,
           'comerciant', t.comerciant,
           'status_aplicatie', t.status
         ) order by t.data_operatiei), '[]'::jsonb)
    into v_necunoscute
    from (
      select d.order_ref, min(d.batch_id) as batch_id, min(d.data_operatiei) as data_operatiei,
             sum(d.procesat) as procesat, min(d.comerciant) as comerciant, min(o.status) as status
        from netopia_decont d
        left join netopia_orders o on o.order_ref = d.order_ref
       where d.order_ref is not null
         and d.data_operatiei >= v_start and d.data_operatiei < v_end
       group by d.order_ref
      having coalesce(min(o.status), '') <> 'confirmed'
    ) t;

  select max(data_platii) into v_ultim_lot from netopia_decont;

  return jsonb_build_object(
    'luna', v_start,
    'plati', v_plati,
    'loturi', v_loturi,
    'restituiri', v_restituiri,
    'necunoscute', v_necunoscute,
    'ultim_lot', v_ultim_lot
  );
end;
$$;

revoke execute on function public.raport_netopia_luna(date) from anon, public;
grant execute on function public.raport_netopia_luna(date) to authenticated;


-- Aducere-aminte lunară: pe 7 ale lunii, Netopia a virat de regulă și plățile din
-- ultimele zile ale lunii trecute, deci raportul poate fi generat complet.
create or replace function public.notifica_raport_netopia_lunar()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_luna date := (date_trunc('month', now() at time zone 'Europe/Bucharest') - interval '1 month')::date;
  v_eticheta text;
  v_nr integer;
  v_total numeric;
  v_count integer := 0;
  v_recipient uuid;
begin
  select count(*), coalesce(sum(amount), 0)
    into v_nr, v_total
    from netopia_orders
   where status = 'confirmed'
     and (created at time zone 'Europe/Bucharest')::date >= v_luna
     and (created at time zone 'Europe/Bucharest')::date < (v_luna + interval '1 month')::date;

  if v_nr = 0 then
    return 0;
  end if;

  v_eticheta := (array['ianuarie','februarie','martie','aprilie','mai','iunie','iulie',
                       'august','septembrie','octombrie','noiembrie','decembrie'])[extract(month from v_luna)::int]
                || ' ' || extract(year from v_luna)::int;

  for v_recipient in
    select id from auth.users where raw_app_meta_data ->> 'role' in ('owner', 'admin')
  loop
    insert into notifications (recipient_user_id, kind, title, body, payload, requires_action, status)
    values (
      v_recipient,
      'raport_netopia_lunar',
      format('Raportul plăților online pentru %s', v_eticheta),
      format(
        '%s plăți online, %s lei. Descarcă din panoul Netopia fișierele loturilor virate și încarcă-le în Facturare FGO → Raport Netopia, apoi generează PDF-ul pentru contabilitate.',
        v_nr, replace(to_char(v_total, 'FM9999990.00'), '.', ',')
      ),
      jsonb_build_object('luna', v_luna),
      true,
      'open'
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.notifica_raport_netopia_lunar() from anon, public, authenticated;

select cron.unschedule('raport-netopia-lunar')
where exists (select 1 from cron.job where jobname = 'raport-netopia-lunar');

-- 07:00 UTC = 09:00–10:00 la Iași.
select cron.schedule(
  'raport-netopia-lunar',
  '0 7 7 * *',
  $$select notifica_raport_netopia_lunar();$$
);
