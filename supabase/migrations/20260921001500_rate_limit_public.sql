-- Limitator de cereri pentru endpoint-urile publice de pe supabase.co (intake, pagina
-- de contract, login portal, inițiere plată). Fereastră fixă: un rând per
-- (cheie, fereastră), incrementat ATOMIC — citire-apoi-scriere ar pierde cereri simultane.
--
-- Cheia de IP e `cf-connecting-ip`, nu prima valoare din `x-forwarded-for`. Măsurat pe
-- 21 sept. 2026 pe o funcție publicată: Supabase stă în spatele Cloudflare, care
-- rescrie complet XFF (o valoare trimisă de client dispare) și respinge cu 403 orice
-- cerere care încearcă să-și pună singură `cf-connecting-ip`. Deci IP-ul nu e falsificabil.

create table if not exists rate_limit_hits (
  cheie     text        not null,
  fereastra timestamptz not null,
  n         integer     not null default 0,
  primary key (cheie, fereastra)
);

create index if not exists idx_rate_limit_hits_fereastra on rate_limit_hits (fereastra);

alter table rate_limit_hits enable row level security;

-- Tabelul e exclusiv al edge functions (service_role). Nimeni altcineva nu-l atinge.
revoke all on table rate_limit_hits from anon, authenticated;

drop policy if exists deny_parinte_direct on rate_limit_hits;
create policy deny_parinte_direct on rate_limit_hits as restrictive for all to authenticated
  using (auth_role() <> 'parinte') with check (auth_role() <> 'parinte');

drop policy if exists deny_marketing_direct on rate_limit_hits;
create policy deny_marketing_direct on rate_limit_hits as restrictive for all to authenticated
  using (auth_role() <> 'marketing') with check (auth_role() <> 'marketing');

-- Întoarce dacă cererea e permisă ȘI al câtelea hit e în fereastra curentă.
-- `authenticated` e revocat explicit: altfel un cont logat (staff, dar și un token de
-- portal) ar putea umfla contoarele altcuiva chemând funcția cu cheia lui.
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

  insert into rate_limit_hits as r (cheie, fereastra, n)
  values (p_cheie, v_start, 1)
  on conflict (cheie, fereastra) do update set n = r.n + 1
  returning r.n into v_n;

  return query
    select v_n <= p_limita, v_n, v_start + make_interval(secs => p_fereastra_sec);
end;
$$;

revoke execute on function rate_limit_hit(text, integer, integer) from anon, authenticated, public;
grant execute on function rate_limit_hit(text, integer, integer) to service_role;

-- Ferestrele vechi nu folosesc nimănui; fără curățare tabelul crește la nesfârșit.
select cron.unschedule('purge-rate-limit-hits')
  where exists (select 1 from cron.job where jobname = 'purge-rate-limit-hits');

select cron.schedule(
  'purge-rate-limit-hits',
  '20 3 * * *',
  $$delete from rate_limit_hits where fereastra < now() - interval '1 day'$$
);
