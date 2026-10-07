-- Deconturile Netopia se importă singure zilnic (Google Apps Script → netopia-decont-import),
-- deci notificarea lunară nu mai cere descărcarea manuală a fișierelor.
create or replace function public.notifica_raport_netopia_lunar()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_luna date := (date_trunc('month', now() at time zone 'Europe/Bucharest') - interval '1 month')::date;
  v_eticheta text;
  v_nr integer;
  v_total numeric;
  v_count integer := 0;
  v_recipient uuid;
begin
  select count(*), coalesce(sum(amount), 0)
    into v_nr, v_total
    from netopia_orders
   where status = 'confirmed'
     and (created at time zone 'Europe/Bucharest')::date >= v_luna
     and (created at time zone 'Europe/Bucharest')::date < (v_luna + interval '1 month')::date;

  if v_nr = 0 then
    return 0;
  end if;

  v_eticheta := (array['ianuarie','februarie','martie','aprilie','mai','iunie','iulie',
                       'august','septembrie','octombrie','noiembrie','decembrie'])[extract(month from v_luna)::int]
                || ' ' || extract(year from v_luna)::int;

  for v_recipient in
    select id from auth.users where raw_app_meta_data ->> 'role' in ('owner', 'admin')
  loop
    insert into notifications (recipient_user_id, kind, title, body, payload, requires_action, status)
    values (
      v_recipient,
      'raport_netopia_lunar',
      format('Raportul plăților online pentru %s', v_eticheta),
      format(
        '%s plăți online, %s lei. Deconturile Netopia sunt încărcate automat — deschide Facturare FGO → Raport Netopia, verifică secțiunea „De verificat” și descarcă PDF-ul pentru contabilitate.',
        v_nr, replace(to_char(v_total, 'FM9999990.00'), '.', ',')
      ),
      jsonb_build_object('luna', v_luna),
      true,
      'open'
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.notifica_raport_netopia_lunar() from anon, public, authenticated;
