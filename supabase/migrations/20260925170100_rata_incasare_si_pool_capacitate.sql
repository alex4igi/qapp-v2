-- Rata de încasare a lunii (comună manager + recepție) și pool-ul de capacitate
-- al managerului. Reguli: docs/bonus-manager-studio.md §2–§3.

-- ── 1. Rata de încasare a lunii M, verificată la finalul lunii M+1 ─────────────
-- O singură definiție: o citește salariul managerului direct și K2 al recepției
-- prin kpi_dispecer (Alex, 25 sept. 2026: „sincronizează-le" — la manager e % din
-- încasări pe prag, la recepție sumă fixă).
--
-- Scadent = ratele care încep în M, cu sumă, nereziliate înainte de ziua 1.
-- Rezilierea se citește pe data_reziliere, niciodată pe `reziliat` (bifat și pe
-- lunile încheiate). Predicatul e cel din simularea validată cu Alex
-- (Management/…/_sursa/mgr_sim.cjs), ca cifrele să se poată compara.
-- Încasările lunii = tot ce a intrat la locație în M, pe toate categoriile: pe ele
-- se aplică procentul managerului (restanțele recuperate cresc bonusul).
create or replace function public.kpi_rata_incasare(
  p_locatii   uuid[],
  p_anul      int,
  p_luna      int,
  p_parametri jsonb default '{}'::jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with lim as (
    select make_date(p_anul, p_luna, 1) as m,
           (make_date(p_anul, p_luna, 1) + interval '1 month')::date as m1,
           (make_date(p_anul, p_luna, 1) + interval '2 month')::date as m2
  ),
  rate as (
    select e.id, e.suma
    from enrollments e
    join cursuri c on c.id = e.cursul
    left join sali s on s.id = c.sala
    cross join lim
    where e.client is not null
      and e.suma > 0
      and e.data_incepere >= lim.m
      and e.data_incepere < lim.m1
      and (e.data_reziliere is null or e.data_reziliere > lim.m)
      and coalesce(c.locatie, s.locatie) = any(p_locatii)
  ),
  scadent as (select coalesce(sum(suma), 0) as suma, count(*)::int as nr from rate),
  platit as (
    select coalesce(sum(i.suma), 0) as suma
    from incasari i
    join rate r on r.id = i.inregistrare
    cross join lim
    where coalesce(i.data, i.created::date) < lim.m2
  ),
  cash as (
    select coalesce(sum(i.suma), 0) as suma
    from incasari i
    cross join lim
    where i.locatie = any(p_locatii)
      and coalesce(i.data, i.created::date) >= lim.m
      and coalesce(i.data, i.created::date) < lim.m1
  )
  select jsonb_build_object(
    'kpi', 'rata_incasare_m1',
    'numitor', sc.suma,
    'numarator', pl.suma,
    'valoare', case when sc.suma > 0 then round(100 * pl.suma / sc.suma, 2) end,
    'incasari_luna', ca.suma,
    'nr_inrolari', sc.nr,
    'provizoriu', (now() at time zone 'Europe/Bucharest')::date < lim.m2,
    'final_la', (lim.m2 - 1)::text
  )
  from scadent sc, platit pl, cash ca, lim;
$$;

revoke execute on function public.kpi_rata_incasare(uuid[], int, int, jsonb) from anon, public, authenticated;
grant execute on function public.kpi_rata_incasare(uuid[], int, int, jsonb) to service_role;

-- ── 2. Pool-ul de capacitate, pe (sezon, locație) ──────────────────────────────
-- Numitorul ocupării managerului se fixează la începutul sezonului și doar crește:
-- grupele noi intră din luna în care pornesc, cele închise rămân (motivul e notă
-- internă, docs/bonus-manager-studio.md §3 — NU se publică în materialele pentru
-- manageri). Locația și capacitatea se copiază în momentul adăugării, deci o
-- schimbare ulterioară pe `cursuri` nu mută pool-ul. Rândurile nu se șterg.
create table public.capacitate_pool (
  id          uuid primary key default gen_random_uuid(),
  sezon_id    uuid not null references public.sezoane(id) on delete cascade,
  locatie_id  uuid not null references public.locatii(id),
  curs_id     uuid references public.cursuri(id) on delete set null,
  curs_nume   text not null,
  capacitate  int not null check (capacitate >= 0),
  din_luna    date not null check (extract(day from din_luna) = 1),
  sursa       text not null check (sursa in ('fixare_initiala', 'grupa_noua', 'manual')),
  exclus      boolean not null default false,
  nota        text,
  adaugat_la  timestamptz not null default now(),
  adaugat_de  uuid references auth.users(id) on delete set null,
  unique (sezon_id, curs_id)
);

create index idx_capacitate_pool_loc on public.capacitate_pool (sezon_id, locatie_id);

alter table public.capacitate_pool enable row level security;
create policy capacitate_pool_admin_select on public.capacitate_pool for select to authenticated
  using ((select auth_role()) in ('owner', 'admin'));
create policy deny_parinte_direct on public.capacitate_pool as restrictive for all to authenticated
  using (auth_role() <> 'parinte') with check (auth_role() <> 'parinte');
create policy deny_marketing_direct on public.capacitate_pool as restrictive for all to authenticated
  using (auth_role() <> 'marketing') with check (auth_role() <> 'marketing');
-- Scrierea trece doar prin funcțiile de mai jos (definer): fără INSERT/UPDATE/DELETE direct.
revoke all on public.capacitate_pool from anon, authenticated;
grant select on public.capacitate_pool to authenticated;
grant all on public.capacitate_pool to service_role;

-- Adaugă grupele sezoanelor configurate pentru salarizare (salarizare_sezon) care
-- au funcționat cel puțin o lună până acum și nu sunt încă în pool. Luna de intrare
-- = prima lună, de la lansare, în care grupa n-a fost suspendată. Lansarea =
-- max(începutul sezonului, crearea cursului), ca la pragul minim (20260914110000).
-- Idempotentă. Prima rulare pe un sezon îl fixează (`fixare_initiala`).
create or replace function public._adauga_grupe_noi_in_pool(p_sezon uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sezon record;
  v_n int := 0;
  v_k int;
begin
  for v_sezon in
    select z.id, z.data_incepere, z.data_final
    from sezoane z
    join salarizare_sezon ss on ss.sezon_id = z.id
    where (p_sezon is null or z.id = p_sezon)
      and z.data_incepere <= current_date
  loop
    insert into capacitate_pool (sezon_id, locatie_id, curs_id, curs_nume, capacitate, din_luna, sursa, adaugat_de)
    select c.sezon, coalesce(c.locatie, s.locatie), c.id, c.numele, coalesce(c.capacitate_maxima, 0),
           prima.luna,
           case when exists (select 1 from capacitate_pool p where p.sezon_id = v_sezon.id)
                then 'grupa_noua' else 'fixare_initiala' end,
           auth.uid()
    from cursuri c
    left join sali s on s.id = c.sala
    cross join lateral (
      select m::date as luna
      from generate_series(
             greatest(date_trunc('month', v_sezon.data_incepere), date_trunc('month', c.created)),
             least(date_trunc('month', current_date), date_trunc('month', v_sezon.data_final)),
             interval '1 month') m
      where curs_activ_in_luna(c.id, m::date)
      order by m
      limit 1
    ) prima
    where c.sezon = v_sezon.id
      and not coalesce(c.one_time, false)
      and coalesce(c.locatie, s.locatie) is not null
      and not exists (select 1 from capacitate_pool p where p.sezon_id = c.sezon and p.curs_id = c.id);
    get diagnostics v_k = row_count;
    v_n := v_n + v_k;
  end loop;
  return v_n;
end;
$$;

revoke execute on function public._adauga_grupe_noi_in_pool(uuid) from anon, public, authenticated;
grant execute on function public._adauga_grupe_noi_in_pool(uuid) to service_role;

-- Butonul din pagina de salarizare (admin).
create or replace function public.adauga_grupe_noi_in_pool()
returns int
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Acces refuzat.' using errcode = '42501';
  end if;
  return _adauga_grupe_noi_in_pool(null);
end;
$$;

revoke execute on function public.adauga_grupe_noi_in_pool() from anon, public;
grant execute on function public.adauga_grupe_noi_in_pool() to authenticated;

-- Corecție (ex. grupă adăugată greșit): doar owner, cu motiv, cu urmă. Rândul nu
-- se șterge — se exclude sau i se corectează capacitatea.
create or replace function public.corecteaza_pool_capacitate(
  p_id         uuid,
  p_capacitate int,
  p_exclus     boolean,
  p_motiv      text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_old capacitate_pool;
begin
  if not is_owner() then
    raise exception 'Doar owner-ul poate corecta pool-ul de capacitate.' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_motiv, '')), '') is null then
    raise exception 'Motivul corecției e obligatoriu.' using errcode = '22023';
  end if;
  select * into v_old from capacitate_pool where id = p_id;
  if not found then
    raise exception 'Rândul din pool nu există.' using errcode = 'P0002';
  end if;

  insert into audit_log (actor_id, actor_role, entity_type, entity_id, action, old_value, new_value, reason, locatie_id)
  values (auth.uid(), auth_role(), 'capacitate_pool', p_id, 'update',
          jsonb_build_object('capacitate', v_old.capacitate, 'exclus', v_old.exclus),
          jsonb_build_object('capacitate', p_capacitate, 'exclus', p_exclus),
          p_motiv, v_old.locatie_id);

  update capacitate_pool
     set capacitate = p_capacitate, exclus = p_exclus,
         nota = concat_ws(' · ', nota, p_motiv)
   where id = p_id;
end;
$$;

revoke execute on function public.corecteaza_pool_capacitate(uuid, int, boolean, text) from anon, public;
grant execute on function public.corecteaza_pool_capacitate(uuid, int, boolean, text) to authenticated;

-- Fixarea pentru Sezon 2026-2027 (pornit pe 12 sept.): grupele care au funcționat
-- în septembrie.
select public._adauga_grupe_noi_in_pool(
  (select id from public.sezoane where numele_sezonului = 'Sezon 2026-2027')
);

-- Zilnic, ca o grupă nouă să nu aștepte o lună până intră în numitor.
-- 04:15 UTC = 06:15–07:15 la Iași.
select cron.unschedule('capacitate-pool-zilnic')
where exists (select 1 from cron.job where jobname = 'capacitate-pool-zilnic');
select cron.schedule(
  'capacitate-pool-zilnic',
  '15 4 * * *',
  $$select public._adauga_grupe_noi_in_pool();$$
);
