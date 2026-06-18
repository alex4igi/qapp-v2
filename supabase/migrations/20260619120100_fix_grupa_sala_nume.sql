-- Fix get_grupe_client: cursuri.sala e uuid FK către sali(id), nu text. Întoarcem
-- numele sălii (sali.nume), nu id-ul brut, ca să nu apară un UUID în UI.

create or replace function get_grupe_client(p_client uuid)
returns table (
  enrollment_id uuid,
  curs_id uuid,
  curs_nume text,
  nivel nivel_curs,
  varsta varsta_curs,
  stil text,
  locatie_nume text,
  sala text,
  zile zi_saptamana[],
  ora text,
  tip_plata tip_plata,
  data_incepere date,
  data_final date,
  instructori text[]
)
language sql stable security definer set search_path = public as $$
  select
    e.id, c.id, c.numele, c.nivelul, c.varsta, c.stil, l.nume, sa.nume,
    c.zile, c.ora, e.tip_plata, e.data_incepere::date, e.data_final::date,
    coalesce(
      (select array_agg(distinct t.nume order by t.nume)
       from (
         select teacher_id as tid from cursuri_teacheri where curs_id = c.id
         union
         select c.teacher where c.teacher is not null
       ) src
       join teacheri t on t.id = src.tid),
      '{}'::text[]
    )
  from enrollments e
  join cursuri c on c.id = e.cursul
  left join locatii l on l.id = c.locatie
  left join sali sa on sa.id = c.sala
  where e.client = p_client
    and p_client in (select client_member_ids())
    and e.activ = true
    and e.reziliat = false
    and (e.data_final is null or e.data_final::date >= current_date)
  order by c.numele;
$$;
