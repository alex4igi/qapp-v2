-- Rețeaua (IP-ul public) unei locații → aplicația pune singură locația de lucru.
-- 4 oct. 2026: un OPEN de la Ștefan plătit cash la Nicolina s-a înregistrat la Ștefan,
-- pentru că bara de sus rămăsese pe Ștefan. Recepția (Theodora) lucrează din două locații,
-- deci locația nu se poate fixa pe cont; rețeaua o știe. E o comoditate, nu o gardă de
-- securitate: un IP lipsă sau schimbat doar lasă bara cum e.

create table public.locatii_retele (
  id       uuid primary key default gen_random_uuid(),
  ip       inet not null unique,
  locatie  uuid not null references public.locatii(id) on delete cascade,
  eticheta text,
  created  timestamptz not null default now()
);

-- Doar prin funcțiile de mai jos (security definer).
alter table public.locatii_retele enable row level security;
revoke all on public.locatii_retele from anon, authenticated, public;
grant all on public.locatii_retele to service_role;

create policy deny_parinte_direct on public.locatii_retele as restrictive for all to authenticated
  using ((select auth_role()) <> 'parinte') with check ((select auth_role()) <> 'parinte');
create policy deny_marketing_direct on public.locatii_retele as restrictive for all to authenticated
  using ((select auth_role()) <> 'marketing') with check ((select auth_role()) <> 'marketing');
create policy deny_teacher_direct on public.locatii_retele as restrictive for all to authenticated
  using ((select auth_role()) <> 'teacher') with check ((select auth_role()) <> 'teacher');

-- IP-ul celui care cheamă, din headerele cererii (PostgREST le pune în `request.headers`).
-- `cf-connecting-ip` îl scrie Cloudflare; x-forwarded-for e rezerva.
create or replace function public._ip_apelant()
returns inet
language plpgsql stable
set search_path = public
as $$
declare
  h   json := nullif(current_setting('request.headers', true), '')::json;
  raw text := coalesce(
    nullif(h ->> 'cf-connecting-ip', ''),
    nullif(btrim(split_part(coalesce(h ->> 'x-forwarded-for', ''), ',', 1)), ''),
    nullif(h ->> 'x-real-ip', '')
  );
begin
  return raw::inet;
exception when others then
  return null;
end;
$$;

revoke execute on function public._ip_apelant() from anon, authenticated, public;

create or replace function public.locatia_retelei()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_ip  inet := _ip_apelant();
  v_loc uuid;
begin
  if (select auth_role()) in ('parinte', 'marketing') then
    raise exception 'Acces refuzat.' using errcode = '42501';
  end if;
  select r.locatie into v_loc from locatii_retele r where r.ip = v_ip;
  return jsonb_build_object('ip', host(v_ip), 'locatie_id', v_loc);
end;
$$;

revoke execute on function public.locatia_retelei() from anon, public;
grant execute on function public.locatia_retelei() to authenticated;

create or replace function public.lista_retele_locatii()
returns table (ip text, locatie uuid, locatie_nume text, eticheta text, created timestamptz)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if (select auth_role()) not in ('owner', 'admin') then
    raise exception 'Doar adminii pot vedea rețelele locațiilor.' using errcode = '42501';
  end if;
  return query
    select host(r.ip), r.locatie, l.nume, r.eticheta, r.created
    from locatii_retele r join locatii l on l.id = r.locatie
    order by l.nume, r.created;
end;
$$;

revoke execute on function public.lista_retele_locatii() from anon, public;
grant execute on function public.lista_retele_locatii() to authenticated;

-- Asociază rețeaua de pe care se face cererea (adminul stă fizic la locație).
create or replace function public.asociaza_reteaua_curenta(p_locatie uuid, p_eticheta text default null)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  v_ip inet := _ip_apelant();
begin
  if (select auth_role()) not in ('owner', 'admin') then
    raise exception 'Doar adminii pot asocia rețele cu locațiile.' using errcode = '42501';
  end if;
  if v_ip is null then
    raise exception 'Nu pot afla IP-ul rețelei de acum.';
  end if;
  insert into locatii_retele (ip, locatie, eticheta)
  values (v_ip, p_locatie, nullif(btrim(coalesce(p_eticheta, '')), ''))
  on conflict (ip) do update set locatie = excluded.locatie, eticheta = excluded.eticheta;
  return host(v_ip);
end;
$$;

revoke execute on function public.asociaza_reteaua_curenta(uuid, text) from anon, public;
grant execute on function public.asociaza_reteaua_curenta(uuid, text) to authenticated;

create or replace function public.sterge_retea_locatie(p_ip text)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if (select auth_role()) not in ('owner', 'admin') then
    raise exception 'Doar adminii pot șterge rețele.' using errcode = '42501';
  end if;
  delete from locatii_retele where ip = p_ip::inet;
end;
$$;

revoke execute on function public.sterge_retea_locatie(text) from anon, public;
grant execute on function public.sterge_retea_locatie(text) to authenticated;

-- Rețelele văzute în jurnalele Supabase 26 sept. – 4 oct. 2026, stabile toată săptămâna.
insert into public.locatii_retele (ip, locatie, eticheta) values
  ('82.78.198.128', 'a30ee81c-6700-5da8-a1af-e755528ee348', 'RCS Business — recepția Ștefan'),
  ('46.97.170.240', 'e42edabe-f295-532d-9628-989480a28044', 'Vodafone — recepția Nicolina');
