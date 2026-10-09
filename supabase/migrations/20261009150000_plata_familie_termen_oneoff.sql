-- Plăți în portal (Alex, 09.10.2026; handoff Codex 2026-10-09-claritate-plati-portal + review):
--
-- 1. O singură plată Netopia pentru toată familia. `build_fifo_plan_familie` adună planurile
--    FIFO ale membrilor aleși și pune `client_id` pe fiecare articol. FIFO rămâne pe luna
--    înrolării, pe fiecare membru (decizia lui Alex). Aceeași funcție dă previzualizarea coșului.
-- 2. Confirmarea scrie încasarea pe clientul înrolării / datoriei, nu pe `netopia_orders.client_id`
--    (care, la o comandă de familie, e doar primul membru). La comenzile vechi e același client.
-- 3. Fără plată dublă: cât timp o comandă de abonament e `pending` (max. 30 min), rândurile ei nu
--    pot intra într-o comandă nouă. Portalul le arată „Plată în curs” prin `get_plati_in_curs`.
-- 4. Datoriile one-off au termen propriu (`datorii.termen`). Până acum termenul era ziua creării,
--    deci o taxă de concurs pusă ieri apărea „restantă” azi.
-- 5. Raportul Netopia, notificarea de problemă, exportul GDPR, factura și ecranul de după plată
--    citesc toți membrii unei comenzi, nu doar `client_id`.
--
-- Funcțiile existente cu istoric de regresii (confirm_netopia_payment, raport_netopia_luna,
-- gdpr_export_client, get_rezumat_plati_familie, get_restante_scadente,
-- notifica_plata_online_problema) se modifică pornind de la definiția LIVE (`pg_get_functiondef`),
-- cu înlocuiri punctuale verificate, ca să nu readucem o versiune veche.

-- ---------------------------------------------------------------------------
-- 4. Termen propriu pe datoriile one-off
-- ---------------------------------------------------------------------------
alter table public.datorii add column if not exists termen date;
update public.datorii set termen = (created at time zone 'Europe/Bucharest')::date where termen is null;
alter table public.datorii alter column termen set default ((now() at time zone 'Europe/Bucharest')::date);
alter table public.datorii alter column termen set not null;

create or replace view public.datorii_rest
with (security_invoker = true) as
 SELECT d.id,
    d.client,
    d.categorie,
    d.descriere,
    d.suma_datorata,
    d.bilet,
    d.articol_inventar,
    d.bucati,
    d.locatie,
    d.sezon,
    d.created,
    COALESCE(sum(i.suma), (0)::numeric) AS platit,
    (d.suma_datorata - COALESCE(sum(i.suma), (0)::numeric)) AS rest,
    cl.nume,
    cl.prenume,
    d.termen
   FROM ((datorii d
     LEFT JOIN incasari i ON ((i.datorie = d.id)))
     LEFT JOIN clienti cl ON ((cl.id = d.client)))
  GROUP BY d.id, cl.id;
revoke all on public.datorii_rest from anon;

do $mig$
declare d text; n text;
begin
  d := pg_get_functiondef('public.get_rezumat_plati_familie()'::regprocedure);
  n := replace(d, $x$select dr.client, (dr.created at time zone 'Europe/Bucharest')::date, dr.rest$x$,
                  $x$select dr.client, dr.termen, dr.rest$x$);
  if n = d then raise exception 'get_rezumat_plati_familie: textul de înlocuit nu s-a găsit'; end if;
  execute n;

  d := pg_get_functiondef('public.get_restante_scadente(uuid)'::regprocedure);
  n := replace(d, 'and dr.created::date < current_date', 'and dr.termen < current_date');
  if n = d then raise exception 'get_restante_scadente: textul de înlocuit nu s-a găsit'; end if;
  execute n;
end
$mig$;

drop function if exists public.get_datorii_client(uuid);
create function public.get_datorii_client(p_client uuid)
 returns table(datorie_id uuid, categorie categorie_incasare, descriere text, suma_datorata numeric,
               platit numeric, rest numeric, created timestamptz, termen date)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select dr.id, dr.categorie, dr.descriere, dr.suma_datorata, dr.platit, dr.rest, dr.created, dr.termen
  from datorii_rest dr
  where dr.client = p_client
    and dr.rest > 0
    and p_client in (select client_member_ids())
  order by dr.termen asc, dr.created asc;
$function$;
revoke execute on function public.get_datorii_client(uuid) from anon, public;
grant execute on function public.get_datorii_client(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Ajutătoare: membrii unei comenzi (din articolele planului)
-- ---------------------------------------------------------------------------
create or replace function public.netopia_order_client_ids(p_order_ref text)
 returns uuid[]
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce(array_agg(distinct x.client) filter (where x.client is not null), '{}')
  from (
    select o.client_id as client from netopia_orders o where o.order_ref = p_order_ref
    union
    select coalesce(e.client, d.client)
    from netopia_orders o
    cross join lateral jsonb_array_elements(coalesce(o.fifo_plan, '[]'::jsonb)) it
    left join enrollments e on e.id = (it->>'enrollment_id')::uuid
    left join datorii d on d.id = (it->>'datorie_id')::uuid
    where o.order_ref = p_order_ref
  ) x;
$function$;
revoke execute on function public.netopia_order_client_ids(text) from anon, public, authenticated;
grant execute on function public.netopia_order_client_ids(text) to service_role;

-- „Nume Prenume, Nume Prenume” — null dacă planul n-are articole (rezervare, bilete).
create or replace function public.netopia_order_membri(p_order_ref text)
 returns text
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select string_agg(nm, ', ' order by nm)
  from (
    select distinct btrim(regexp_replace(concat_ws(' ', c.nume, c.prenume), '\s+', ' ', 'g')) as nm
    from netopia_orders o
    cross join lateral jsonb_array_elements(coalesce(o.fifo_plan, '[]'::jsonb)) it
    left join enrollments e on e.id = (it->>'enrollment_id')::uuid
    left join datorii d on d.id = (it->>'datorie_id')::uuid
    join clienti c on c.id = coalesce(e.client, d.client)
    where o.order_ref = p_order_ref
  ) t;
$function$;
revoke execute on function public.netopia_order_membri(text) from anon, public, authenticated;
grant execute on function public.netopia_order_membri(text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Plăți în curs (comenzi de abonament pending, max. 30 min)
-- ---------------------------------------------------------------------------
create or replace function public.plata_in_curs_ids()
 returns setof uuid
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce((it->>'enrollment_id')::uuid, (it->>'datorie_id')::uuid)
  from netopia_orders o
  cross join lateral jsonb_array_elements(coalesce(o.fifo_plan, '[]'::jsonb)) it
  where o.status = 'pending'
    and o.order_type = 'abonament'
    and o.created > now() - interval '30 minutes'
    and o.client_id in (select client_member_ids());
$function$;
revoke execute on function public.plata_in_curs_ids() from anon, public, authenticated;
grant execute on function public.plata_in_curs_ids() to service_role;

create or replace function public.get_plati_in_curs()
 returns table(order_ref text, amount numeric, created timestamptz, expira timestamptz,
               randuri uuid[], membri text[])
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if (select auth_role()) <> 'parinte' then
    raise exception 'Acces refuzat.' using errcode = '42501';
  end if;

  return query
  select o.order_ref, o.amount, o.created, o.created + interval '30 minutes',
         array_agg(distinct coalesce((it->>'enrollment_id')::uuid, (it->>'datorie_id')::uuid)),
         array_agg(distinct coalesce(c.prenume, c.nume)) filter (where c.id is not null)
  from netopia_orders o
  cross join lateral jsonb_array_elements(coalesce(o.fifo_plan, '[]'::jsonb)) it
  left join enrollments e on e.id = (it->>'enrollment_id')::uuid
  left join datorii d on d.id = (it->>'datorie_id')::uuid
  left join clienti c on c.id = coalesce(e.client, d.client)
  where o.status = 'pending'
    and o.order_type = 'abonament'
    and o.created > now() - interval '30 minutes'
    and o.client_id in (select client_member_ids())
  group by o.order_ref, o.amount, o.created
  order by o.created;
end;
$function$;
revoke execute on function public.get_plati_in_curs() from anon, public;
grant execute on function public.get_plati_in_curs() to authenticated, service_role;

-- Planul pe un membru (pornit din definiția LIVE) + gardul de plată în curs.
create or replace function public.build_fifo_plan_membru(p_client uuid, p_pana_la uuid DEFAULT NULL::uuid, p_datorii uuid[] DEFAULT '{}'::uuid[], p_include_inrolari boolean DEFAULT true)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_enr jsonb := '[]'::jsonb;
  v_dat jsonb := '[]'::jsonb;
  v_enr_amt numeric := 0;
  v_dat_amt numeric := 0;
  v_cutoff_date date;
begin
  if p_client not in (select client_member_ids()) then
    raise exception 'Cursantul ales nu mai apare în familia contului tău. Reîncarcă pagina și alege-l din nou din partea de sus a ecranului; dacă lipsește, scrie-ne la office@quasardance.ro.';
  end if;

  if p_include_inrolari then
    if p_pana_la is not null then
      select t.data_incepere into v_cutoff_date
      from plati_inrolari t
      where t.id_enrollment = p_pana_la and t.id_cursant = p_client and t.rest > 0
        and not coalesce(t.prescris, false);
      if not found then
        raise exception 'Luna aleasă e deja achitată sau nu mai e de plată. Reîncarcă pagina ca să vezi soldul la zi.';
      end if;
    end if;

    select coalesce(jsonb_agg(jsonb_build_object('enrollment_id', t.id_enrollment, 'pay', t.rest)
                              order by t.data_incepere asc nulls last, t.id_enrollment), '[]'::jsonb),
           coalesce(sum(t.rest), 0)
      into v_enr, v_enr_amt
    from plati_inrolari t
    where t.id_cursant = p_client
      and t.rest > 0
      and not coalesce(t.prescris, false)
      and (p_pana_la is null or t.data_incepere <= v_cutoff_date);
  end if;

  if p_datorii is not null and array_length(p_datorii, 1) is not null then
    select coalesce(jsonb_agg(jsonb_build_object('datorie_id', dr.id, 'pay', dr.rest)
                              order by dr.created asc), '[]'::jsonb),
           coalesce(sum(dr.rest), 0)
      into v_dat, v_dat_amt
    from datorii_rest dr
    where dr.client = p_client and dr.rest > 0 and dr.id = any(p_datorii);
  end if;

  if exists (
    select 1 from jsonb_array_elements(v_enr || v_dat) x
    where coalesce((x->>'enrollment_id')::uuid, (x->>'datorie_id')::uuid) in (select plata_in_curs_ids())
  ) then
    raise exception 'Ai deja o plată în curs pentru una dintre aceste luni. Așteaptă confirmarea băncii (de obicei câteva minute), apoi reîncarcă pagina. Dacă ai închis pagina de plată fără să plătești, poți reîncerca după 30 de minute.'
      using errcode = 'P0001', hint = 'plata_in_curs';
  end if;

  return jsonb_build_object('amount', v_enr_amt + v_dat_amt, 'plan', v_enr || v_dat);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 1. Planul pe familie
-- ---------------------------------------------------------------------------
-- p_selectie: [{client, include_inrolari, pana_la, datorii: [uuid]}]
--   include_inrolari = true cere pana_la explicit: în build_fifo_plan_membru, pana_la null
--   înseamnă TOATE ratele, nu zero (capcană semnalată de Codex).
create or replace function public.build_fifo_plan_familie(p_selectie jsonb)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_el jsonb;
  v_client uuid;
  v_vazuti uuid[] := '{}';
  v_pana uuid;
  v_inrol boolean;
  v_dat uuid[];
  v_res jsonb;
  v_amt numeric;
  v_item jsonb;
  v_plan jsonb := '[]'::jsonb;
  v_pe jsonb := '[]'::jsonb;
  v_total numeric := 0;
begin
  if (select auth_role()) <> 'parinte' then
    raise exception 'Acces refuzat.' using errcode = '42501';
  end if;

  if p_selectie is null or jsonb_typeof(p_selectie) <> 'array' or jsonb_array_length(p_selectie) = 0 then
    raise exception 'Nu ai ales nimic de plătit. Bifează cel puțin o rată sau o datorie.';
  end if;

  for v_el in select * from jsonb_array_elements(p_selectie)
  loop
    if jsonb_typeof(v_el) <> 'object' then
      raise exception 'Selecția plății nu e validă. Reîncarcă pagina.';
    end if;
    v_client := nullif(v_el->>'client', '')::uuid;
    if v_client is null then
      raise exception 'Lipsește membrul familiei din plată. Reîncarcă pagina.';
    end if;
    if v_client = any(v_vazuti) then
      raise exception 'Același membru apare de două ori în plată. Reîncarcă pagina.';
    end if;
    v_vazuti := v_vazuti || v_client;

    v_inrol := coalesce((v_el->>'include_inrolari')::boolean, false);
    v_pana := nullif(v_el->>'pana_la', '')::uuid;
    select coalesce(array_agg(x::uuid), '{}') into v_dat
    from jsonb_array_elements_text(coalesce(v_el->'datorii', '[]'::jsonb)) x;

    if v_inrol and v_pana is null then
      raise exception 'Alege până la ce lună plătești. Reîncarcă pagina.';
    end if;
    if not v_inrol and cardinality(v_dat) = 0 then
      raise exception 'Nu ai ales nimic de plătit pentru unul dintre membri. Reîncarcă pagina.';
    end if;
    if cardinality(v_dat) <> (select count(distinct x) from unnest(v_dat) x) then
      raise exception 'O datorie apare de două ori în plată. Reîncarcă pagina.';
    end if;
    if exists (
      select 1 from unnest(v_dat) x
      where not exists (select 1 from datorii_rest dr where dr.id = x and dr.client = v_client and dr.rest > 0)
    ) then
      raise exception 'Una dintre datoriile alese nu mai e de plată. Reîncarcă pagina ca să vezi soldul la zi.';
    end if;

    v_res := build_fifo_plan_membru(v_client, v_pana, v_dat, v_inrol);
    v_amt := coalesce((v_res->>'amount')::numeric, 0);
    if v_amt <= 0 then
      raise exception 'Nu mai e nimic de plătit pentru unul dintre membri. Reîncarcă pagina ca să vezi soldul la zi.';
    end if;

    for v_item in select * from jsonb_array_elements(v_res->'plan')
    loop
      v_plan := v_plan || jsonb_build_array(v_item || jsonb_build_object('client_id', v_client));
    end loop;
    v_pe := v_pe || jsonb_build_array(jsonb_build_object('client', v_client, 'amount', v_amt));
    v_total := v_total + v_amt;
  end loop;

  if (select count(*) from jsonb_array_elements(v_plan))
     <> (select count(distinct coalesce(x->>'enrollment_id', 'd:' || (x->>'datorie_id')))
         from jsonb_array_elements(v_plan) x) then
    raise exception 'Plata conține același rând de două ori. Reîncarcă pagina.';
  end if;

  return jsonb_build_object('amount', v_total, 'plan', v_plan, 'pe_membru', v_pe);
end;
$function$;
revoke execute on function public.build_fifo_plan_familie(jsonb) from anon, public;
grant execute on function public.build_fifo_plan_familie(jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Confirmarea: încasarea pe clientul rândului (definiția LIVE + înlocuiri)
-- ---------------------------------------------------------------------------
do $mig$
declare d text; n text; p text;
begin
  d := pg_get_functiondef('public.confirm_netopia_payment(text,text,numeric)'::regprocedure);
  n := d;

  p := n; n := replace(n, $x$  v_count integer;
begin$x$, $x$  v_count integer;
  v_client_rand uuid;
begin$x$);
  if n = p then raise exception 'confirm: declarația nu s-a găsit'; end if;

  p := n; n := replace(n, $x$      select c.locatie into v_locatie
      from enrollments e join cursuri c on c.id = e.cursul
      where e.id = v_enrollment;$x$, $x$      select c.locatie, e.client into v_locatie, v_client_rand
      from enrollments e join cursuri c on c.id = e.cursul
      where e.id = v_enrollment;$x$);
  if n = p then raise exception 'confirm: select-ul înrolării nu s-a găsit'; end if;

  p := n; n := replace(n, $x$values (v_enrollment, v_order.client_id, current_date, v_pay, 'Online', 'Abonament',$x$,
                          $x$values (v_enrollment, coalesce(v_client_rand, v_order.client_id), current_date, v_pay, 'Online', 'Abonament',$x$);
  if n = p then raise exception 'confirm: insertul înrolării nu s-a găsit'; end if;

  p := n; n := replace(n, $x$      select d.categorie, d.locatie into v_categorie, v_locatie
      from datorii d where d.id = v_datorie;$x$, $x$      select d.categorie, d.locatie, d.client into v_categorie, v_locatie, v_client_rand
      from datorii d where d.id = v_datorie;$x$);
  if n = p then raise exception 'confirm: select-ul datoriei nu s-a găsit'; end if;

  p := n; n := replace(n, $x$values (v_datorie, v_order.client_id, current_date, v_pay,$x$,
                          $x$values (v_datorie, coalesce(v_client_rand, v_order.client_id), current_date, v_pay,$x$);
  if n = p then raise exception 'confirm: insertul datoriei nu s-a găsit'; end if;

  execute n;
end
$mig$;

-- ---------------------------------------------------------------------------
-- 5. Consumatorii care presupuneau un singur membru pe comandă
-- ---------------------------------------------------------------------------
do $mig$
declare d text; n text; p text;
begin
  -- Raportul Netopia: „Membru” = toți membrii din plan.
  d := pg_get_functiondef('public.raport_netopia_luna(date)'::regprocedure);
  n := d;
  p := n; n := replace(n, $x$btrim(regexp_replace(concat_ws(' ', c.nume, c.prenume), '\s+', ' ', 'g')) as membru,$x$,
                          $x$coalesce(netopia_order_membri(o.order_ref), btrim(regexp_replace(concat_ws(' ', c.nume, c.prenume), '\s+', ' ', 'g'))) as membru,$x$);
  if n = p then raise exception 'raport: membru (plăți) nu s-a găsit'; end if;
  p := n; n := replace(n, $x$'membru', btrim(regexp_replace(concat_ws(' ', c.nume, c.prenume), '\s+', ' ', 'g')),$x$,
                          $x$'membru', coalesce(netopia_order_membri(o.order_ref), btrim(regexp_replace(concat_ws(' ', c.nume, c.prenume), '\s+', ' ', 'g'))),$x$);
  if n = p then raise exception 'raport: membru (restituiri) nu s-a găsit'; end if;
  execute n;

  -- Exportul GDPR: comanda apare la fiecare membru din plan.
  d := pg_get_functiondef('public.gdpr_export_client(uuid,text)'::regprocedure);
  n := replace(d, 'from netopia_orders n where client_id = p_client)',
                  'from netopia_orders n where n.client_id = p_client or p_client = any(netopia_order_client_ids(n.order_ref)))');
  if n = d then raise exception 'gdpr_export_client: textul de înlocuit nu s-a găsit'; end if;
  execute n;

  -- Notificarea de problemă: toți membrii.
  d := pg_get_functiondef('public.notifica_plata_online_problema(text,text)'::regprocedure);
  n := replace(d, $x$  select trim(coalesce(c.prenume, '') || ' ' || coalesce(c.nume, '')) into v_client
  from clienti c where c.id = v_order.client_id;$x$, $x$  select coalesce(
           netopia_order_membri(p_order_ref),
           (select trim(coalesce(c.prenume, '') || ' ' || coalesce(c.nume, ''))
              from clienti c where c.id = v_order.client_id))
    into v_client;$x$);
  if n = d then raise exception 'notifica_plata_online_problema: textul de înlocuit nu s-a găsit'; end if;
  execute n;
end
$mig$;

-- Ecranul de după plată: numele membrilor acoperiți.
create or replace function public.portal_status_comanda(p_order_ref text)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select jsonb_build_object(
    'status', o.status,
    'order_type', o.order_type,
    'rezervare_status', r.status::text,
    'curs_nume', c.numele,
    'data', s.data::date,
    'amount', o.amount,
    'membri', (
      select coalesce(jsonb_agg(distinct coalesce(cl.prenume, cl.nume)), '[]'::jsonb)
      from jsonb_array_elements(coalesce(o.fifo_plan, '[]'::jsonb)) it
      left join enrollments e on e.id = (it->>'enrollment_id')::uuid
      left join datorii d on d.id = (it->>'datorie_id')::uuid
      join clienti cl on cl.id = coalesce(e.client, d.client)
    )
  )
  from netopia_orders o
  left join open_rezervari r on r.id = o.rezervare_id
  left join open_sesiuni s on s.id = r.sesiune
  left join cursuri c on c.id = s.curs
  where o.order_ref = p_order_ref
    and (o.client_id in (select client_member_ids()) or o.auth_user_id = auth.uid());
$function$;

-- Factura: la o comandă cu mai mulți membri, fiecare linie poartă prenumele membrului.
create or replace function public.get_portal_invoice_lines(p_order_ref text)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_order netopia_orders%rowtype;
  v_lines jsonb := '[]'::jsonb;
  v_item  jsonb;
  v_data  date;
  v_line  jsonb;
  v_multi boolean;
  v_pren  text;
begin
  select * into v_order from netopia_orders where order_ref = p_order_ref;
  if not found then
    return '[]'::jsonb;
  end if;

  -- ----- BILET / audiție / workshop -----
  if v_order.order_type = 'bilet' then
    return jsonb_build_array(fgo_line_for_eveniment(
      v_order.eveniment_id, v_order.amount, coalesce(v_order.nr_bilete, 1)));
  end if;

  -- ----- REZERVARE open class -----
  if v_order.order_type = 'rezervare' then
    select s.data::date into v_data
    from open_rezervari r
    join open_sesiuni s on s.id = r.sesiune
    where r.id = v_order.rezervare_id;
    return jsonb_build_array(jsonb_build_object(
      'denumire',
        'Sedinta dans gimnastica'
        || case when v_data is not null then ' din ' || to_char(v_data, 'DD.MM.YYYY') else '' end,
      'suma', v_order.amount, 'articol', 'Sedinta dans gimnastica', 'certain', true));
  end if;

  v_multi := cardinality(netopia_order_client_ids(p_order_ref)) > 1;

  -- ----- ABONAMENT (FIFO): o linie per element -----
  for v_item in select * from jsonb_array_elements(coalesce(v_order.fifo_plan, '[]'::jsonb))
  loop
    if (v_item->>'pay') is null or (v_item->>'pay')::numeric <= 0 then
      continue;
    end if;

    if v_item ? 'enrollment_id' then
      v_line := fgo_line_for_enrollment((v_item->>'enrollment_id')::uuid, (v_item->>'pay')::numeric);
      select coalesce(c.prenume, c.nume) into v_pren
      from enrollments e join clienti c on c.id = e.client
      where e.id = (v_item->>'enrollment_id')::uuid;
    elsif v_item ? 'datorie_id' then
      v_line := fgo_line_for_datorie((v_item->>'datorie_id')::uuid, (v_item->>'pay')::numeric);
      select coalesce(c.prenume, c.nume) into v_pren
      from datorii d join clienti c on c.id = d.client
      where d.id = (v_item->>'datorie_id')::uuid;
    else
      continue;
    end if;

    if v_multi and v_pren is not null and v_line ? 'denumire' then
      v_line := jsonb_set(v_line, '{denumire}', to_jsonb((v_line->>'denumire') || ' - ' || v_pren));
    end if;
    v_lines := v_lines || jsonb_build_array(v_line);
  end loop;

  -- Agregă liniile cu aceeași denumire (sumă însumată; articol/certain consecvente).
  select coalesce(
           jsonb_agg(jsonb_build_object(
             'denumire', denumire, 'suma', s, 'articol', art, 'certain', cert) order by ord),
           '[]'::jsonb)
    into v_lines
  from (
    select elem->>'denumire' as denumire,
           sum((elem->>'suma')::numeric) as s,
           max(elem->>'articol') as art,
           bool_and((elem->>'certain')::boolean) as cert,
           min(idx) as ord
    from jsonb_array_elements(v_lines) with ordinality as t(elem, idx)
    group by elem->>'denumire'
  ) g;

  return v_lines;  -- poate fi [] (nesigur) — apelantul decide
end;
$function$;
