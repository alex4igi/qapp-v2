-- Plată online reușită, dar comanda NU s-a putut finaliza (audit 2026-09-20, secțiunea 4.2).
-- Până acum `confirm_netopia_payment` întorcea `{ok:false, reason}`, webhookul răspundea 400
-- și nu afla nimeni: omul plătise, iar în aplicație nu exista nicio încasare.
--
-- Chemată de `netopia-webhook` și de `netopia-reconcile` (service_role).
create or replace function public.notifica_plata_online_problema(
  p_order_ref text,
  p_motiv text
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_order     netopia_orders%rowtype;
  v_client    text;
  v_recipient uuid;
  v_explicatie text;
  v_count     int := 0;
begin
  select * into v_order from netopia_orders where order_ref = p_order_ref;
  if not found then
    return 0;
  end if;

  -- IPN-ul e reîncercat de Netopia, iar reconcilierea trece din oră în oră: aceeași
  -- problemă pe aceeași comandă se anunță o singură dată.
  if exists (
    select 1 from notifications
    where kind = 'plata_online_problema'
      and payload->>'order_ref' = p_order_ref
      and payload->>'motiv' = p_motiv
  ) then
    return 0;
  end if;

  select trim(coalesce(c.prenume, '') || ' ' || coalesce(c.nume, '')) into v_client
  from clienti c where c.id = v_order.client_id;

  v_explicatie := case p_motiv
    when 'amount_mismatch' then 'Suma confirmată de Netopia diferă de suma comenzii.'
    when 'hold_expired'    then 'Rezervarea locului expirase până să vină confirmarea.'
    when 'hold_missing'    then 'Rezervarea locului nu mai există.'
    when 'tickets_missing' then 'Biletele rezervate nu mai există.'
    when 'order_not_found' then 'Comanda nu mai există în aplicație.'
    else 'Motiv: ' || coalesce(p_motiv, 'necunoscut') || '.'
  end;

  for v_recipient in
    select id from auth.users
    where raw_app_meta_data->>'role' in ('owner', 'admin')
  loop
    insert into notifications (
      recipient_user_id, kind, title, body, payload, requires_action, status
    ) values (
      v_recipient,
      'plata_online_problema',
      format('Plată online fără încasare: %s RON', trim(to_char(v_order.amount, 'FM999999990.00'))),
      format(
        '%s%s Banii pot fi la Netopia, dar în aplicație nu s-a înregistrat nimic. Verifică plata în panoul Netopia (comanda %s) și, dacă a intrat, înregistrează încasarea manual.',
        case when coalesce(v_client, '') <> '' then v_client || ' · ' else '' end,
        v_explicatie,
        p_order_ref
      ),
      jsonb_build_object(
        'order_ref', p_order_ref,
        'motiv', p_motiv,
        'amount', v_order.amount,
        'client_id', v_order.client_id,
        'order_type', v_order.order_type
      ),
      true,
      'open'
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.notifica_plata_online_problema(text, text) is
  'Anunță owner/admin că o plată online nu s-a putut transforma în încasare. Dedup pe (order_ref, motiv).';

revoke execute on function public.notifica_plata_online_problema(text, text) from anon, public, authenticated;
grant execute on function public.notifica_plata_online_problema(text, text) to service_role;
