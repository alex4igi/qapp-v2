-- Portal / Grupa: la „Per ședință" cardul arăta un interval și „N luni".
--
-- Înrolările „Per ședință" nu au data_final (toate, prin construcție), iar cardul agregă pe
-- curs: două OPEN class (25 sept. + 9 oct.) ieșeau „25 sept. → … · 2 luni", „Activ acum"
-- la nesfârșit. Funcția întoarce acum și datele ședințelor; portalul le afișează pe ele.

drop function if exists public.get_grupe_sezon_client(uuid, uuid);

create function public.get_grupe_sezon_client(p_client uuid, p_sezon uuid default null)
 returns table(curs_id uuid, curs_nume text, nivel nivel_curs, varsta varsta_curs, stil text,
               locatie_nume text, sala text, zile zi_saptamana[], ora text, tip_plata tip_plata,
               data_incepere date, data_final date, luni integer, instructori text[], sedinte date[])
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select
    c.id, c.numele, c.nivelul, c.varsta, c.stil, l.nume, sa.nume,
    c.zile, c.ora,
    max(e.tip_plata),
    min(e.data_incepere::date),
    case when bool_or(e.data_final is null) then null else max(e.data_final::date) end,
    count(*)::integer,
    coalesce(
      (select array_agg(distinct t.nume order by t.nume)
       from (
         select teacher_id as tid from cursuri_teacheri where curs_id = c.id
         union
         select c.teacher where c.teacher is not null
       ) src
       join teacheri t on t.id = src.tid),
      '{}'::text[]
    ),
    coalesce(
      array_agg(distinct e.data_incepere::date order by e.data_incepere::date)
        filter (where e.tip_plata = 'Per sedinta'),
      '{}'::date[]
    )
  from enrollments e
  join cursuri c on c.id = e.cursul
  left join locatii l on l.id = c.locatie
  left join sali sa on sa.id = c.sala
  where e.client = p_client
    and p_client in (select client_member_ids())
    and e.reziliat = false
    and c.sezon is not distinct from p_sezon
  group by c.id, c.numele, c.nivelul, c.varsta, c.stil, l.nume, sa.nume, c.zile, c.ora, c.teacher
  order by min(e.data_incepere::date), c.numele;
$function$;

revoke execute on function public.get_grupe_sezon_client(uuid, uuid) from anon, public;
grant execute on function public.get_grupe_sezon_client(uuid, uuid) to authenticated, service_role;
