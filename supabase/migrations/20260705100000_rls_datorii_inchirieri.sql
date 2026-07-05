-- Găsit de scripts/check-rls-parinte.mjs: `datorii`, `inchirieri`, `tarife_inchiriere`
-- au fost create FĂRĂ RLS — orice JWT authenticated (inclusiv conturile portal
-- `parinte`) putea citi/scrie direct prin PostgREST. Pattern aplicat: identic cu
-- netopia_orders — staff acces integral, `parinte` blocat restrictiv (portalul
-- accesează exclusiv prin RPC SECURITY DEFINER; edge functions au service_role).
do $$
declare t text;
begin
  foreach t in array array['datorii', 'inchirieri', 'tarife_inchiriere']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      t || '_all', t
    );
    execute format('drop policy if exists deny_parinte_direct on public.%I', t);
    execute format(
      'create policy deny_parinte_direct on public.%I as restrictive for all to authenticated '
      || 'using (auth_role() <> %L) with check (auth_role() <> %L)',
      t, 'parinte', 'parinte'
    );
  end loop;
end $$;
