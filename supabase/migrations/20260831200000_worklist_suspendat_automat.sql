-- /datorii: worklist-ul distinge suspendarea AUTOMATĂ (regula 50 de zile,
-- 20260831190000) de cea pusă manual de un manager.
--
-- Managerul afla din email cine a trecut de 50 de zile, dar în listă toți apăreau
-- la fel — „Suspendat" — deci nu vedea pe cine mai are de decis. Coloana nouă
-- `suspendat_automat` (= suspendat ȘI `suspendat_datorii_de is null`) alimentează
-- badge-ul „loc de anulat". Corpul e cel din 20260825120000, neschimbat în rest.

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
  status_client text,
  suspendat_automat boolean
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
    cl.status::text as status_client,
    -- Suspendare pusă de cron-ul „50 de zile" (suspendat_datorii_de IS NULL),
    -- nu de un om din /datorii ⇒ locul e de anulat, așteaptă decizia managerului.
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
  order by a.zile_depasire desc nulls last, a.rest_total desc;
$$;
