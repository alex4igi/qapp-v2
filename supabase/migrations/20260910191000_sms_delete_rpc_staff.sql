-- Recepția poate șterge ORICE rând din lista de SMS-uri (cerut explicit de Alex,
-- 2026-09-10), inclusiv cele deja trimise.
--
-- Ștergerea trece prin RPC, nu direct pe tabel, dintr-un motiv concret: pentru un
-- rând 'Amanat' mesajul real stă în `sms_amanate` (drenat de process-sms-amanate
-- după ora de ieșire din zona interzisă). Ștergerea doar a rândului din listă nu ar
-- opri trimiterea — ar ascunde-o. RPC-ul anulează întâi coada de noapte.
create or replace function delete_sms_queue_entry(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sters int;
begin
  if auth_role() not in ('owner', 'admin', 'manager', 'front_desk', 'user') then
    raise exception 'rol fără drept de ștergere pe lista de SMS-uri';
  end if;

  delete from sms_amanate
  where sursa_id = p_id and status = 'in_asteptare';

  delete from situatie_sms_uri where id = p_id;
  get diagnostics v_sters = row_count;

  return v_sters > 0;
end $$;

revoke execute on function delete_sms_queue_entry(uuid) from anon, public;
grant execute on function delete_sms_queue_entry(uuid) to authenticated;

-- Politica de delete pe tabel rămâne aliniată cu RPC-ul: fără restricția de status.
drop policy if exists situatie_sms_uri_staff_delete on situatie_sms_uri;
create policy situatie_sms_uri_staff_delete
  on situatie_sms_uri for delete to authenticated
  using (auth_role() in ('manager', 'front_desk', 'user'));
