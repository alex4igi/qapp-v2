-- Portal membri: tabul „Cursuri" pe sezon ales, nu doar sezonul curent.
--
-- `get_grupe_client` filtrează pe `data_incepere <= current_date <= data_final`,
-- deci după arhivarea unui sezon istoricul devine invizibil: un părinte nu mai
-- poate verifica la ce grupă a fost copilul acum un an (curs, program, instructor).
--
-- Cele două funcții de mai jos servesc selectorul de sezon din portal. Nu ating
-- `get_grupe_client` — aceea rămâne sursa pentru „grupele mele de acum".

-- Sezoanele în care membrul are înrolări (nereziliate) — opțiunile selectorului.
-- sezon_id null = cursuri fără sezon asociat.
create or replace function get_sezoane_inrolari_client(p_client uuid)
returns table (sezon_id uuid, sezon_nume text, nr_cursuri integer)
language sql stable security definer set search_path = public as $$
  select c.sezon,
         max(sz.numele_sezonului),
         count(distinct c.id)::integer
  from enrollments e
  join cursuri c on c.id = e.cursul
  left join sezoane sz on sz.id = c.sezon
  where e.client = p_client
    and p_client in (select client_member_ids())
    and e.reziliat = false
  group by c.sezon
  order by max(sz.data_incepere) desc nulls last;
$$;

revoke execute on function get_sezoane_inrolari_client(uuid) from anon, public;
grant execute on function get_sezoane_inrolari_client(uuid) to authenticated;

-- Grupele unui sezon. Un curs recurent are cate o inrolare pe luna, deci
-- agregam pe curs — altfel „Teatru 7-10 ani" ar aparea de 10 ori. Perioada
-- rezulta din min/max peste lunile inrolate; `data_final` null (inrolare inca
-- deschisa) se propaga ca null, nu ca max.
create or replace function get_grupe_sezon_client(p_client uuid, p_sezon uuid default null)
returns table (
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
  luni integer,
  instructori text[]
)
language sql stable security definer set search_path = public as $$
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
$$;

revoke execute on function get_grupe_sezon_client(uuid, uuid) from anon, public;
grant execute on function get_grupe_sezon_client(uuid, uuid) to authenticated;
