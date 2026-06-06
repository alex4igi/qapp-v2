-- Qapp v2 — Fix: policy-urile anunturi ↔ anunturi_destinatari se refereau reciproc,
-- producând „infinite recursion detected in policy" (500 la SELECT).
-- Rupem ciclul cu helperi SECURITY DEFINER care interoghează fără a declanșa RLS.

create or replace function _is_anunt_recipient(p_anunt uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from anunturi_destinatari d
    where d.anunt_id = p_anunt and d.recipient_user_id = auth.uid()
  );
$$;

create or replace function _is_anunt_expeditor(p_anunt uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from anunturi a
    where a.id = p_anunt and a.expeditor_user_id = auth.uid()
  );
$$;

grant execute on function _is_anunt_recipient(uuid) to authenticated;
grant execute on function _is_anunt_expeditor(uuid) to authenticated;

-- Reconstruim policy-urile fără referințe circulare directe.
drop policy if exists anunturi_select on anunturi;
create policy anunturi_select on anunturi
  for select to authenticated using (
    expeditor_user_id = auth.uid()
    or is_admin()
    or _is_anunt_recipient(id)
  );

drop policy if exists anunturi_dest_select on anunturi_destinatari;
create policy anunturi_dest_select on anunturi_destinatari
  for select to authenticated using (
    recipient_user_id = auth.uid()
    or is_admin()
    or _is_anunt_expeditor(anunt_id)
  );

drop policy if exists anunturi_clienti_select on anunturi_clienti;
create policy anunturi_clienti_select on anunturi_clienti
  for select to authenticated using (
    is_admin()
    or _is_anunt_expeditor(anunt_id)
  );
