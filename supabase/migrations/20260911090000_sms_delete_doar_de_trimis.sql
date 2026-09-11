-- Recepția (și managerul) șterg din lista de SMS-uri DOAR rândurile 'De trimis'
-- (decis de Alex 2026-09-11). Un SMS trimis rămâne dovada că a plecat la client, iar
-- un 'Amanat' e deja în drum spre client. Admin/owner pot șterge orice, ca înainte.
create or replace function delete_sms_queue_entry(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text := auth_role();
  v_status status_sms;
  v_sters int;
begin
  if v_rol not in ('owner', 'admin', 'manager', 'front_desk', 'user') then
    raise exception 'rol fără drept de ștergere pe lista de SMS-uri';
  end if;

  select status into v_status from situatie_sms_uri where id = p_id;
  if not found then
    return false;
  end if;

  if v_rol in ('manager', 'front_desk', 'user') and v_status is distinct from 'De trimis' then
    raise exception 'Poți șterge doar SMS-urile „De trimis". Acesta e „%".', v_status;
  end if;

  -- pentru un 'Amanat' (doar admin/owner ajung aici) mesajul real stă în coada de
  -- noapte; fără ștergerea ei, SMS-ul ar pleca oricum
  delete from sms_amanate
  where sursa_id = p_id and status = 'in_asteptare';

  delete from situatie_sms_uri where id = p_id;
  get diagnostics v_sters = row_count;

  return v_sters > 0;
end $$;

revoke execute on function delete_sms_queue_entry(uuid) from anon, public;
grant execute on function delete_sms_queue_entry(uuid) to authenticated;

drop policy if exists situatie_sms_uri_staff_delete on situatie_sms_uri;
create policy situatie_sms_uri_staff_delete
  on situatie_sms_uri for delete to authenticated
  using (
    auth_role() in ('manager', 'front_desk', 'user')
    and status = 'De trimis'
  );
