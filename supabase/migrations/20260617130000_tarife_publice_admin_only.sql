-- Restrânge scrierea pe `tarife_publice` la owner + admin (nu și manager).
-- Decizie user 2026-06-17: tarifele publice se ajustează DOAR de către admini.

drop policy if exists tarife_publice_write on tarife_publice;
create policy tarife_publice_write on tarife_publice
  for all to authenticated
  using (auth_role() in ('owner', 'admin'))
  with check (auth_role() in ('owner', 'admin'));
