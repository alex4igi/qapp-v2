-- Măsurarea utilizării aplicației (Alex, 30.09.2026): ce pagini se deschid și ce butoane se
-- apasă, pe rol, ca la finalul sezonului să simplificăm aplicația (butoane nefolosite = candidați
-- la eliminare, citiți cu calendarul în față — reînscrierile din primăvară nu apar în octombrie).
--
-- Decizii Alex:
--   * contoare pe zi × rol × pagină × buton, FĂRĂ id de utilizator — statistică de folosire, nu
--     monitorizarea unui om;
--   * concluzii lunare: la 1 ale lunii, luna trecută se rezumă în `utilizare_luna`, iar detaliul
--     zilnic mai vechi de luna trecută se șterge (baza de date se eliberează treptat);
--   * colectarea se oprește singură la finalul sezonului (`utilizare_config.activ_pana_la`).
--
-- Clientul adună clicurile în memorie și trimite un lot la ~30 s; rolul îl ia serverul din token,
-- nu din lot.

-- ============================================================
-- 1) Configurarea (un singur rând) — comutatorul fără redeploy
-- ============================================================
create table public.utilizare_config (
  id             boolean primary key default true check (id),
  activ_pana_la  date not null,
  -- Conturi ale căror clicuri nu sunt utilizare reală (contul de test al lui Claude).
  exclusi        uuid[] not null default '{}',
  updated        timestamptz not null default now()
);

insert into public.utilizare_config (activ_pana_la, exclusi)
values ('2027-06-30', array['afd6e05a-07e0-43c8-8200-68eeb7666ffe']::uuid[]);

-- ============================================================
-- 2) Contoarele
-- ============================================================
-- `tinta` = '' pentru o deschidere de pagină; pentru un clic, eticheta butonului curățată de
-- cifre și nume proprii (vezi src/lib/utilizare.ts).
create table public.utilizare_zi (
  zi        date not null,
  rol       text not null,
  varianta  text not null check (varianta in ('desktop', 'mobil')),
  ruta      text not null check (length(ruta) <= 100),
  tip       text not null check (tip in ('pagina', 'clic')),
  tinta     text not null default '' check (length(tinta) <= 160),
  n         integer not null check (n > 0),
  primary key (zi, rol, varianta, ruta, tip, tinta)
);

create table public.utilizare_luna (
  luna      date not null check (luna = date_trunc('month', luna)::date),
  rol       text not null,
  varianta  text not null,
  ruta      text not null,
  tip       text not null,
  tinta     text not null default '',
  n         integer not null,
  -- În câte zile din lună a apărut: 30 de clicuri într-o zi ≠ un clic pe zi.
  zile      smallint not null,
  primary key (luna, rol, varianta, ruta, tip, tinta)
);

-- ============================================================
-- 3) RLS, granturi, gărzi (AGENTS.md)
-- ============================================================
-- Scrierea trece doar prin RPC-urile de mai jos (security definer); citirea e a owner/admin.
alter table public.utilizare_config enable row level security;
alter table public.utilizare_zi enable row level security;
alter table public.utilizare_luna enable row level security;

revoke all on public.utilizare_config, public.utilizare_zi, public.utilizare_luna
  from anon, authenticated, public;
grant select on public.utilizare_config, public.utilizare_zi, public.utilizare_luna to authenticated;
grant all on public.utilizare_config, public.utilizare_zi, public.utilizare_luna to service_role;

do $$
declare
  t text;
begin
  foreach t in array array['utilizare_config', 'utilizare_zi', 'utilizare_luna'] loop
    execute format(
      'create policy %I on public.%I for select to authenticated
         using ((select auth_role()) in (''owner'', ''admin''))', t || '_select', t);
    execute format(
      'create policy deny_parinte_direct on public.%I as restrictive for all to authenticated
         using ((select auth_role()) <> ''parinte'') with check ((select auth_role()) <> ''parinte'')', t);
    execute format(
      'create policy deny_marketing_direct on public.%I as restrictive for all to authenticated
         using ((select auth_role()) <> ''marketing'') with check ((select auth_role()) <> ''marketing'')', t);
    execute format(
      'create policy deny_teacher_direct on public.%I as restrictive for all to authenticated
         using ((select auth_role()) <> ''teacher'') with check ((select auth_role()) <> ''teacher'')', t);
  end loop;
end $$;

-- ============================================================
-- 4) Înregistrarea unui lot (o cheamă aplicația de staff, toate rolurile ei)
-- ============================================================
-- Întoarce false când colectarea e oprită sau contul e exclus — clientul se oprește atunci
-- pentru restul sesiunii. Elementele invalide se sar în tăcere: e statistică, nu contabilitate.
create or replace function public.inregistreaza_utilizare(p_lot jsonb)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_rol text := (select auth_role());
  v_cfg utilizare_config;
  v_zi  date := (now() at time zone 'Europe/Bucharest')::date;
begin
  if v_rol = 'parinte' or auth.uid() is null then
    raise exception 'Acces refuzat.' using errcode = '42501';
  end if;

  select * into v_cfg from utilizare_config;
  if v_cfg is null or v_zi > v_cfg.activ_pana_la or auth.uid() = any(v_cfg.exclusi) then
    return false;
  end if;

  if jsonb_typeof(p_lot) <> 'array' or jsonb_array_length(p_lot) > 500 then
    return true;
  end if;

  insert into utilizare_zi as u (zi, rol, varianta, ruta, tip, tinta, n)
  select v_zi, v_rol, v, r, t, g, sum(n)::int
    from (
      -- Castul numărului stă în CASE: Postgres nu garantează ordinea condițiilor din WHERE.
      select e->>'v' as v, e->>'r' as r, e->>'t' as t, coalesce(e->>'g', '') as g,
             case when jsonb_typeof(e->'n') = 'number' then (e->>'n')::numeric end as n
        from jsonb_array_elements(p_lot) e
       where jsonb_typeof(e) = 'object'
    ) x
   where v in ('desktop', 'mobil')
     and t in ('pagina', 'clic')
     and length(r) between 1 and 100
     and length(g) <= 160
     and n between 1 and 1000
     and n = trunc(n)
   group by 1, 2, 3, 4, 5, 6
  on conflict (zi, rol, varianta, ruta, tip, tinta) do update set n = u.n + excluded.n;

  return true;
end;
$$;

revoke execute on function public.inregistreaza_utilizare(jsonb) from anon, public;
grant execute on function public.inregistreaza_utilizare(jsonb) to authenticated;

-- ============================================================
-- 5) Rezumatul lunar (cron, 1 ale lunii)
-- ============================================================
-- Rezumă TOATE lunile încheiate care mai au detaliu zilnic (dacă o rulare a căzut, luna ei se
-- prinde data viitoare), apoi șterge detaliul zilnic mai vechi de luna trecută. Detaliul se
-- șterge doar după rezumat, deci o lună rezumată are mereu toate zilele ei → upsert idempotent.
create or replace function public.utilizare_rezumat_lunar()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_luna_curenta date := date_trunc('month', (now() at time zone 'Europe/Bucharest')::date)::date;
  v_sterse integer;
begin
  insert into utilizare_luna as l (luna, rol, varianta, ruta, tip, tinta, n, zile)
  select date_trunc('month', zi)::date, rol, varianta, ruta, tip, tinta, sum(n), count(distinct zi)
    from utilizare_zi
   where zi < v_luna_curenta
   group by 1, 2, 3, 4, 5, 6
  on conflict (luna, rol, varianta, ruta, tip, tinta)
    do update set n = excluded.n, zile = excluded.zile;

  delete from utilizare_zi where zi < (v_luna_curenta - interval '1 month')::date;
  get diagnostics v_sterse = row_count;
  return v_sterse;
end;
$$;

revoke execute on function public.utilizare_rezumat_lunar() from anon, authenticated, public;
grant execute on function public.utilizare_rezumat_lunar() to service_role;

select cron.unschedule('utilizare-rezumat-lunar')
where exists (select 1 from cron.job where jobname = 'utilizare-rezumat-lunar');

-- 01:30 UTC = 03:30–04:30 la Iași, după miezul nopții în orice anotimp.
select cron.schedule(
  'utilizare-rezumat-lunar',
  '30 1 1 * *',
  $$select utilizare_rezumat_lunar();$$
);

-- ============================================================
-- 6) Raportul (pagina /utilizare, owner/admin)
-- ============================================================
-- Un singur jsonb, nu setof: raportul unei luni trece ușor de plafonul de 1000 de rânduri al API-ului.
-- Luna: din `utilizare_luna` dacă e rezumată, altfel din detaliul zilnic. Ziua: doar detaliul
-- zilnic (luna curentă și cea trecută). Security invoker: RLS-ul de citire (owner/admin) decide.
create or replace function public.raport_utilizare(p_de_la date, p_pana_la date)
returns jsonb
language sql stable security invoker set search_path = public
as $$
  with rezumate as (
    select * from utilizare_luna
     where luna >= date_trunc('month', p_de_la)::date and luna <= p_pana_la
       and p_de_la = date_trunc('month', p_de_la)::date
       and p_pana_la = (date_trunc('month', p_de_la) + interval '1 month - 1 day')::date
  ),
  randuri as (
    select rol, varianta, ruta, tip, tinta, n::bigint as n, zile::bigint as zile from rezumate
    union all
    select rol, varianta, ruta, tip, tinta, sum(n), count(distinct zi)
      from utilizare_zi
     where zi between p_de_la and p_pana_la
       and not exists (select 1 from rezumate)
     group by rol, varianta, ruta, tip, tinta
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'rol', rol, 'varianta', varianta, 'ruta', ruta, 'tip', tip,
           'tinta', tinta, 'n', n, 'zile', zile)), '[]'::jsonb)
    from randuri;
$$;

revoke execute on function public.raport_utilizare(date, date) from anon, public;
grant execute on function public.raport_utilizare(date, date) to authenticated;

-- Lunile/zilele pentru care există date — pentru selectorul din pagină.
create or replace function public.utilizare_perioade()
returns jsonb
language sql stable security invoker set search_path = public
as $$
  select jsonb_build_object(
    'luni', coalesce((select jsonb_agg(distinct luna) from (
               select luna from utilizare_luna
               union select date_trunc('month', zi)::date from utilizare_zi) x), '[]'::jsonb),
    'zile', coalesce((select jsonb_agg(distinct zi) from utilizare_zi), '[]'::jsonb),
    'activ_pana_la', (select activ_pana_la from utilizare_config)
  );
$$;

revoke execute on function public.utilizare_perioade() from anon, public;
grant execute on function public.utilizare_perioade() to authenticated;
