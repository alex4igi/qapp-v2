-- Qapp v2 — Aliniere worklist recuperare la logica de sezon.
--
-- Până acum get_restante_worklist returna datornici din TOATE sezoanele (doar
-- exclude reziliate/prescrise), în timp ce get_sms_recipients filtra pe sezon
-- (presetat la cel activ în compozitor). Asta producea inconsistență: un client
-- dintr-un sezon vechi apărea „de sunat" pe dashboard / în /recuperare, dar nu
-- în selecția de SMS.
--
-- Fix (decis de user): worklistul primește p_sezon, cu aceeași semantică ca în
-- get_sms_recipients — null = toate sezoanele, uuid = doar sezonul respectiv.
-- UI-ul presetează sezonul activ (overridabil pe „Toate").

drop function if exists get_restante_worklist(uuid);

create function get_restante_worklist(
  p_locatie uuid default null,
  p_sezon   uuid default null
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
      max((current_date - scadenta)::int) as zile_depasire
    from baza
    group by client_id
    having count(*) >= 2
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
  order by a.zile_depasire desc nulls last, a.rest_total desc;
$$;

grant execute on function get_restante_worklist(uuid, uuid) to authenticated;
