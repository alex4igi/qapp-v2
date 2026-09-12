-- Qapp v2 — corecții la raportul „Start de sezon" (migrația 20260913080000).
--
-- 1. `clienti.status` e enum `status_client`, nu text — plpgsql refuza rândul întors
--    („structure of query does not match function result type").
-- 2. Pragul de „urmă anterioară" era startul sezonului (12 septembrie). Dar ratele
--    sezonului nou se încasează ÎNAINTE de start — cine plătea pe 5 septembrie își
--    crea singur o „urmă" și ieșea din categoria „client complet nou". Pragul corect
--    e începutul lunii de start: activitatea din luna în care începe sezonul e parte
--    din înscriere, nu istoric. (28 → 45 de clienți complet noi.)

create or replace function public.get_start_sezon_sumar(p_sezon uuid)
returns table (
  inrolari        integer,
  grupe_total     integer,
  grupe_active    integer,
  pool_total      integer,
  pool_revenit    integer,
  clienti_noi     integer,
  reinscrieri     integer
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
      where e.sezon_id = p_sezon and e.este_reinscriere and e.data_reziliere is null);
end;
$$;

create or replace function public.get_start_sezon_nerevenit(p_sezon uuid)
returns table (
  client_id     uuid,
  nume          text,
  prenume       text,
  telefon       text,
  status        text,
  grupe         text,
  ultima_luna   date,
  suma_sezon    numeric
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
    max(p.data_incepere),
    sum(p.suma)
  from pool p
  join clienti cl on cl.id = p.client
  group by cl.id, cl.nume, cl.prenume, cl.telefon, cl.status
  order by max(p.data_incepere) desc, cl.nume;
end;
$$;

create or replace function public.get_start_sezon_noi(p_sezon uuid)
returns table (
  client_id    uuid,
  nume         text,
  prenume      text,
  telefon      text,
  fisa_creata  date,
  cursuri      text
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
    where e.sezon_id = p_sezon and e.data_reziliere is null
  )
  select
    cl.id,
    cl.nume::text,
    cl.prenume::text,
    cl.telefon::text,
    (cl.created at time zone 'Europe/Bucharest')::date,
    (select string_agg(distinct c2.numele::text, ', ' order by c2.numele::text)
       from e_nou en2 join cursuri c2 on c2.id = en2.cursul
      where en2.client = cl.id)
  from clienti cl
  where cl.id in (select client from e_nou)
    and cl.old_user_id is null
    and not exists (select 1 from enrollments e2
                     where e2.client = cl.id and e2.sezon_id is distinct from p_sezon)
    and not exists (select 1 from incasari i where i.client = cl.id and i.data < v_hist)
    and not exists (select 1 from prezente p where p.client = cl.id and p.data < v_hist)
  order by cl.created desc, cl.nume;
end;
$$;

create or replace function public.get_start_sezon_roster(p_sezon uuid)
returns table (
  curs_id       uuid,
  curs_nume     text,
  locatie_nume  text,
  teacher_nume  text,
  facultativ    boolean,
  capacitate    integer,
  inscrisi      integer,
  cat_r         integer,
  cat_s         integer,
  cat_v         integer,
  cat_n         integer
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
    where e.sezon_id = p_sezon and e.data_reziliere is null
  ),
  cli_nou as (select distinct client from e_nou),
  reinsc as (
    select distinct e.client
    from enrollments e
    where e.sezon_id = p_sezon and e.este_reinscriere and e.data_reziliere is null
  ),
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
    select cl.id as client
    from clienti cl
    where cl.id in (select client from cli_nou)
      and (
        cl.old_user_id is not null
        or exists (select 1 from enrollments e2
                    where e2.client = cl.id and e2.sezon_id is distinct from p_sezon)
        or exists (select 1 from incasari i where i.client = cl.id and i.data < v_hist)
        or exists (select 1 from prezente p where p.client = cl.id and p.data < v_hist)
      )
  ),
  cat as (
    select
      en.cursul,
      en.client,
      case
        when en.client in (select client from reinsc)  then 'R'
        when en.client in (select client from pool)    then 'S'
        when en.client in (select client from istoric) then 'V'
        else 'N'
      end as k
    from e_nou en
  )
  select
    c.id,
    c.numele::text,
    coalesce(l.nume::text, '(fără locație)'),
    coalesce(nullif(trim(concat_ws(' ', t.prenume, t.nume)), ''), '(fără teacher)'),
    c.facultativ,
    c.capacitate_maxima,
    coalesce(count(cat.client), 0)::integer,
    coalesce(count(*) filter (where cat.k = 'R'), 0)::integer,
    coalesce(count(*) filter (where cat.k = 'S'), 0)::integer,
    coalesce(count(*) filter (where cat.k = 'V'), 0)::integer,
    coalesce(count(*) filter (where cat.k = 'N'), 0)::integer
  from cursuri c
  left join cat on cat.cursul = c.id
  left join locatii l on l.id = c.locatie
  left join teacheri t on t.id = c.teacher
  where c.sezon = p_sezon
  group by c.id, c.numele, l.nume, t.prenume, t.nume, c.facultativ, c.capacitate_maxima
  order by coalesce(l.nume::text, 'zzz'),
           coalesce(nullif(trim(concat_ws(' ', t.prenume, t.nume)), ''), 'zzz'),
           c.numele;
end;
$$;

revoke execute on function public.get_start_sezon_sumar(uuid)     from anon, public;
revoke execute on function public.get_start_sezon_nerevenit(uuid) from anon, public;
revoke execute on function public.get_start_sezon_noi(uuid)       from anon, public;
revoke execute on function public.get_start_sezon_roster(uuid)    from anon, public;

grant execute on function public.get_start_sezon_sumar(uuid)     to authenticated;
grant execute on function public.get_start_sezon_nerevenit(uuid) to authenticated;
grant execute on function public.get_start_sezon_noi(uuid)       to authenticated;
grant execute on function public.get_start_sezon_roster(uuid)    to authenticated;
