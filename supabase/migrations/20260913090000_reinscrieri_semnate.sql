-- Qapp v2 — arhiva campaniei de reînscrieri 2026-2027 ținută în Excel + secțiunea
-- „Reînscrieri semnate" din /start-sezon.
--
-- Context: campania din aprilie–iunie 2026 a rulat integral în afara CRM-ului, în trei
-- registre `PROMO reinscrieri 26-27` (Ștefan, Nicolina, Q4Kids). `campanii_reinscriere`
-- e gol, deci aplicația nu avea de unde ști cine a semnat. Diferența dintre „a semnat"
-- și „e în aplicație" era singura listă care spunea pe cine mai trebuie introdus.
--
-- Campania e ÎNCHEIATĂ din iunie, deci tabelul ăsta e o arhivă, nu o copie care se
-- învechește: rândurile nu se mai schimbă. Ce se schimbă — dacă omul a ajuns sau nu în
-- sezonul nou — se citește LIVE din enrollments la fiecare interogare, nu se stochează.
--
-- Potrivirea nume Excel ↔ fișă CRM s-a făcut o singură dată, offline (235 exacte,
-- 68 pe al doilea prenume, 8 cu ortografie diferită, 2 prin steagul de promo, 5 ambigue
-- rezolvate manual). `potrivire` păstrează cât de sigură e legătura, ca să se vadă în UI.

create table if not exists public.reinscrieri_semnate (
  id             uuid primary key default gen_random_uuid(),
  sezon_id       uuid not null references public.sezoane(id) on delete cascade,
  client         uuid references public.clienti(id) on delete set null,
  nume_excel     text not null,
  locatie_excel  text not null,
  grupe_excel    text[] not null default '{}',
  -- exact | fuzzy (al doilea prenume) | aprox (ortografie) | promo (legat prin steag) | ambiguu
  potrivire      text not null default 'exact',
  -- fișa duplicat respinsă la potrivire (ca să se știe că omul are două fișe în CRM)
  dublura_nume   text,
  created        timestamptz not null default now(),
  unique (sezon_id, locatie_excel, nume_excel)
);

create index if not exists reinscrieri_semnate_sezon_idx on public.reinscrieri_semnate (sezon_id);
create index if not exists reinscrieri_semnate_client_idx on public.reinscrieri_semnate (client);

alter table public.reinscrieri_semnate enable row level security;

drop policy if exists reinscrieri_semnate_all on public.reinscrieri_semnate;
create policy reinscrieri_semnate_all on public.reinscrieri_semnate
  for all to authenticated using (true) with check (true);

-- Gard părinte: portalul de membri nu atinge direct niciun tabel de staff.
drop policy if exists deny_parinte_direct on public.reinscrieri_semnate;
create policy deny_parinte_direct on public.reinscrieri_semnate as restrictive for all to authenticated
  using ((select auth_role()) <> 'parinte') with check ((select auth_role()) <> 'parinte');

-- Gard marketing: agenția externă de ads n-are ce căuta în lista de reînscrieri.
drop policy if exists deny_marketing_direct on public.reinscrieri_semnate;
create policy deny_marketing_direct on public.reinscrieri_semnate as restrictive for all to authenticated
  using ((select auth_role()) <> 'marketing') with check ((select auth_role()) <> 'marketing');

-- ============================================================================
-- Secțiunea „Reînscrieri semnate": cine a semnat și unde a ajuns.
-- `inrolat` NU e stocat — se calculează la fiecare apel, ca lista să se golească
-- singură pe măsură ce recepția introduce oamenii.
-- ============================================================================
create or replace function public.get_start_sezon_reinscrieri(p_sezon uuid)
returns table (
  client_id     uuid,
  nume          text,
  nume_excel    text,
  locatie_excel text,
  grupe_excel   text,
  potrivire     text,
  dublura_nume  text,
  status        text,
  inrolat       boolean,
  cursuri_noi   text
)
language plpgsql
stable
security invoker
set search_path = public
set plan_cache_mode = force_custom_plan
as $$
begin
  return query
  with e_nou as (
    select distinct e.client, e.cursul
    from enrollments e
    where e.sezon_id = p_sezon and e.data_reziliere is null
  )
  select
    rs.client,
    coalesce(nullif(trim(concat_ws(' ', cl.prenume, cl.nume)), ''), rs.nume_excel),
    rs.nume_excel,
    rs.locatie_excel,
    array_to_string(rs.grupe_excel, ', '),
    rs.potrivire,
    rs.dublura_nume,
    cl.status::text,
    exists (select 1 from e_nou en where en.client = rs.client),
    (select string_agg(distinct c2.numele::text, ', ' order by c2.numele::text)
       from e_nou en2 join cursuri c2 on c2.id = en2.cursul
      where en2.client = rs.client)
  from reinscrieri_semnate rs
  left join clienti cl on cl.id = rs.client
  where rs.sezon_id = p_sezon
  order by rs.locatie_excel, rs.nume_excel;
end;
$$;

-- ============================================================================
-- Sumarul: adaug cele două cifre ale campaniei (semnate / dintre ele lipsă).
-- ============================================================================
drop function if exists public.get_start_sezon_sumar(uuid);
create function public.get_start_sezon_sumar(p_sezon uuid)
returns table (
  inrolari        integer,
  grupe_total     integer,
  grupe_active    integer,
  pool_total      integer,
  pool_revenit    integer,
  clienti_noi     integer,
  reinscrieri     integer,
  semnate_total   integer,
  semnate_lipsa   integer
)
language plpgsql
stable
security invoker
set search_path = public
set plan_cache_mode = force_custom_plan
as $$
declare
  v_start date;
  v_hist  date;
begin
  select s.data_incepere into v_start from sezoane s where s.id = p_sezon;
  if v_start is null then return; end if;
  v_hist := date_trunc('month', v_start)::date;

  return query
  with e_nou as (
    select distinct e.client, e.cursul
    from enrollments e
    where e.sezon_id = p_sezon
      and e.data_reziliere is null
  ),
  cli_nou as (select distinct client from e_nou),
  pool as (
    select distinct e.client
    from enrollments e
    where e.sezon_id is distinct from p_sezon
      and e.suma > 0
      and e.data_reziliere is null
      and e.data_incepere >= (date_trunc('month', v_start) - interval '5 months')::date
      and e.data_incepere < v_start
  ),
  istoric as (
    select distinct c.id as client
    from clienti c
    where c.id in (select client from cli_nou)
      and (
        c.old_user_id is not null
        or exists (select 1 from enrollments e2
                    where e2.client = c.id and e2.sezon_id is distinct from p_sezon)
        or exists (select 1 from incasari i where i.client = c.id and i.data < v_hist)
        or exists (select 1 from prezente p where p.client = c.id and p.data < v_hist)
      )
  )
  select
    (select count(*)::integer from e_nou),
    (select count(*)::integer from cursuri c where c.sezon = p_sezon),
    (select count(distinct cursul)::integer from e_nou),
    (select count(*)::integer from pool),
    (select count(*)::integer from pool p where p.client in (select client from cli_nou)),
    (select count(*)::integer from cli_nou where client not in (select client from istoric)),
    (select count(distinct e.client)::integer from enrollments e
      where e.sezon_id = p_sezon and e.este_reinscriere and e.data_reziliere is null),
    (select count(*)::integer from reinscrieri_semnate rs where rs.sezon_id = p_sezon),
    (select count(*)::integer from reinscrieri_semnate rs
      where rs.sezon_id = p_sezon
        and not exists (select 1 from cli_nou cn where cn.client = rs.client));
end;
$$;

-- ============================================================================
-- „Cine nu s-a întors": adaug locațiile, ca lista să poată fi filtrată pe sală.
-- ============================================================================
drop function if exists public.get_start_sezon_nerevenit(uuid);
create function public.get_start_sezon_nerevenit(p_sezon uuid)
returns table (
  client_id     uuid,
  nume          text,
  prenume       text,
  telefon       text,
  status        text,
  grupe         text,
  locatii       text,
  ultima_luna   date,
  suma_sezon    numeric,
  semnase       boolean
)
language plpgsql
stable
security invoker
set search_path = public
set plan_cache_mode = force_custom_plan
as $$
declare
  v_start date;
begin
  select s.data_incepere into v_start from sezoane s where s.id = p_sezon;
  if v_start is null then return; end if;

  return query
  with cli_nou as (
    select distinct e.client
    from enrollments e
    where e.sezon_id = p_sezon and e.data_reziliere is null
  ),
  pool as (
    select e.client, e.cursul, e.data_incepere, e.suma
    from enrollments e
    where e.sezon_id is distinct from p_sezon
      and e.suma > 0
      and e.data_reziliere is null
      and e.data_incepere >= (date_trunc('month', v_start) - interval '5 months')::date
      and e.data_incepere < v_start
      and e.client not in (select client from cli_nou)
  )
  select
    cl.id,
    cl.nume::text,
    cl.prenume::text,
    cl.telefon::text,
    cl.status::text,
    (select string_agg(distinct c2.numele::text, ', ' order by c2.numele::text)
       from pool p2 join cursuri c2 on c2.id = p2.cursul
      where p2.client = cl.id),
    (select string_agg(distinct coalesce(l2.nume::text, '(fără locație)'), ', '
              order by coalesce(l2.nume::text, '(fără locație)'))
       from pool p3
       join cursuri c3 on c3.id = p3.cursul
       left join locatii l2 on l2.id = c3.locatie
      where p3.client = cl.id),
    max(p.data_incepere),
    sum(p.suma),
    exists (select 1 from reinscrieri_semnate rs
             where rs.sezon_id = p_sezon and rs.client = cl.id)
  from pool p
  join clienti cl on cl.id = p.client
  group by cl.id, cl.nume, cl.prenume, cl.telefon, cl.status
  order by max(p.data_incepere) desc, cl.nume;
end;
$$;

revoke execute on function public.get_start_sezon_reinscrieri(uuid) from anon, public;
revoke execute on function public.get_start_sezon_sumar(uuid)       from anon, public;
revoke execute on function public.get_start_sezon_nerevenit(uuid)   from anon, public;

grant execute on function public.get_start_sezon_reinscrieri(uuid) to authenticated;
grant execute on function public.get_start_sezon_sumar(uuid)       to authenticated;
grant execute on function public.get_start_sezon_nerevenit(uuid)   to authenticated;
