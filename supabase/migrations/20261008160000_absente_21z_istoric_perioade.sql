-- Absenți de 21 de zile: Istoricul pe perioade și poarta K3 pentru cine revine singur
-- (Alex, 08.10.2026).
--
-- 1. Lista crește cu ~7 cazuri pe zi (peste o mie pe sezon). Istoricul se cere pe
--    perioadă (după data intrării) sau pe sezon, cu paginare; taburile de lucru cer doar
--    stările deschise.
-- 2. Cine revine la curs înainte să-l sune cineva iese din listă (5c din job_absente_21z)
--    și nu mai pică poarta de 48 h a lui K3 — dar doar dacă a revenit cât ceasul încă
--    mergea. După 48 h lucrătoare fără apel, termenul era deja ratat; o revenire de mai
--    târziu nu-l șterge.

-- ── 1. Lista de lucru: stări, perioadă, sezon, paginare ─────────────────────
drop function if exists get_absente_21z_worklist(uuid[], boolean);

create or replace function get_absente_21z_worklist(
  p_locatii           uuid[]  default null,
  p_doar_necontactate boolean default false,
  p_stari             text[]  default null,
  p_de_la             date    default null,   -- data intrării, inclusiv
  p_pana_la           date    default null,   -- data intrării, inclusiv
  p_sezon_id          uuid    default null,   -- data intrării în intervalul sezonului
  p_limit             int     default null,
  p_offset            int     default 0
)
returns table (
  id                     uuid,
  client_id              uuid,
  client_nume            text,
  telefon                text,
  curs_id                uuid,
  curs_nume              text,
  locatie_nume           text,
  data_intrare           date,
  ultima_prezenta        date,
  zile_tacere            int,
  ore_de_la_intrare      numeric,   -- ore lucrătoare (fără weekend) până la primul contact / acum
  contactat_la           timestamptz,
  motiv                  text,
  pas_urmator            text,
  reactivat              boolean,
  reactivat_la           date,
  stare                  text,
  incercari              int,
  urmatoarea_incercare   date,
  de_sunat               boolean,
  sms_fara_raspuns_la    timestamptz,
  sms_fara_raspuns_eroare text,
  exclus_k3              boolean,
  reziliere_propusa_la   timestamptz,
  reziliere_decisa_la    timestamptz,
  reziliere_nota         text,
  luni_de_reziliat       int,
  total                  bigint     -- rândurile filtrate, înainte de paginare
)
language sql
stable
security invoker
set search_path = public
as $$
  with filtrate as (
    select a.*
    from absente_21z a
    where (p_locatii is null or a.locatie = any(p_locatii))
      and (not p_doar_necontactate or a.contactat_la is null)
      and (p_stari is null or a.stare = any(p_stari))
      and (p_de_la is null or a.data_intrare >= p_de_la)
      and (p_pana_la is null or a.data_intrare <= p_pana_la)
      and (p_sezon_id is null or exists (
             select 1 from sezoane s
             where s.id = p_sezon_id
               and a.data_intrare between s.data_incepere and s.data_final))
  ),
  pagina as (
    select f.*, count(*) over () as total
    from filtrate f
    order by f.data_intrare desc, f.id
    limit p_limit offset greatest(p_offset, 0)
  )
  select a.id, a.client,
         trim(format('%s %s', coalesce(cl.prenume, ''), cl.nume)),
         coalesce(cl.telefon, f.telefon), cu.id, cu.numele, lo.nume,
         a.data_intrare, a.ultima_prezenta, a.zile_tacere,
         ore_lucratoare(a.created, coalesce(a.contactat_la, now())),
         a.contactat_la, ma.eticheta, a.pas_urmator,
         a.reactivat, a.reactivat_la,
         a.stare, a.incercari, a.urmatoarea_incercare,
         a.stare = 'de_contactat'
           or (a.stare in ('reincercare', 'amanat')
               and a.urmatoarea_incercare <= (now() at time zone 'Europe/Bucharest')::date),
         a.sms_fara_raspuns_la, a.sms_fara_raspuns_eroare, a.exclus_k3,
         a.reziliere_propusa_la, a.reziliere_decisa_la, a.reziliere_nota,
         case when a.stare = 'de_confirmat'
              then (select count(*)::int from absenta_inrolari_de_reziliat(a.client, a.curs)) end,
         a.total
  from pagina a
  join clienti cl on cl.id = a.client
  left join familii f on f.id = cl.familia
  join cursuri cu on cu.id = a.curs
  left join locatii lo on lo.id = a.locatie
  left join motive_abandon ma on ma.id = a.motiv_declarat
  order by a.data_intrare desc, a.id;
$$;

revoke execute on function get_absente_21z_worklist(uuid[], boolean, text[], date, date, uuid, int, int) from anon, public;
grant execute on function get_absente_21z_worklist(uuid[], boolean, text[], date, date, uuid, int, int) to authenticated;

-- ── 2. K3: revenit singur în termen = nu pică poarta ────────────────────────
create or replace function public.kpi_k3(p_locatii uuid[], p_anul integer, p_luna integer, p_parametri jsonb default '{}'::jsonb)
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  with param as (
    select make_date(p_anul, p_luna, 1) as prima_zi,
           (make_date(p_anul, p_luna, 1) + interval '1 month')::date as luna_urm,
           coalesce((p_parametri ->> 'poarta_ore')::numeric, 48) as poarta_ore
  ),
  baza as (
    select a.id, a.contactat_la, a.created, a.reactivat, a.evaluat_la,
           case when a.contactat_la is not null
                then ore_lucratoare(a.created, a.contactat_la) end as ore_pana_la_contact,
           -- Prima prezență după intrare, cât timp nu-l sunase nimeni. Ora: începutul zilei
           -- ședinței (prezențele n-au oră), deci în favoarea recepției.
           case when a.contactat_la is null then (
             select min(p.data) from prezente p
             where p.client = a.client
               and p.status = 'Prezent'
               and p.data > a.data_intrare)
           end as revenit_la
    from absente_21z a, param p
    where a.data_intrare >= p.prima_zi
      and a.data_intrare <  p.luna_urm
      and a.locatie = any(p_locatii)
      and not a.exclus_k3
  ),
  cazuri as (
    select b.*,
           b.revenit_la is not null
             and ore_lucratoare(b.created, (b.revenit_la::timestamp at time zone 'Europe/Bucharest'))
                 <= p.poarta_ore as revenit_singur
    from baza b, param p
  )
  select jsonb_build_object(
    'kpi', 'reactivare_21z',
    'numitor',   (select count(*) from cazuri),
    'numarator', (select count(*) from cazuri where reactivat is true),
    'valoare', case when (select count(*) from cazuri) = 0 then null
                    else round((select count(*) from cazuri where reactivat is true)::numeric
                               / (select count(*) from cazuri) * 100, 1) end,
    -- Poarta: TOATE cazurile contactate în termen — sau întoarse singure la curs înainte
    -- de termen. Un singur caz necontactat anulează linia.
    'poarta_ok', (select count(*) from cazuri) = 0
                 or not exists (
                   select 1 from cazuri c, param p
                   where (c.contactat_la is null and not c.revenit_singur)
                      or c.ore_pana_la_contact > p.poarta_ore),
    'contactate_la_timp', (select count(*) from cazuri c, param p
                            where c.contactat_la is not null
                              and c.ore_pana_la_contact <= p.poarta_ore),
    'revenit_singur',     (select count(*) from cazuri where revenit_singur),
    'necontactate',       (select count(*) from cazuri where contactat_la is null and not revenit_singur),
    'contactate_tarziu',  (select count(*) from cazuri c, param p
                            where c.contactat_la is not null
                              and c.ore_pana_la_contact > p.poarta_ore),
    'neevaluate', (select count(*) from cazuri where evaluat_la is null),
    'poarta_ore', (select poarta_ore from param),
    -- Cazurile intră doar în luna lor (cronul le scrie cu data zilei), iar verdictul vine
    -- la 30 de zile: după finalul lunii următoare nu se mai mișcă nimic.
    'provizoriu', (now() at time zone 'Europe/Bucharest')::date < (select luna_urm from param)
                  or exists (select 1 from cazuri where evaluat_la is null),
    'final_la', (((select luna_urm from param) + interval '1 month')::date - 1)::text
  );
$function$;
