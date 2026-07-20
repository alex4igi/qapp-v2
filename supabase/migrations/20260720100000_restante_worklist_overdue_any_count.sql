-- Qapp v2 — Worklist recuperare: prag greșit excludea datornicii pe O SINGURĂ lună.
--
-- Până acum get_restante_worklist cerea `count(*) >= 2` (2+ rate neachitate),
-- ca proxy pentru „chiar e restant, nu doar luna curentă neajunsă la scadență".
-- Efect secundar: un client cu restanță DOAR pe o lună (ex: iunie, neachitată,
-- dar nicio altă lună restantă) nu apărea niciodată în „Datornici de sunat" nici
-- în /recuperare — deși scadența (15 ale lunii) trecuse de mult.
--
-- Fix (decis de user): pragul corect e „cel puțin o rată chiar depășită"
-- (zile_depasire >= 1), nu „cel puțin 2 rate". Asta prinde și restanțierii pe o
-- singură lună, dar tot exclude luna curentă neajunsă încă la scadență.
--
-- Adaugă și p_luna (opțional): filtrează la clienții care au o rată neachitată
-- FACTURATĂ în luna respectivă, dar afișează în continuare TOTALUL lor de
-- recuperat (toate lunile restante) — util ca țintă de apel („cine are restanță
-- din iunie"), nu ca sumă parțială (pentru sumă exactă pe lună vezi /financiar
-- → Restanțe, care are filtru de lună pe fiecare rând).

create or replace function get_restante_worklist(
  p_locatie uuid default null,
  p_sezon   uuid default null,
  p_luna    date default null
)
returns table (
  client_id           uuid,
  nume                text,
  prenume             text,
  telefon             text,
  nume_locatie        text,
  rest_total          numeric,
  nr_rate_neachitate  integer,
  zile_depasire       integer,
  ultima_prezenta     date,
  ultim_apel_at       timestamptz,
  ultim_apel_rezultat text
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
      and e.reziliat = false
      and (p_locatie is null or pi.id_locatie = p_locatie)
      and (p_sezon is null or e.sezon_id = p_sezon)   -- aliniere cu get_sms_recipients
  ),
  agg as (
    select client_id,
      max(nume_locatie) as nume_locatie,
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
    lc.ultim_apel_rezultat
  from agg a
  join clienti cl on cl.id = a.client_id
  left join lateral (
    select cc.created as ultim_apel_at, cc.rezultat::text as ultim_apel_rezultat
    from client_contacte cc
    where cc.client_id = a.client_id and cc.scop = 'recuperare'
    order by cc.created desc
    limit 1
  ) lc on true
  where cl.status = 'Activ'
    and (p_luna is null or a.are_luna_ceruta)
  order by a.zile_depasire desc nulls last, a.rest_total desc;
$$;

grant execute on function get_restante_worklist(uuid, uuid, date) to authenticated;
