-- Qapp v2 — get_restante_worklist: plan custom (parametrii cunoscuți la planificare).
--
-- Măsurat pe live (12 sept 2026, după migrația 20260912180000): apelul din dashboard
-- (`p_locatie`, `p_sezon`) întoarce 0 rânduri (sezonul nou n-are încă rate depășite)
-- dar costă ~1 s la FIECARE deschidere a dashboard-ului, de către oricine. Același
-- corp rulat direct cu valorile parametrilor: 85 ms.
--
-- Cauza: o funcție `language sql` își planifică corpul FĂRĂ valorile parametrilor
-- (fmgr_sql planifică înainte să lege parametrii), deci `(p_locatie is null or
-- pi.id_locatie = p_locatie)` nu se poate simplifica, filtrul pe locație nu coboară în
-- view și se agregă toate înrolările neprescrise din toate locațiile la fiecare apel.
-- Planul generic, forțat explicit: 300 ms; funcția, măsurată de 3 ori: 0,9–1 s.
--
-- Fix: plpgsql + `plan_cache_mode = force_custom_plan` — planul se face cu valorile
-- reale la fiecare apel (`$1 is null` devine constantă, locația coboară pe index).
-- Același tipar ca 20260802110000 / 20260803100000 / 20260825110000. Corpul SELECT-ului
-- e copiat IDENTIC din definiția live (pg_get_functiondef), semnătura și tipul de retur
-- neschimbate ⇒ grant-urile rămân (create or replace).

create or replace function public.get_restante_worklist(
  p_locatie uuid default null,
  p_sezon   uuid default null,
  p_luna    date default null
)
returns table (client_id uuid, nume text, prenume text, telefon text, nume_locatie text, rest_total numeric, nr_rate_neachitate integer, zile_depasire integer, ultima_prezenta date, ultim_apel_at timestamp with time zone, ultim_apel_rezultat text, promisiune_data date, promisiune_suma numeric, promisiune_logata_at timestamp with time zone, id_locatie uuid, cursuri text, suspendat boolean, ultim_sms_at date, status_client text, suspendat_automat boolean)
language plpgsql
stable
security invoker
set search_path = public
set plan_cache_mode = force_custom_plan
as $$
  -- Coloanele din SELECT poartă aceleași nume ca OUT-urile din `returns table`
  -- (client_id, nume_locatie, id_locatie…); în plpgsql asta ar fi „ambiguous".
  #variable_conflict use_column
begin
  return query
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
end;
$$;
