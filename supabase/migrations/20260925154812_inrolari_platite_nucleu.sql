-- Nucleul regulii de loc ocupat, la nivel de (client, curs). `_locuri_ocupate`
-- numără din el pe grupă; /analytics are nevoie de aceiași oameni deduplicați pe
-- club, fără o a doua copie a predicatului. Predicatul e copiat NESCHIMBAT din
-- `_locuri_ocupate` (20260916100000); o migrație separată comută acea funcție pe
-- nucleu abia după ce rezultatele se verifică identice lună cu lună.
create or replace function public._inrolari_platite(
  p_de date,
  p_pana date,
  p_cursuri uuid[],
  p_sedinta_30_zile boolean
)
returns table(client uuid, curs_id uuid)
language sql
stable
set search_path to 'public'
as $function$
  select distinct e.client, e.cursul
  from enrollments e
  where e.cursul = any(p_cursuri)
    and e.client is not null
    and e.suma > 0
    -- Rezervarea OPEN anulată nu primește dată de reziliere și își păstrează
    -- suma. Nu se citește din `activ`: bifa se stinge și la închiderea sezonului,
    -- pe toate ședințele valide.
    and not (
      e.tip_plata = 'Per sedinta'
      and exists (select 1 from open_rezervari r
                  where r.enrollment = e.id and r.status = 'anulat')
    )
    and e.data_incepere <= p_pana
    and least(
          case
            when e.tip_plata = 'Per sedinta' and p_sedinta_30_zile then e.data_incepere + 29
            when e.tip_plata = 'Per sedinta' then e.data_incepere
            else coalesce(e.data_final, 'infinity'::date)
          end,
          coalesce((e.data_reziliere::date - 1), 'infinity'::date)
        ) >= greatest(e.data_incepere, p_de);
$function$;

-- Aceleași drepturi ca `_locuri_ocupate`: invoker, fără gard de rol (îl citesc
-- cronul pragului minim și ecranele de staff), fără anon.
revoke all on function public._inrolari_platite(date, date, uuid[], boolean) from public, anon;
grant execute on function public._inrolari_platite(date, date, uuid[], boolean) to authenticated, service_role;
