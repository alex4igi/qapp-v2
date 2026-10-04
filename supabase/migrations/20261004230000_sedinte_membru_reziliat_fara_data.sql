-- get_sedinte_membru: o înrolare `reziliat` fără data_reziliere nu mai produce ședințe viitoare.
--
-- Jobul EXclient (20260901220000) bifează `reziliat` fără dată și pe lunile VIITOARE ale celui plecat
-- (cu suma pusă pe 0), nu doar pe lunile încheiate. Versiunea din 20261004220000 ignora flagul (corect
-- pentru istoric), deci unui EXclient i-ar fi arătat ședințe până la finalul sezonului. Acum: rândul
-- închis fără dată rămâne în istoric (zilele de dinainte de azi), dar nu mai apare în viitor.

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
declare
  v_azi date := (now() at time zone 'Europe/Bucharest')::date;
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
           (e.data_reziliere at time zone 'Europe/Bucharest')::date as data_reziliere,
           e.reziliat and e.data_reziliere is null as inchis_fara_data
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
      and (not i.inchis_fara_data or d::date < v_azi)
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
      and (not i.inchis_fara_data or i.data_incepere < v_azi)
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

