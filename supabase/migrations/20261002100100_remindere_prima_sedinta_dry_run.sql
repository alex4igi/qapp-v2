-- Dry-run pe o zi trecută: înrolările create DUPĂ ziua simulată nu există încă în
-- ziua aceea. În producție p_azi = azi, deci filtrul nu schimbă nimic.

create or replace function remindere_prima_sedinta_de_trimis(p_azi date)
returns table (
  tip           text,
  client_id     uuid,
  curs_id       uuid,
  data_sedinta  date,
  ora           text,
  prenume       text,
  telefon       text,
  curs_nume     text,
  locatie_nume  text
)
language sql
stable
security definer
set search_path = public
as $$
  with perechi as (
    select e.client, e.cursul, c.sezon,
           min(e.data_incepere) as prima_luna,
           min((e.created at time zone 'Europe/Bucharest')::date) as creat_zi
    from enrollments e
    join cursuri c on c.id = e.cursul
    join sezoane s on s.id = c.sezon
    where e.data_reziliere is null
      and e.tip_plata in ('Per luna', 'Per an')
      and not c.facultativ
      and not coalesce(c.one_time, false)
      and s.data_final >= p_azi
      and (e.created at time zone 'Europe/Bucharest')::date <= p_azi
    group by e.client, e.cursul, c.sezon
  ),
  cu_data as (
    select p.*, s.data_incepere as start_sezon,
           prima_sedinta_curs(p.cursul, greatest(p.prima_luna, s.data_incepere, p.creat_zi)) as prima
    from perechi p
    join sezoane s on s.id = p.sezon
    -- Fereastra de start SAU prima ședință mâine; restul nu merită calculat.
    where p_azi between s.data_incepere - 7 and s.data_incepere - 1
       or greatest(p.prima_luna, s.data_incepere, p.creat_zi) between p_azi - 60 and p_azi + 1
  ),
  clasificat as (
    select d.*,
           exists (
             select 1 from enrollments e2
             where e2.client = d.client
               and e2.sezon_id is distinct from d.sezon
               and e2.suma > 0
               and e2.data_reziliere is null
               and e2.data_incepere >= (date_trunc('month', d.start_sezon) - interval '5 months')::date
               and e2.data_incepere < d.start_sezon
           ) as reinscris
    from cu_data d
    where d.prima is not null
  ),
  de_trimis as (
    select 'start_sezon'::text as tip, k.*
    from clasificat k
    where k.reinscris
      and p_azi between k.start_sezon - 7 and k.start_sezon - 1
    union all
    select 'prima_sedinta'::text, k.*
    from clasificat k
    where k.prima = p_azi + 1
      and k.prima - k.creat_zi > 7
      and not exists (
        select 1 from prezente pr
        join enrollments ep on ep.id = pr.enrollment
        where pr.client = k.client and ep.cursul = k.cursul
      )
  )
  select t.tip, t.client, t.cursul, t.prima,
         coalesce(c.ore_pe_zi ->> (array['Duminica','Luni','Marti','Miercuri','Joi','Vineri','Sambata'])
                                    [extract(dow from t.prima)::int + 1], c.ora),
         cl.prenume::text, cl.telefon::text, c.numele::text, l.nume::text
  from de_trimis t
  join cursuri c on c.id = t.cursul
  join clienti cl on cl.id = t.client
  left join locatii l on l.id = c.locatie
  -- Locul trebuie să fie încă al lui în ziua ședinței (rezilierea taie rândurile).
  where exists (
      select 1 from enrollments e3
      where e3.client = t.client and e3.cursul = t.cursul
        and e3.data_reziliere is null
        and e3.data_incepere <= t.prima
        and coalesce(e3.data_final, t.prima) >= t.prima
    )
    and not exists (
      select 1 from remindere_prima_sedinta r
      where r.client_id = t.client and r.curs_id = t.cursul and r.status <> 'esuat'
    );
$$;

revoke execute on function remindere_prima_sedinta_de_trimis(date) from anon, authenticated, public;
grant execute on function remindere_prima_sedinta_de_trimis(date) to service_role;
