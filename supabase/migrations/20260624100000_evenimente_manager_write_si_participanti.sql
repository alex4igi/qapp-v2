-- Evenimente — model de acces aliniat cu fluxul real:
--   • Manager (pe lângă admin/owner) gestionează evenimentul: creare/editare/ștergere.
--   • Recepția (front_desk) NU editează evenimentul, dar adaugă/scoate participanți
--     manual (parte din fluxul operațional: încasare bilet + înscriere pe loc).
-- Recepția încasează deja (incasari e în user_write_tables), deci aici tratăm doar
-- gestiunea participanților, printr-un RPC dedicat (nu UPDATE general pe evenimente).

-- ============================================================
-- 1) Manager poate gestiona evenimentul (CRUD complet)
-- ============================================================
drop policy if exists evenimente_manager_write on evenimente;
create policy evenimente_manager_write on evenimente
  for all to authenticated
  using (auth_role() in ('admin', 'owner', 'manager'))
  with check (auth_role() in ('admin', 'owner', 'manager'));

-- ============================================================
-- 2) Gestiune participanți pentru întreg staff-ul (incl. recepția)
--    RPC SECURITY DEFINER: singura cale prin care front_desk modifică un
--    eveniment, și atinge exclusiv coloana `participant`.
-- ============================================================
create or replace function add_eveniment_participant(p_eveniment uuid, p_client uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth_role() not in ('owner', 'admin', 'manager', 'front_desk') then
    raise exception 'Acces interzis';
  end if;
  update evenimente
  set participant = case
        when p_client = any(coalesce(participant, '{}'::uuid[])) then participant
        else coalesce(participant, '{}'::uuid[]) || p_client
      end,
      updated = now()
  where id = p_eveniment;
end;
$$;

create or replace function remove_eveniment_participant(p_eveniment uuid, p_client uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth_role() not in ('owner', 'admin', 'manager', 'front_desk') then
    raise exception 'Acces interzis';
  end if;
  update evenimente
  set participant = array_remove(coalesce(participant, '{}'::uuid[]), p_client),
      updated = now()
  where id = p_eveniment;
end;
$$;

grant execute on function add_eveniment_participant(uuid, uuid) to authenticated;
grant execute on function remove_eveniment_participant(uuid, uuid) to authenticated;
