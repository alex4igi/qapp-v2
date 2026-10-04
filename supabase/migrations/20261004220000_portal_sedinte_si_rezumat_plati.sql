-- Portal membri, lotul MVP (handoff Codex 04.10.2026, verificat pe date):
--
-- 1. get_sedinte_membru — o singură sursă pentru ședințele unui membru (Calendar + Acasă).
--    Înainte, portalul genera recurența în browser din înrolările active AZI: arăta curs în
--    vacanță și în luni suspendate, ignora ore_pe_zi, nu vedea înrolarea de luna viitoare,
--    iar „Per ședință" (fără data_final) se repeta la nesfârșit. OPEN-urile veneau separat
--    din get_rezervari_client, deși fiecare rezervare confirmată are înrolare „Per ședință".
--    Reguli:
--      * abonament (Per lună / Per an): zilele grupei în [data_incepere, data_final] ∩ sezon,
--        fără vacanțe și luni suspendate, tăiat la data_reziliere. Flagul `reziliat` se pune
--        și la închiderea lunii, deci nu e criteriu (reguli-domeniu §1).
--      * Per ședință: loc confirmat = apare, indiferent de bani (Alex, 04.10). Holdurile și
--        anulările se exclud explicit, nu prin lipsa înrolării.
--      * un rând pe (client, curs, zi); abonamentul are prioritate.
--
-- 2. get_rezumat_plati_familie — ce e de plată, pe termene. get_sold_familie (rămas neatins,
--    îl folosește și staff-ul) ignoră datoriile one-off și pune rata lunii curente înainte de
--    scadență. Aici: rate + datorii one-off, cu scadența canonică (scadenta_inrolare pe
--    e.sezon_id, datoria în ziua creării); `restant` = scadența a trecut strict.
--
-- 3. get_plati_client primește `scadenta` (aceeași funcție, același sezon).

create or replace function public.get_sedinte_membru(p_de date, p_pana date)
returns table(
  client_id uuid, prenume text, curs_id uuid, curs_nume text, data date, ora text,
  sala text, locatie text, instructori text[], sursa text, rezervare_id uuid
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if (select auth_role()) <> 'parinte' then
    raise exception 'Acces refuzat.' using errcode = '42501';
  end if;
  if p_de is null or p_pana is null or p_pana < p_de or p_pana - p_de > 400 then
    raise exception 'Interval invalid.' using errcode = '22023';
  end if;

  return query
  with membri as (
    select m as id from client_member_ids() m
  ),
  inrolari as (
    select e.id, e.client, e.cursul, e.tip_plata, e.data_incepere, e.data_final,
           (e.data_reziliere at time zone 'Europe/Bucharest')::date as data_reziliere
    from enrollments e
    where e.client in (select id from membri)
  ),
  abonamente as (
    select i.client, c.id as curs, d::date as zi, 'abonament'::text as sursa,
           null::uuid as rezervare, null::uuid as instructor, 1 as prio
    from inrolari i
    join cursuri c on c.id = i.cursul
    join sezoane s on s.id = c.sezon
    cross join lateral generate_series(
      greatest(i.data_incepere, s.data_incepere, p_de),
      least(coalesce(i.data_final, s.data_final), s.data_final, p_pana),
      interval '1 day'
    ) d
    where i.tip_plata in ('Per luna', 'Per an')
      and (i.data_reziliere is null or d::date < i.data_reziliere)
      and (array['Duminica','Luni','Marti','Miercuri','Joi','Vineri','Sambata']::zi_saptamana[])
            [extract(dow from d)::int + 1] = any (coalesce(c.zile, '{}'))
      and not exists (
        select 1 from vacante v
        where v.sezon_id = c.sezon and d::date between v.data_incepere and v.data_final
      )
      and curs_activ_in_luna(c.id, d::date)
  ),
  sedinte as (
    select i.client, i.cursul as curs, i.data_incepere as zi, 'sedinta'::text as sursa,
           rz.id as rezervare, rz.instructor, 2 as prio
    from inrolari i
    left join lateral (
      select r.id, os.instructor
      from open_rezervari r
      join open_sesiuni os on os.id = r.sesiune
      where r.enrollment = i.id and r.status = 'platit' and os.status <> 'anulata'
      order by r.created desc
      limit 1
    ) rz on true
    where i.tip_plata = 'Per sedinta'
      and i.data_incepere between p_de and p_pana
      and (i.data_reziliere is null or i.data_reziliere > i.data_incepere)
      and (
        rz.id is not null
        or not exists (select 1 from open_rezervari r2 where r2.enrollment = i.id)
      )
  ),
  unice as (
    select distinct on (t.client, t.curs, t.zi) t.*
    from (select * from abonamente union all select * from sedinte) t
    order by t.client, t.curs, t.zi, t.prio
  )
  select u.client, cl.prenume, c.id, c.numele, u.zi,
         coalesce(
           c.ore_pe_zi ->> ((array['Duminica','Luni','Marti','Miercuri','Joi','Vineri','Sambata'])
                              [extract(dow from u.zi)::int + 1]),
           c.ora
         ),
         sa.nume, l.nume,
         case
           when u.instructor is not null
             then array(select t.nume from teacheri t where t.id = u.instructor)
           else coalesce(
             (select array_agg(distinct t.nume order by t.nume)
              from (
                select ct.teacher_id as tid from cursuri_teacheri ct where ct.curs_id = c.id
                union
                select c.teacher where c.teacher is not null
              ) src
              join teacheri t on t.id = src.tid),
             '{}'::text[])
         end,
         u.sursa, u.rezervare
  from unice u
  join cursuri c on c.id = u.curs
  join clienti cl on cl.id = u.client
  left join sali sa on sa.id = c.sala
  left join locatii l on l.id = coalesce(c.locatie, sa.locatie)
  order by u.zi, 6 nulls last, cl.prenume;
end;
$function$;

revoke execute on function public.get_sedinte_membru(date, date) from anon, public;
grant execute on function public.get_sedinte_membru(date, date) to authenticated, service_role;


create or replace function public.get_rezumat_plati_familie()
returns table(client_id uuid, prenume text, scadenta date, suma numeric, restant boolean)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_azi date := (now() at time zone 'Europe/Bucharest')::date;
begin
  if (select auth_role()) <> 'parinte' then
    raise exception 'Acces refuzat.' using errcode = '42501';
  end if;

  return query
  with membri as (
    select m as id from client_member_ids() m
  ),
  de_plata as (
    select pi.id_cursant as client,
           scadenta_inrolare(pi.data_incepere, e.sezon_id, e.tip_plata::text) as scadenta,
           pi.rest
    from plati_inrolari pi
    join enrollments e on e.id = pi.id_enrollment
    where pi.id_cursant in (select id from membri)
      and pi.rest > 0
      and not coalesce(pi.prescris, false)
    union all
    select dr.client, (dr.created at time zone 'Europe/Bucharest')::date, dr.rest
    from datorii_rest dr
    where dr.client in (select id from membri)
      and dr.rest > 0
  )
  select d.client, cl.prenume, d.scadenta, sum(d.rest), d.scadenta < v_azi
  from de_plata d
  join clienti cl on cl.id = d.client
  group by d.client, cl.prenume, d.scadenta
  order by d.scadenta, cl.prenume;
end;
$function$;

revoke execute on function public.get_rezumat_plati_familie() from anon, public;
grant execute on function public.get_rezumat_plati_familie() to authenticated, service_role;


drop function if exists public.get_plati_client(uuid);

create function public.get_plati_client(p_client uuid)
 returns table(enrollment_id uuid, curs_nume text, data_incepere date, tip_plata tip_plata,
               total_de_plata numeric, platit numeric, rest numeric, cod_voucher text,
               sezon_id uuid, sezon_nume text, tip_curs text, scadenta date)
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
         end,
         scadenta_inrolare(pi.data_incepere, e.sezon_id, e.tip_plata::text)
  from plati_inrolari pi
  join enrollments e on e.id = pi.id_enrollment
  left join cursuri c on c.id = pi.id_curs
  left join sezoane sz on sz.id = c.sezon
  where pi.id_cursant = p_client
    and p_client in (select client_member_ids())
    and not (coalesce(pi.prescris, false) and pi.rest > 0)
  order by pi.data_incepere asc nulls last, pi.id_enrollment;
$function$;

revoke execute on function public.get_plati_client(uuid) from anon, public;
grant execute on function public.get_plati_client(uuid) to authenticated, service_role;
