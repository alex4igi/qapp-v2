-- Restanță = DOAR ce a trecut de termenul de plată (Alex, 30.09.2026).
--   • plata pe ședință (OPEN, facultativ pe ședință): termenul e ziua ședinței — omul plătește pe loc;
--   • abonament (inclusiv la facultative): 15 ale lunii, cu excepțiile sezonului
--     (`sezoane.scadenta_prima_rata` / `scadenta_ultima_rata`) — `scadenta_rata`;
--   • datoriile one-off (taxe, bilete, merch, închirieri): se plătesc pe loc, deci termenul = ziua creării.
-- Toate intră în aceeași cifră, iar un client se numără o singură dată, oricâte locații ar avea.
--
-- `scadenta_rata` rămâne neatinsă: o folosesc K1/K2, penalizarea și suspendarea de 50 de zile,
-- toate doar pe „Per luna", unde cele două funcții dau același termen.

create or replace function public.scadenta_inrolare(p_data_incepere date, p_sezon uuid, p_tip_plata text)
returns date
language sql
stable
set search_path to 'public'
as $function$
  select case
    when p_tip_plata = 'Per sedinta' then p_data_incepere
    else scadenta_rata(p_data_incepere, p_sezon)
  end;
$function$;

revoke execute on function public.scadenta_inrolare(date, uuid, text) from anon, public;
grant execute on function public.scadenta_inrolare(date, uuid, text) to authenticated, service_role;

-- Cifra canonică a restanțelor: un rând per locație + un rând total (clienți distincți pe tot scopul).
create or replace function public.get_restante_scadente(p_locatie uuid default null)
returns table(id_locatie uuid, nume_locatie text, este_total boolean, clienti integer, rate integer, lei numeric, lei_oneoff numeric)
language sql
stable
set search_path to 'public'
as $function$
  with rate as (
    select pi.id_locatie, pi.nume_locatie, pi.id_cursant as client, pi.rest, false as oneoff
    from plati_inrolari pi
    join enrollments e on e.id = pi.id_enrollment
    where pi.id_cursant is not null
      and pi.rest > 0
      and pi.prescris = false
      and pi.viitor = false
      and e.reziliat = false
      and scadenta_inrolare(pi.data_incepere, e.sezon_id, e.tip_plata::text) < current_date
      and (p_locatie is null or pi.id_locatie = p_locatie)
  ),
  oneoff as (
    select dr.locatie as id_locatie, l.nume as nume_locatie, dr.client, dr.rest, true as oneoff
    from datorii_rest dr
    left join locatii l on l.id = dr.locatie
    where dr.client is not null
      and dr.rest > 0
      and dr.created::date < current_date
      and (p_locatie is null or dr.locatie = p_locatie)
  ),
  toate as (
    select * from rate
    union all
    select * from oneoff
  )
  select t.id_locatie, max(t.nume_locatie), false,
         count(distinct t.client)::int,
         (count(*) filter (where not t.oneoff))::int,
         sum(t.rest),
         coalesce(sum(t.rest) filter (where t.oneoff), 0)
  from toate t
  where (select auth_role()) in ('owner', 'admin', 'manager', 'front_desk')
  group by t.id_locatie
  union all
  select null::uuid, null::text, true,
         count(distinct t.client)::int,
         (count(*) filter (where not t.oneoff))::int,
         coalesce(sum(t.rest), 0),
         coalesce(sum(t.rest) filter (where t.oneoff), 0)
  from toate t
  where (select auth_role()) in ('owner', 'admin', 'manager', 'front_desk');
$function$;

revoke execute on function public.get_restante_scadente(uuid) from anon, public;
grant execute on function public.get_restante_scadente(uuid) to authenticated, service_role;

-- Lista „Pe rate": termenul ține cont de tipul plății.
create or replace function public.get_restante_worklist_rate(p_locatie uuid default null, p_sezon uuid default null, p_luna date default null, p_curs uuid default null, p_doar_depasite boolean default true)
returns table(id_enrollment uuid, client_id uuid, nume text, prenume text, telefon text, id_locatie uuid, nume_locatie text, id_curs uuid, nume_curs text, data_incepere date, scadenta date, zile_depasire integer, total_de_plata numeric, platit numeric, rest numeric, status_client text, suspendat boolean)
language plpgsql
stable
set search_path to 'public'
set plan_cache_mode to 'force_custom_plan'
as $function$
  #variable_conflict use_column
begin
  return query
  with baza as (
    select
      pi.id_enrollment,
      pi.id_cursant as client_id,
      pi.id_locatie,
      pi.nume_locatie,
      pi.id_curs,
      pi.nume_curs,
      pi.data_incepere,
      pi.total_de_plata,
      pi.platit,
      pi.rest,
      scadenta_inrolare(pi.data_incepere, e.sezon_id, e.tip_plata::text) as scadenta
    from plati_inrolari pi
    join enrollments e on e.id = pi.id_enrollment
    where pi.id_cursant is not null
      and pi.rest > 0
      and pi.prescris = false
      and pi.viitor = false
      and e.reziliat = false
      and (p_locatie is null or pi.id_locatie = p_locatie)
      and (p_sezon is null or e.sezon_id = p_sezon)
      and (p_luna is null or date_trunc('month', pi.data_incepere) = date_trunc('month', p_luna))
      and (p_curs is null or pi.id_curs = p_curs)
  )
  select
    b.id_enrollment,
    b.client_id,
    cl.nume,
    cl.prenume,
    coalesce(nullif(trim(cl.telefon), ''), cl.telefonul_2) as telefon,
    b.id_locatie,
    b.nume_locatie,
    b.id_curs,
    b.nume_curs,
    b.data_incepere,
    b.scadenta,
    (current_date - b.scadenta)::int as zile_depasire,
    b.total_de_plata,
    b.platit,
    b.rest,
    cl.status::text as status_client,
    coalesce(cl.suspendat_datorii, false) as suspendat
  from baza b
  join clienti cl on cl.id = b.client_id
  where (not p_doar_depasite) or (current_date - b.scadenta) >= 1
  order by b.data_incepere desc, b.rest desc;
end;
$function$;

-- Lista „Pe client": termenul ține cont de tipul plății, iar cu „doar depășite" suma și numărul de
-- rate sunt DOAR ale ratelor trecute de termen (restanța), nu și rata lunii încă nescadentă.
create or replace function public.get_restante_worklist(p_locatie uuid default null, p_sezon uuid default null, p_luna date default null, p_curs uuid default null, p_doar_depasite boolean default true)
returns table(client_id uuid, nume text, prenume text, telefon text, nume_locatie text, rest_total numeric, nr_rate_neachitate integer, zile_depasire integer, ultima_prezenta date, ultim_apel_at timestamp with time zone, ultim_apel_rezultat text, promisiune_data date, promisiune_suma numeric, promisiune_logata_at timestamp with time zone, id_locatie uuid, cursuri text, suspendat boolean, ultim_sms_at date, status_client text, suspendat_automat boolean)
language plpgsql
stable
set search_path to 'public'
set plan_cache_mode to 'force_custom_plan'
as $function$
  #variable_conflict use_column
begin
  return query
  with baza as (
    select
      pi.id_cursant as client_id,
      pi.id_locatie,
      pi.nume_locatie,
      pi.id_curs,
      pi.nume_curs,
      pi.rest,
      pi.data_incepere,
      scadenta_inrolare(pi.data_incepere, e.sezon_id, e.tip_plata::text) as scadenta
    from plati_inrolari pi
    join enrollments e on e.id = pi.id_enrollment
    where pi.id_cursant is not null
      and pi.rest > 0
      and pi.prescris = false
      and pi.viitor = false
      and e.reziliat = false
      and (p_locatie is null or pi.id_locatie = p_locatie)
      and (p_sezon is null or e.sezon_id = p_sezon)
  ),
  agg as (
    select client_id,
      max(nume_locatie) as nume_locatie,
      min(id_locatie::text)::uuid as id_locatie,
      string_agg(distinct nume_curs, ' · ') as cursuri,
      sum(rest) as rest_total,
      count(*)::int as nr_rate_neachitate,
      max((current_date - scadenta)::int) as zile_depasire,
      -- Rata țintită (din luna / de pe cursul cerut) trebuie să fie ea însăși
      -- depășită când cerem doar rate depășite — altfel „Pe client" ar arăta
      -- datornici pe un curs pe care „Pe rate" n-are nicio rată depășită.
      bool_or(p_luna is not null
              and date_trunc('month', data_incepere) = date_trunc('month', p_luna)) as are_luna_ceruta,
      bool_or(p_curs is not null and id_curs = p_curs) as are_curs_cerut
    from baza
    where (not p_doar_depasite) or (current_date - scadenta) >= 1
    group by client_id
  )
  select
    a.client_id,
    cl.nume,
    cl.prenume,
    coalesce(nullif(trim(cl.telefon), ''), cl.telefonul_2) as telefon,
    a.nume_locatie,
    round(a.rest_total) as rest_total,
    a.nr_rate_neachitate,
    a.zile_depasire,
    (select max(p.data) from prezente p where p.client = a.client_id and p.status = 'Prezent') as ultima_prezenta,
    lc.ultim_apel_at,
    lc.ultim_apel_rezultat,
    lp.promisiune_data,
    lp.promisiune_suma,
    lp.promisiune_logata_at,
    a.id_locatie,
    a.cursuri,
    coalesce(cl.suspendat_datorii, false) as suspendat,
    ls.ultim_sms_at,
    cl.status::text as status_client,
    (coalesce(cl.suspendat_datorii, false) and cl.suspendat_datorii_de is null)
      as suspendat_automat
  from agg a
  join clienti cl on cl.id = a.client_id
  left join lateral (
    select cc.created as ultim_apel_at, cc.rezultat::text as ultim_apel_rezultat
    from client_contacte cc
    where cc.client_id = a.client_id and cc.scop = 'recuperare'
    order by cc.created desc
    limit 1
  ) lc on true
  left join lateral (
    select cc.promisiune_data, cc.suma_promisa as promisiune_suma, cc.created as promisiune_logata_at
    from client_contacte cc
    where cc.client_id = a.client_id and cc.scop = 'recuperare' and cc.promisiune_data is not null
    order by cc.created desc
    limit 1
  ) lp on true
  left join lateral (
    select max(coalesce(s.data_trimitere, s.data_planificata)) as ultim_sms_at
    from situatie_sms_uri s
    where s.cod_mesaj in ('notificare_restante', 'avertisment_loc')
      and s.clienti_vizati @> array[a.client_id]
  ) ls on true
  where (p_luna is null or a.are_luna_ceruta)
    and (p_curs is null or a.are_curs_cerut)
  order by a.zile_depasire desc nulls last, a.rest_total desc;
end;
$function$;
