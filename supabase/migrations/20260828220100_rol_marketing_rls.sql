-- Rol `marketing` = agenția externă de ads, read-only pe atribuire.
--
-- De ce e nevoie de un gard în DB, nu doar de gating în UI: RLS-ul de bază
-- (20260514100200) pune pe FIECARE tabel `<t>_select_all ... for select to
-- authenticated using (true)`. Un rol nou citește implicit tot — salarii,
-- cheltuieli, încasări, contracte, date de semnatar. Restricția reală trebuie
-- să fie aici; UI-ul doar ascunde.
--
-- Model: identic cu `deny_parinte_direct` (20260705090000), dar cu allowlist —
-- `parinte` nu atinge niciun tabel direct, `marketing` citește exact atâtea cât
-- să poată reconcilia lead-urile cu ce raportează Google/Meta Ads.
do $$
declare
  r record;
  -- Tabelele pe care agenția le CITEȘTE. Orice altceva = deny total.
  allowlist text[] := array[
    'leads',
    'leads_intake_log',
    'campanii_promovare',
    'programari_leads',
    'lead_history',
    'locatii'
  ];
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  loop
    execute format('drop policy if exists deny_marketing_direct on public.%I', r.relname);
    execute format('drop policy if exists deny_marketing_insert on public.%I', r.relname);
    execute format('drop policy if exists deny_marketing_update on public.%I', r.relname);
    execute format('drop policy if exists deny_marketing_delete on public.%I', r.relname);

    if r.relname = any (allowlist) then
      -- Citește, dar nu scrie. Trei politici, nu una: `with check` nu acoperă
      -- DELETE, iar `using` pe o politică `for all` ar bloca și SELECT-ul.
      execute format(
        'create policy deny_marketing_insert on public.%I as restrictive '
        || 'for insert to authenticated with check (auth_role() <> %L)',
        r.relname, 'marketing');
      execute format(
        'create policy deny_marketing_update on public.%I as restrictive '
        || 'for update to authenticated using (auth_role() <> %L)',
        r.relname, 'marketing');
      execute format(
        'create policy deny_marketing_delete on public.%I as restrictive '
        || 'for delete to authenticated using (auth_role() <> %L)',
        r.relname, 'marketing');
    else
      execute format(
        'create policy deny_marketing_direct on public.%I as restrictive for all to authenticated '
        || 'using (auth_role() <> %L) with check (auth_role() <> %L)',
        r.relname, 'marketing', 'marketing');
    end if;
  end loop;
end $$;

-- Raport de verificare re-rulabil (scripts/check-rls-marketing.mjs): tabelele care
-- nu au RLS sau nu au NICIUNA dintre cele două forme de gard. Un tabel nou creat
-- după această migrație apare aici până i se aplică gardul — exact ca la `parinte`.
create or replace function rls_marketing_gap_report()
returns table (tabel text, problema text)
language sql stable security definer set search_path = public as $$
  select c.relname::text,
         case when not c.relrowsecurity then 'RLS dezactivat'
              else 'lipsă gardul deny_marketing_* (nici deny total, nici read-only)' end
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and (
      not c.relrowsecurity
      or not exists (
        select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = c.relname
          and p.policyname in ('deny_marketing_direct', 'deny_marketing_insert')
      )
    )
  order by 1;
$$;

revoke all on function rls_marketing_gap_report() from public, anon, authenticated;

-- get_lead_funnel devine SECURITY DEFINER.
--
-- Era `security invoker` și face join pe `enrollments` + `prezente` pentru
-- retenția la 90 de zile — tabele pe care `marketing` nu le mai vede. Fără
-- schimbarea asta funnel-ul ar întoarce TĂCUT zerouri pe retenție, în loc să dea
-- eroare. Definiția treptelor rămâne bit-identică cu 20260710130000: e sursa
-- unică a funnel-ului (statistici + rapoarte leads + pagina de marketing), nu se
-- duplică. Singura adăugare e gardul de rol, ca `security definer` să nu lărgească
-- accesul dincolo de cine îl avea deja.
create or replace function get_lead_funnel(
  p_from    date,
  p_to      date,
  p_locatie text default null,
  p_grupa   text default null
)
returns table (
  sursa_id           uuid,
  sursa_nume         text,
  leads_total        integer,
  contactati         integer,
  proba              integer,
  prezenti           integer,
  convertiti         integer,
  nu_a_venit         integer,
  pierdut            integer,
  retentie_eligibili integer,
  retentie_90z       integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Gardă dublă: auth_role() cade pe front_desk la tokenurile fără rol, deci
  -- conturile de portal se exclud explicit (vezi 20260721100200).
  if is_parinte() or auth_role() not in
     ('owner', 'admin', 'manager', 'front_desk', 'marketing') then
    raise exception 'Acces refuzat.';
  end if;

  return query
  with baza as (
    select
      l.sursa,
      (l.nr_contactari > 0 or l.ultima_contactare_la is not null
        or l.status <> 'nou')                                     as s_contact,
      (l.data_programare is not null
        or exists (select 1 from programari_leads pl
                   where pl.lead = l.id))                          as s_proba,
      (l.status = 'a_venit'
        or exists (select 1 from programari_leads pl
                   where pl.lead = l.id and pl.prezenta = 'prezent')) as s_prezent,
      (l.status = 'convertit')                                    as s_convertit,
      (l.status = 'nu_a_venit')                                   as s_nuavenit,
      (l.status = 'pierdut')                                      as s_pierdut,
      (l.status = 'convertit' and l.data_conversie is not null
        and l.data_conversie::date <= current_date - 90)          as s_matur,
      (l.status = 'convertit' and l.data_conversie is not null
        and l.data_conversie::date <= current_date - 90
        and exists (
          select 1
          from enrollments e
          join prezente p on p.enrollment = e.id
          where e.client = l.id_client
            and e.reziliat = false
            and p.status = 'Prezent'
            and p.data >= l.data_conversie::date + 90
        ))                                                        as s_retinut
    from leads l
    where l.created::date between p_from and p_to
      and l.status <> 'nurture'
      and (p_locatie is null or l.locatia = p_locatie)
      and (p_grupa is null or l.grupa_varsta::text = p_grupa)
  )
  select
    b.sursa                                            as sursa_id,
    coalesce(c.nume, 'Necunoscută')                    as sursa_nume,
    count(*)::int                                      as leads_total,
    count(*) filter (where b.s_contact or b.s_proba or b.s_prezent
                        or b.s_convertit)::int          as contactati,
    count(*) filter (where b.s_proba or b.s_prezent
                        or b.s_convertit)::int          as proba,
    count(*) filter (where b.s_prezent or b.s_convertit)::int as prezenti,
    count(*) filter (where b.s_convertit)::int          as convertiti,
    count(*) filter (where b.s_nuavenit)::int           as nu_a_venit,
    count(*) filter (where b.s_pierdut)::int            as pierdut,
    count(*) filter (where b.s_matur)::int              as retentie_eligibili,
    count(*) filter (where b.s_retinut)::int            as retentie_90z
  from baza b
  left join campanii_promovare c on c.id = b.sursa
  group by b.sursa, c.nume
  order by leads_total desc;
end;
$$;

revoke execute on function get_lead_funnel(date, date, text, text) from anon, public;
grant execute on function get_lead_funnel(date, date, text, text) to authenticated;
