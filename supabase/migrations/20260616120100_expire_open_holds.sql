-- Portal membri — expirare holduri OPEN neplătite.
-- Un loc 'rezervat' (hold creat de hold_loc_open) care nu e plătit în ~30 min ar
-- bloca permanent capacitatea (și ar bloca același client să re-rezerve via
-- uq_open_rez_client_active). Sweep periodic care eliberează holdurile abandonate
-- și anulează comanda Netopia 'pending' asociată. Apărare și pt cazul în care
-- webhook-ul nu mai ajunge niciodată.

create or replace function expire_open_holds()
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  v_count integer;
begin
  -- anulează comenzile pending de tip rezervare mai vechi de 30 min (fără confirmare)
  update netopia_orders
    set status = 'canceled', updated = now()
  where order_type = 'rezervare'
    and status = 'pending'
    and created < now() - interval '30 minutes';

  -- eliberează holdurile rămase 'rezervat' fără o comandă confirmată
  with expirate as (
    update open_rezervari r
      set status = 'anulat', anulat_at = now(), anulat_motiv = 'hold expirat'
    where r.status = 'rezervat'
      and r.created < now() - interval '30 minutes'
      and not exists (
        select 1 from netopia_orders o
        where o.rezervare_id = r.id and o.status = 'confirmed'
      )
    returning 1
  )
  select count(*) into v_count from expirate;

  return v_count;
end;
$$;

revoke all on function expire_open_holds() from public, authenticated;
grant execute on function expire_open_holds() to service_role;

-- ============================================================
-- pg_cron — la fiecare 10 minute
-- ============================================================
select cron.unschedule(jobid)
  from cron.job where jobname = 'expire-open-holds';

select cron.schedule(
  'expire-open-holds',
  '*/10 * * * *',
  $$select expire_open_holds();$$
);
