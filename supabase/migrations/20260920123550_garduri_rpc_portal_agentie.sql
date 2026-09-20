-- Audit securitate 2026-09-20 — RPC-uri SECURITY DEFINER fără gard de rol.
--
-- Tokenul de portal (rol aplicativ `parinte`) și contul agenției (`marketing`) au rolul
-- Postgres `authenticated`, deci pot chema prin PostgREST ORICE funcție pe care
-- `authenticated` are EXECUTE. Gardurile `deny_parinte_direct` / `deny_marketing_*` sunt pe
-- tabele — o funcție SECURITY DEFINER le ocolește. Funcțiile de mai jos nu aveau niciun gard
-- în corp: un părinte logat putea citi telefoanele leadurilor convertite
-- (`conversii_ads_de_trimis`), numele tuturor clienților (`match_bank_payer`), restanțele
-- oricui (`get_client_restante`), își putea activa singur prețul promo
-- (`activate_reinscriere*`), putea „restitui" credit (`use_client_credit`) sau rula joburile
-- de noapte (`suspenda_datornici_50_zile`, `prune_expired_leads`).
--
-- Trei tratamente, după cine cheamă legitim funcția:
--   1. doar cron / edge cu service_role / alte funcții definer → REVOKE de la authenticated;
--   2. chemată din aplicația de staff (plpgsql) → gard injectat după primul `begin`;
--   3. chemată din aplicația de staff (language sql) → predicat de rol în WHERE.
-- Rolurile interne (teacher vs front_desk) rămân o decizie de business separată; aici se
-- închid actorii EXTERNI (portal + agenție) și, pe funcțiile de bani/consimțământ, instructorii.
-- service_role și pg_cron nu au app_metadata.role → `auth_role()` = 'front_desk' → trec.

-- ── 1) Doar cron / intern: fără EXECUTE pentru authenticated ──────────────────────
do $mig$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (array[
        'conversii_ads_de_trimis', 'suspenda_datornici_50_zile',
        'activate_eligible_sezoane', 'archive_expired_sezoane', 'close_season_open_enrollments',
        'leads_de_flagat_seara', 'lead_data_neprezentarii', 'deduce_motiv_categorie',
        'kpi_k1', 'kpi_k2', 'kpi_k3', 'kpi_k5', 'kpi_diferente_casa', 'kpi_zile_pontaj', 'kpi_dispecer',
        'detecteaza_absente_21z', 'detecteaza_absente_21z_interval', 'job_absente_21z',
        'auto_mark_inactiv_si_exclient', 'cancel_discount_familie_restant',
        'sync_cursuri_suspendat', 'proceseaza_sesiuni_evaluare', 'pontaj_auto_close_open_sessions',
        'notifica_demo_class_completa', 'roster_evaluare', 'enqueue_confirmare_review',
        '_try_activate_gate'
      ])
  loop
    execute format('revoke execute on function %s from authenticated, anon, public', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end
$mig$;

-- ── 2) Funcții de staff (plpgsql): gard injectat după primul `begin` ───────────────
do $mig$
declare
  r      record;
  v_def  text;
  v_new  text;
begin
  for r in
    select p.oid, p.proname, x.deny
    from (values
      -- bani / consimțământ: fără portal, agenție, instructori
      ('use_client_credit',             $$'parinte', 'marketing', 'teacher'$$),
      ('activate_reinscriere',          $$'parinte', 'marketing', 'teacher'$$),
      ('activate_reinscriere_pe_sezon', $$'parinte', 'marketing', 'teacher'$$),
      ('record_taxa_rezervare',         $$'parinte', 'marketing', 'teacher'$$),
      ('set_act_aditional_manual',      $$'parinte', 'marketing', 'teacher'$$),
      ('clear_opt_out',                 $$'parinte', 'marketing', 'teacher'$$),
      ('mark_opt_out',                  $$'parinte', 'marketing', 'teacher'$$),
      -- operaționale: fără portal și agenție
      ('notify_enrollment_move',        $$'parinte', 'marketing'$$),
      ('notify_price_change',           $$'parinte', 'marketing'$$),
      ('send_anunt_staff',              $$'parinte', 'marketing'$$),
      ('adjust_inchiriere_price',       $$'parinte', 'marketing'$$),
      ('enqueue_confirmare_programare', $$'parinte', 'marketing'$$),
      ('audit_log_record',              $$'parinte', 'marketing'$$),
      ('prune_expired_leads',           $$'parinte', 'marketing'$$),
      ('valideaza_bilet',               $$'parinte', 'marketing'$$)
    ) as x(name, deny)
    join pg_proc p on p.proname = x.name
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
    join pg_language l on l.oid = p.prolang and l.lanname = 'plpgsql'
  loop
    v_def := pg_get_functiondef(r.oid);
    if v_def like '%gard_audit_20260920%' then
      continue; -- re-rulare: gardul e deja acolo
    end if;
    v_new := regexp_replace(
      v_def,
      E'\nbegin\n',
      E'\nbegin\n  -- gard_audit_20260920: funcție de staff (vezi 20260920123550)\n'
        || '  if (select auth_role()) in (' || r.deny || E') then\n'
        || E'    raise exception ''Acces refuzat.'' using errcode = ''42501'';\n'
        || E'  end if;\n',
      'i'
    );
    if v_new = v_def then
      raise exception 'Nu am găsit `begin` în %', r.proname;
    end if;
    execute v_new;
  end loop;
end
$mig$;

-- ── 3) Funcții de staff (language sql): predicat de rol ───────────────────────────
create or replace function public.match_bank_payer(p_nume text, p_detalii text default ''::text)
returns table (tip text, id uuid, nume text, familia_id uuid, scor real)
language sql
stable security definer
set search_path to 'public'
as $function$
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
    -- gard_audit_20260920: potrivirea plătitorului e a recepției, nu a portalului/agenției/instructorilor
    and (select auth_role()) not in ('parinte', 'marketing', 'teacher')
  order by s.scor desc
  limit 8;
$function$;

create or replace function public.get_client_restante(p_client uuid)
returns table (sezon_id uuid, sezon_nume text, sursa text, rest numeric)
language sql
stable security definer
set search_path to 'public'
as $function$
  -- Abonamente: rest ne-prescris, ne-viitor per înrolare, grupat pe sezon.
  select
    e.sezon_id,
    s.numele_sezonului,
    'abonament'::text,
    sum(coalesce(e.suma, 0) - coalesce(p.platit, 0))::numeric
  from enrollments e
  left join sezoane s on s.id = e.sezon_id
  left join lateral (
    select sum(i.suma) as platit from incasari i where i.inregistrare = e.id
  ) p on true
  where e.client = p_client
    and e.reziliat = false
    and e.data_incepere >= (current_date - interval '2 years')
    and e.data_incepere < (date_trunc('month', current_date) + interval '1 month')::date
    -- gard_audit_20260920: portalul are get_datorii_client (scopat pe familie); aici doar staff
    and (select auth_role()) not in ('parinte', 'marketing')
  group by e.sezon_id, s.numele_sezonului
  having sum(coalesce(e.suma, 0) - coalesce(p.platit, 0)) > 0

  union all

  -- One-off (Bilet/Merch/Taxă): rest din datorii_rest, grupat pe sezon.
  select
    dr.sezon,
    s.numele_sezonului,
    'oneoff'::text,
    sum(dr.rest)::numeric
  from datorii_rest dr
  left join sezoane s on s.id = dr.sezon
  where dr.client = p_client
    and dr.rest > 0
    and (select auth_role()) not in ('parinte', 'marketing')
  group by dr.sezon, s.numele_sezonului;
$function$;

create or replace function public.warn_existing_incasare(p_client uuid, p_suma numeric, p_data date)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from incasari
    where client = p_client
      and metoda = 'Transfer'
      and abs(coalesce(suma, 0) - p_suma) < 0.5
      and data between p_data - 3 and p_data + 3
      -- gard_audit_20260920: altfel e un oracol pe plățile oricărui client
      and (select auth_role()) not in ('parinte', 'marketing', 'teacher')
  );
$function$;

-- ── 4) Politici de scriere `using (true)` pentru orice staff ──────────────────────
-- Cozile de SMS se alimentează doar din edge functions (service_role) și din RPC-uri
-- definer; un INSERT direct permitea oricărui cont de staff să trimită SMS cu text liber,
-- către orice număr, de pe expeditorul școlii.
drop policy if exists sms_amanate_insert_staff on public.sms_amanate;
drop policy if exists confirmari_programare_insert_staff on public.confirmari_programare_sms;
drop policy if exists confirmari_review_insert_staff on public.confirmari_review_sms;

drop policy if exists reconcilieri_cash_user_insert on public.reconcilieri_cash;
drop policy if exists reconcilieri_cash_user_update on public.reconcilieri_cash;
create policy reconcilieri_cash_user_insert on public.reconcilieri_cash
  for insert to authenticated
  with check ((select auth_role()) = any (array['owner', 'admin', 'manager', 'front_desk']));
create policy reconcilieri_cash_user_update on public.reconcilieri_cash
  for update to authenticated
  using ((select auth_role()) = any (array['owner', 'admin', 'manager', 'front_desk']))
  with check ((select auth_role()) = any (array['owner', 'admin', 'manager', 'front_desk']));

drop policy if exists voucher_redemptions_write_all on public.voucher_redemptions;
create policy voucher_redemptions_write_staff on public.voucher_redemptions
  for all to authenticated
  using ((select auth_role()) = any (array['owner', 'admin', 'manager', 'front_desk']))
  with check ((select auth_role()) = any (array['owner', 'admin', 'manager', 'front_desk']));

drop policy if exists reinscrieri_semnate_all on public.reinscrieri_semnate;
create policy reinscrieri_semnate_select_staff on public.reinscrieri_semnate
  for select to authenticated using (true);
create policy reinscrieri_semnate_write_staff on public.reinscrieri_semnate
  for all to authenticated
  using ((select auth_role()) = any (array['owner', 'admin', 'manager', 'front_desk']))
  with check ((select auth_role()) = any (array['owner', 'admin', 'manager', 'front_desk']));

-- Datele firmelor (IBAN-uri, serie de facturi, toggle-uri) erau citibile cu cheia publică:
-- politica era pe rolul `public`, iar gardurile deny_* sunt doar pe `authenticated`.
drop policy if exists organizatie_firme_select on public.organizatie_firme;
create policy organizatie_firme_select on public.organizatie_firme
  for select to authenticated using (true);
