-- Portal / Plăți: lunile plătite nu mai dispar când clientul trece pe EXclient (Alex, 04.10.2026:
-- „oamenii ar trebui să vadă ce au plătit").
--
-- get_plati_client citea plati_inrolari, care exclude `reziliat = true`. Jobul EXclient
-- (20260901220000) bifează `reziliat` fără dată și pe lunile încheiate și achitate, așa că după
-- 30 de zile de inactivitate părintele vedea doar lunile cu datorie (acelea rămân nebifate).
-- La 04.10: ~12.000 de luni plătite ascunse în ultimele două sezoane, 0 în sezonul curent.
--
-- Acum: lunile nereziliate ca înainte + lunile reziliate CU plăți, ca „achitat". Pe acestea restul
-- nu mai e de plată (contract încheiat), deci total = cât s-a plătit, cel mult suma lunii, iar
-- restul e cel mult 0 (supraplata rămâne vizibilă ca până acum). Lunile reziliate fără nicio plată
-- (luni viitoare anulate, conversii ședință→abonament) rămân ascunse. Plata online nu e atinsă:
-- netopia-create-payment folosește build_fifo_plan_membru, iar rândurile cu rest ≤ 0 nu se pot bifa.

drop function if exists public.get_plati_client(uuid);

create function public.get_plati_client(p_client uuid)
 returns table(enrollment_id uuid, curs_nume text, data_incepere date, tip_plata tip_plata,
               total_de_plata numeric, platit numeric, rest numeric, cod_voucher text,
               sezon_id uuid, sezon_nume text, tip_curs text, scadenta date)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with randuri as (
    select e.id, e.cursul, e.data_incepere, e.tip_plata, e.sezon_id, e.reziliat, e.voucher,
           coalesce(e.suma, 0) as suma,
           (select sum(i.suma) from incasari i where i.inregistrare = e.id) as platit
    from enrollments e
    where e.client = p_client
      and p_client in (select client_member_ids())
  )
  select r.id, c.numele, r.data_incepere, r.tip_plata,
         case when r.reziliat then least(r.suma, r.platit) else r.suma end,
         r.platit,
         case when r.reziliat then least(r.suma - r.platit, 0)
              else r.suma - coalesce(r.platit, 0) end,
         v.cod_voucher,
         c.sezon, sz.numele_sezonului,
         case
           when coalesce(c.facultativ, false) then 'facultativ'
           when c.nivelul = 'Trupa' then 'trupa'
           else 'grupa'
         end,
         scadenta_inrolare(r.data_incepere, r.sezon_id, r.tip_plata::text)
  from randuri r
  left join cursuri c on c.id = r.cursul
  left join sezoane sz on sz.id = c.sezon
  left join vouchere v on v.id = r.voucher
  where (not r.reziliat or coalesce(r.platit, 0) > 0)
    -- prescrierea (2 ani) ascunde doar datoria, ca în plati_inrolari
    and not (r.data_incepere < (current_date - interval '2 years')
             and not r.reziliat
             and r.suma - coalesce(r.platit, 0) > 0)
  order by r.data_incepere asc nulls last, r.id;
$function$;

revoke execute on function public.get_plati_client(uuid) from anon, public;
grant execute on function public.get_plati_client(uuid) to authenticated, service_role;
