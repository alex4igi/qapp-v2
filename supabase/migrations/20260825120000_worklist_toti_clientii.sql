-- Worklist + SMS restanțe: TOȚI clienții cu datorie, nu doar cei cu status Activ.
--
-- Decizie user (2026-08-25): „datoriile sunt de la toți clienții — mai puțin cele
-- care se prescriu". Filtrul `cl.status = 'Activ'` (introdus la alinierea din
-- 20260720/20260724) ascundea ~47.700 RON din 77.729 RON net — datornici deveniți
-- Inactivi/EXclienți pe care nu-i mai suna nimeni. Datoria nu se stinge la
-- schimbarea statusului, doar la prescriere (2 ani).
--
-- Se schimbă în tandem (regula de aliniere worklist == SMS):
--   - get_restante_worklist: fără filtrul pe status; expune `status_client` ca
--     operatorul să vadă pe cine sună (badge „inactiv” / „ex-client” în UI).
--   - get_sms_recipients (notificare_restante): fără condiția `cl.status = 'Activ'`.
-- Rămâne neschimbată calificarea „cel puțin o rată chiar depășită”.

drop function if exists get_restante_worklist(uuid, uuid, date);

create function get_restante_worklist(
  p_locatie uuid default null,
  p_sezon   uuid default null,
  p_luna    date default null
)
returns table (
  client_id uuid,
  nume text,
  prenume text,
  telefon text,
  nume_locatie text,
  rest_total numeric,
  nr_rate_neachitate int,
  zile_depasire int,
  ultima_prezenta date,
  ultim_apel_at timestamptz,
  ultim_apel_rezultat text,
  promisiune_data date,
  promisiune_suma numeric,
  promisiune_logata_at timestamptz,
  id_locatie uuid,
  cursuri text,
  suspendat boolean,
  ultim_sms_at date,
  status_client text
)
language sql
stable
security invoker
set search_path = public
as $$
  with baza as (
    select
      pi.id_cursant as client_id,
      pi.id_locatie,
      pi.nume_locatie,
      pi.nume_curs,
      pi.rest,
      pi.data_incepere,
      case
        when sz.scadenta_prima_rata is not null
             and date_trunc('month', pi.data_incepere) = date_trunc('month', sz.data_incepere)
          then sz.scadenta_prima_rata
        when sz.scadenta_ultima_rata is not null
             and date_trunc('month', pi.data_incepere) = date_trunc('month', sz.data_final)
          then sz.scadenta_ultima_rata
        else (date_trunc('month', pi.data_incepere)::date + 14)
      end as scadenta
    from plati_inrolari pi
    join enrollments e on e.id = pi.id_enrollment
    left join sezoane sz on sz.id = e.sezon_id
    where pi.id_cursant is not null
      and pi.rest > 0
      and pi.prescris = false          -- datoriile prescrise nu se mai recuperează
      and pi.viitor = false            -- lunile facturate în viitor nu sunt restanță
      and e.reziliat = false
      and (p_locatie is null or pi.id_locatie = p_locatie)
      and (p_sezon is null or e.sezon_id = p_sezon)   -- aliniere cu get_sms_recipients
  ),
  agg as (
    select client_id,
      max(nume_locatie) as nume_locatie,
      min(id_locatie::text)::uuid as id_locatie,
      string_agg(distinct nume_curs, ' · ') as cursuri,
      sum(rest) as rest_total,
      count(*)::int as nr_rate_neachitate,
      max((current_date - scadenta)::int) as zile_depasire,
      bool_or(p_luna is not null and date_trunc('month', data_incepere) = date_trunc('month', p_luna)) as are_luna_ceruta
    from baza
    group by client_id
    having max((current_date - scadenta)::int) >= 1   -- cel puțin o rată chiar depășită
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
    cl.status::text as status_client
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
  order by a.zile_depasire desc nulls last, a.rest_total desc;
$$;

-- get_sms_recipients: aceeași deschidere — notificare_restante țintește toți
-- datornicii cu rată depășită, indiferent de status. Corpul e cel din
-- 20260824180000, cu CTE-ul `calificati` fără condiția pe status.
create or replace function get_sms_recipients(
  p_locatie uuid default null,
  p_sezon uuid default null,
  p_cod text default 'notificare_restante'
)
returns table (
  familia_id      uuid,
  telefon         text,
  nume_locatie    text,
  scadenta        date,
  membri          jsonb,
  total_restanta  numeric,
  zile_depasire   int,
  client_ids      uuid[]
)
language sql
stable
security invoker
set search_path = public
as $$
  with baza as (
    select
      pi.id_familie,
      pi.id_cursant,
      trim(pi.nume_client || ' ' || coalesce(pi.prenume_client, '')) as nume_complet,
      pi.nume_locatie,
      pi.rest,
      pi.viitor,
      pi.data_incepere,
      e.activ,
      e.data_final,
      case
        when sz.scadenta_prima_rata is not null
             and date_trunc('month', pi.data_incepere) = date_trunc('month', sz.data_incepere)
          then sz.scadenta_prima_rata
        when sz.scadenta_ultima_rata is not null
             and date_trunc('month', pi.data_incepere) = date_trunc('month', sz.data_final)
          then sz.scadenta_ultima_rata
        else (date_trunc('month', pi.data_incepere)::date + 14)
      end as scadenta
    from plati_inrolari pi
    join enrollments e on e.id = pi.id_enrollment
    left join sezoane sz on sz.id = e.sezon_id
    where pi.id_cursant is not null
      and pi.prescris = false          -- nu trimite remindere pentru datorii prescrise
      and (p_locatie is null or pi.id_locatie = p_locatie)
      and (p_sezon is null or e.sezon_id = p_sezon)
  ),
  baza2 as (
    select *, (current_date - scadenta)::int as zile_dep from baza
  ),
  filtrat as (
    select * from baza2
    where case
      when p_cod = 'avertisment_loc' then rest > 0 and zile_dep > 50
      when p_cod = 'reminder_plata' then
        rest > 0
        and date_trunc('month', data_incepere) = date_trunc('month', current_date)
        and current_date <= scadenta
      when p_cod = 'mesaj_liber' then
        activ = true and (data_final is null or data_final >= current_date)
      else rest > 0 and not viitor  -- notificare_restante: fără luni facturate în viitor
    end
  ),
  per_client as (
    select
      coalesce(f.id_familie, f.id_cursant) as grup_id,
      f.id_familie,
      f.id_cursant,
      max(f.nume_complet) as nume,
      max(f.nume_locatie) as nume_locatie,
      max(f.scadenta) as scadenta,
      sum(f.rest) as rest_membru,
      max(f.zile_dep) as zile_dep
    from filtrat f
    group by f.id_familie, f.id_cursant
    -- aliniere worklist (doar notificare_restante/default): min. o rată chiar depășită
    having p_cod in ('avertisment_loc', 'reminder_plata', 'mesaj_liber')
        or max(f.zile_dep) >= 1
  ),
  calificati as (
    select pc.*,
      coalesce(nullif(trim(cl.telefon), ''), nullif(trim(cl.telefonul_2), '')) as telefon_membru
    from per_client pc
    join clienti cl on cl.id = pc.id_cursant
    -- toți clienții cu datorie, indiferent de status (aliniat cu worklist-ul)
  )
  select
    c.grup_id as familia_id,
    coalesce(
      nullif(trim(fam.telefon), ''),
      nullif(trim(fam.telefon_2), ''),
      max(c.telefon_membru)
    ) as telefon,
    max(c.nume_locatie) as nume_locatie,
    max(c.scadenta) as scadenta,
    jsonb_agg(
      jsonb_build_object('nume', c.nume, 'rest', round(c.rest_membru))
      order by c.nume
    ) as membri,
    round(sum(c.rest_membru)) as total_restanta,
    max(c.zile_dep) as zile_depasire,
    array_agg(c.id_cursant) as client_ids
  from calificati c
  left join familii fam on fam.id = c.id_familie
  group by c.grup_id, c.id_familie, fam.telefon, fam.telefon_2
  order by total_restanta desc nulls last;
$$;

revoke execute on function get_restante_worklist(uuid, uuid, date) from anon, public;
grant execute on function get_restante_worklist(uuid, uuid, date) to authenticated;

revoke execute on function get_sms_recipients(uuid, uuid, text) from anon, public;
grant execute on function get_sms_recipients(uuid, uuid, text) to authenticated;
