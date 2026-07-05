-- Re-aplică gardul restrictiv `deny_parinte_direct` pe TOATE tabelele cu RLS.
--
-- Context: loop-ul original (20260615120000, re-rulat 20260619120000) acoperă doar
-- tabelele existente la momentul rulării. 15 tabele create ulterior au rămas fără gard:
-- confirmari_inrolare_sms, portal_accounts, portal_reset_tokens, portal_sessions,
-- confirmari_programare_sms, facturi_fgo, datorii, confirmari_review_sms, sms_amanate,
-- tarife_inchiriere, inchirieri, familii_date_semnatar, contract_templates, contracte,
-- contract_events. Conturile `parinte` accesează exclusiv prin RPC SECURITY DEFINER
-- (verificat: qapp-membri nu face .from() decât pe tarife_publice + 2 view-uri),
-- deci gardul nu rupe niciun flux de portal. Idempotent.
do $$
declare r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  loop
    execute format('drop policy if exists deny_parinte_direct on public.%I', r.relname);
    execute format(
      'create policy deny_parinte_direct on public.%I as restrictive for all to authenticated '
      || 'using (auth_role() <> %L) with check (auth_role() <> %L)',
      r.relname, 'parinte', 'parinte'
    );
  end loop;
end $$;

-- Raport de verificare re-rulabil (scripts/check-rls-parinte.mjs): tabelele din
-- public care NU au gardul sau NU au RLS activat. Doar service_role îl poate apela.
create or replace function rls_parinte_gap_report()
returns table (tabel text, problema text)
language sql stable security definer set search_path = public as $$
  select c.relname::text,
         case when not c.relrowsecurity then 'RLS dezactivat'
              else 'lipsă politica deny_parinte_direct' end
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and (
      not c.relrowsecurity
      or not exists (
        select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = c.relname
          and p.policyname = 'deny_parinte_direct'
      )
    )
  order by 1;
$$;

revoke all on function rls_parinte_gap_report() from public, anon, authenticated;
