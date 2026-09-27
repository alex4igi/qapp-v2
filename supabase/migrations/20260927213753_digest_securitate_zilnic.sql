-- Faza 4 securizare: digest zilnic de securitate pe email (owner/admin).
-- Înlocuiește log drains (plătite): cron-morning cheamă `digest_securitate_zilnic()`
-- și trimite emailul doar când e ceva de văzut.

-- Plafonul trebuie să știe ce limită a avut fereastra, altfel „blocat" nu se poate
-- deosebi de „trafic mare" după ce cererea a trecut.
alter table rate_limit_hits add column if not exists limita integer;

create or replace function rate_limit_hit(
  p_cheie text,
  p_fereastra_sec integer,
  p_limita integer
) returns table (permis boolean, n integer, reseteaza_la timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start timestamptz;
  v_n integer;
begin
  if p_fereastra_sec <= 0 or p_limita <= 0 then
    raise exception 'fereastră și limită trebuie să fie pozitive';
  end if;

  v_start := to_timestamp(
    floor(extract(epoch from now()) / p_fereastra_sec) * p_fereastra_sec
  );

  insert into rate_limit_hits as r (cheie, fereastra, n, limita)
  values (p_cheie, v_start, 1, p_limita)
  on conflict (cheie, fereastra) do update set n = r.n + 1, limita = excluded.limita
  returning r.n into v_n;

  return query
    select v_n <= p_limita, v_n, v_start + make_interval(secs => p_fereastra_sec);
end;
$$;

revoke execute on function rate_limit_hit(text, integer, integer) from anon, authenticated, public;
grant execute on function rate_limit_hit(text, integer, integer) to service_role;

-- Un rând pe zi. Ține istoria (rate_limit_hits se șterge după o zi) și face digestul
-- idempotent: cron-morning rulează de două ori (07 și 08).
create table if not exists securitate_digest (
  zi        date        primary key,
  creat     timestamptz not null default now(),
  continut  jsonb       not null,
  de_trimis boolean     not null,
  trimis_la timestamptz
);

alter table securitate_digest enable row level security;
revoke all on table securitate_digest from anon, authenticated, public;
grant all on table securitate_digest to service_role;

create policy deny_parinte_direct on securitate_digest as restrictive for all to authenticated
  using ((select auth_role()) <> 'parinte') with check ((select auth_role()) <> 'parinte');
create policy deny_marketing_direct on securitate_digest as restrictive for all to authenticated
  using ((select auth_role()) <> 'marketing') with check ((select auth_role()) <> 'marketing');
create policy deny_teacher_direct on securitate_digest as restrictive for all to authenticated
  using ((select auth_role()) <> 'teacher') with check ((select auth_role()) <> 'teacher');

create or replace function digest_securitate_zilnic()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_zi date := (now() at time zone 'Europe/Bucharest')::date;
  v_de_la timestamptz := now() - interval '24 hours';
  v_existent securitate_digest;
  v_admini jsonb;
  v_admini_ieri jsonb;
  v_plafoane jsonb;
  v_portal jsonb;
  v_staff_nou jsonb;
  v_netopia jsonb;
  v_bani jsonb;
  v_continut jsonb;
  v_de_trimis boolean;
begin
  select * into v_existent from securitate_digest where zi = v_zi;
  if found then
    return v_existent.continut || jsonb_build_object('zi', v_zi, 'de_trimis', v_existent.de_trimis and v_existent.trimis_la is null);
  end if;

  select coalesce(jsonb_agg(email order by email), '[]'::jsonb) into v_admini
  from auth.users where raw_app_meta_data->>'role' in ('owner', 'admin');

  select continut->'admini' into v_admini_ieri
  from securitate_digest where zi < v_zi order by zi desc limit 1;

  select coalesce(jsonb_agg(p order by (p->>'refuzate')::int desc), '[]'::jsonb) into v_plafoane
  from (
    select jsonb_build_object(
      'actiune', split_part(cheie, ':', 1),
      'cheie', substr(cheie, length(split_part(cheie, ':', 1)) + 2),
      'refuzate', sum(n - limita),
      'ferestre', count(*)
    ) p
    from rate_limit_hits
    where fereastra >= v_de_la and limita is not null and n > limita
    group by cheie
    order by sum(n - limita) desc
    limit 20
  ) s;

  select jsonb_build_object(
    'blocate', count(*) filter (where locked_until >= v_de_la),
    'cu_esecuri', count(*) filter (where failed_attempts >= 3),
    'conturi', coalesce(jsonb_agg(jsonb_build_object(
        'email', email, 'esecuri', failed_attempts, 'blocat_pana', locked_until))
      filter (where locked_until >= v_de_la or failed_attempts >= 3), '[]'::jsonb)
  ) into v_portal
  from portal_accounts;

  select coalesce(jsonb_agg(jsonb_build_object(
      'email', email, 'rol', raw_app_meta_data->>'role', 'creat', created_at)), '[]'::jsonb)
  into v_staff_nou
  from auth.users
  where created_at >= v_de_la
    and coalesce(raw_app_meta_data->>'role', '') <> 'parinte';

  select coalesce(jsonb_agg(jsonb_build_object(
      'order_ref', order_ref, 'suma', amount, 'status', status, 'creat', created)
      order by created), '[]'::jsonb)
  into v_netopia
  from netopia_orders
  where status not in ('confirmed', 'canceled')
    and created < now() - interval '30 minutes';

  select coalesce(jsonb_agg(jsonb_build_object('actiune', action, 'cine', cine, 'n', n)
      order by action, n desc), '[]'::jsonb)
  into v_bani
  from (
    select a.action, coalesce(u.email, a.actor_role) cine, count(*) n
    from audit_log a
    left join auth.users u on u.id = a.actor_id
    where a.created >= v_de_la
      and a.action in ('incasare_modified', 'incasare_deleted', 'incasare_moved', 'datorie_deleted')
    group by 1, 2
  ) b;

  v_continut := jsonb_build_object(
    'de_la', v_de_la,
    'admini', v_admini,
    'admini_adaugati', coalesce((select jsonb_agg(e) from jsonb_array_elements_text(v_admini) e
                                 where v_admini_ieri is not null and not v_admini_ieri ? e), '[]'::jsonb),
    'admini_scosi', coalesce((select jsonb_agg(e) from jsonb_array_elements_text(v_admini_ieri) e
                              where not v_admini ? e), '[]'::jsonb),
    'plafoane', v_plafoane,
    'portal', v_portal,
    'staff_nou', v_staff_nou,
    'netopia_blocate', v_netopia,
    'bani', v_bani
  );

  -- Modificările de încasări sunt zilnice și au deja motiv în audit_log: apar în email,
  -- dar singure nu-l declanșează. Ștergerile, da.
  v_de_trimis :=
       jsonb_array_length(v_continut->'admini_adaugati') > 0
    or jsonb_array_length(v_continut->'admini_scosi') > 0
    or jsonb_array_length(v_plafoane) > 0
    or (v_portal->>'blocate')::int > 0
    or jsonb_array_length(v_staff_nou) > 0
    or jsonb_array_length(v_netopia) > 0
    or exists (select 1 from jsonb_array_elements(v_bani) b
               where b->>'actiune' in ('incasare_deleted', 'datorie_deleted'));

  insert into securitate_digest (zi, continut, de_trimis) values (v_zi, v_continut, v_de_trimis);

  -- Conține emailuri și IP-uri; 90 de zile ajung pentru o anchetă.
  delete from securitate_digest where zi < v_zi - 90;

  return v_continut || jsonb_build_object('zi', v_zi, 'de_trimis', v_de_trimis);
end;
$$;

revoke execute on function digest_securitate_zilnic() from anon, authenticated, public;
grant execute on function digest_securitate_zilnic() to service_role;
