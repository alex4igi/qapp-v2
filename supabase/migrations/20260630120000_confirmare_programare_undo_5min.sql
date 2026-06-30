-- Fereastra de undo a confirmarii programarii lead: 2 min -> 5 min.
-- enqueue_confirmare_programare seteaza mereu send_after explicit, deci RPC-ul e
-- valoarea efectiva; actualizam si default-ul coloanei pentru consistenta.

alter table confirmari_programare_sms
  alter column send_after set default now() + interval '5 minutes';

create or replace function enqueue_confirmare_programare(p_lead uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into confirmari_programare_sms (lead_id, status, send_after, error, trimis_la)
  values (p_lead, 'programat', now() + interval '5 minutes', null, null)
  on conflict (lead_id) do update
    set status = 'programat',
        send_after = now() + interval '5 minutes',
        error = null,
        trimis_la = null;
$$;

grant execute on function enqueue_confirmare_programare(uuid) to authenticated;
