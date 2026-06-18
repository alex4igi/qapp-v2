-- Oferta publică (tarife + produse) e gestionată dintr-o secțiune separată
-- (/oferta-publica), de la manager în sus. Extinde scrierea de la owner/admin
-- și la manager — anulează restricția admin-only din 20260617130000.
-- Decizie user 2026-06-19. SELECT rămâne public (anon citește portalul /servicii).

drop policy if exists tarife_publice_write on tarife_publice;
create policy tarife_publice_write on tarife_publice
  for all to authenticated
  using (auth_role() in ('owner', 'admin', 'manager'))
  with check (auth_role() in ('owner', 'admin', 'manager'));

drop policy if exists produse_publice_write on produse_publice;
create policy produse_publice_write on produse_publice
  for all to authenticated
  using (auth_role() in ('owner', 'admin', 'manager'))
  with check (auth_role() in ('owner', 'admin', 'manager'));
