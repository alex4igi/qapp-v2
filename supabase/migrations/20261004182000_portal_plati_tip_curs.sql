-- Portal / Plăți: filtru pe tipul cursului (grupe / trupe / facultative).
-- Cerut de Alex, 4 oct. 2026: la un membru de trupă care ia și OPEN class, lista amestecă
-- ratele trupei cu ședințele plătite.
--
-- tip_curs: 'facultativ' (cursuri.facultativ) → 'trupa' (nivelul Trupa) → 'grupa' (restul),
-- cele trei tipuri din docs/reguli-domeniu.md §3. Pornit din pg_get_functiondef LIVE.

drop function if exists public.get_plati_client(uuid);

create function public.get_plati_client(p_client uuid)
 returns table(enrollment_id uuid, curs_nume text, data_incepere date, tip_plata tip_plata,
               total_de_plata numeric, platit numeric, rest numeric, cod_voucher text,
               sezon_id uuid, sezon_nume text, tip_curs text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select pi.id_enrollment, pi.nume_curs, pi.data_incepere, pi.tip_plata,
         pi.total_de_plata, pi.platit, pi.rest, pi.cod_voucher,
         c.sezon, sz.numele_sezonului,
         case
           when coalesce(c.facultativ, false) then 'facultativ'
           when c.nivelul = 'Trupa' then 'trupa'
           else 'grupa'
         end
  from plati_inrolari pi
  left join cursuri c on c.id = pi.id_curs
  left join sezoane sz on sz.id = c.sezon
  where pi.id_cursant = p_client
    and p_client in (select client_member_ids())
    and not (coalesce(pi.prescris, false) and pi.rest > 0)
  order by pi.data_incepere asc nulls last, pi.id_enrollment;
$function$;

revoke execute on function public.get_plati_client(uuid) from anon, public;
grant execute on function public.get_plati_client(uuid) to authenticated, service_role;
