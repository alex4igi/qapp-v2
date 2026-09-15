-- Qapp v2 — /datorii absoarbe tabul „Restanțe" din /financiar (decis 2026-09-15).
--
-- Tabul Restanțe era singurul loc cu (a) filtru pe curs, (b) ratele cu rest care nu
-- au ajuns încă la scadență (luna curentă înainte de 15) și (c) un rând = o rată
-- (lună × curs), sortabil după lună. Toate trei intră în lista de pe /datorii, pe
-- aceeași bază (`baza` de mai jos = definiția canonică: rest > 0, neprescris,
-- nereziliat, fără luni facturate în viitor), ca să nu mai existe două definiții.
--
-- 1. get_restante_worklist primește doi parametri opționali:
--    p_curs          — țintește clienții care au o rată depășită pe cursul ales (sau
--                      doar cu rest, când p_doar_depasite=false); totalul afișat
--                      rămâne complet (aceeași semantică precum p_luna);
--    p_doar_depasite — implicit true = comportamentul de azi (cel puțin o rată chiar
--                      depășită); false = și clienții cu rest doar pe rate neajunse
--                      la scadență (reminderul dinaintea termenului).
--    Capcană (20260720100100): create or replace cu parametri noi = OVERLOAD, nu
--    replace → drop explicit pe semnătura veche (uuid, uuid, date).
-- 2. get_restante_worklist_rate — aceeași bază, aceiași parametri, un rând = o rată.
--    Filtrele de lună/curs/depășire se aplică PE RÂND (rata din luna aleasă, rata
--    de pe cursul ales, rata depășită), nu pe client — e vederea de raport.
--
-- Ambele: plpgsql + force_custom_plan, ca în 20260912190000 (filtrul pe locație
-- trebuie să coboare în view; ca `language sql` costa ~1 s pe fiecare deschidere).

drop function if exists public.get_restante_worklist(uuid, uuid, date);

create or replace function public.get_restante_worklist(
  p_locatie       uuid    default null,
  p_sezon         uuid    default null,
  p_luna          date    default null,
  p_curs          uuid    default null,
  p_doar_depasite boolean default true
)
returns table (
  client_id uuid, nume text, prenume text, telefon text, nume_locatie text,
  rest_total numeric, nr_rate_neachitate integer, zile_depasire integer,
  ultima_prezenta date, ultim_apel_at timestamp with time zone, ultim_apel_rezultat text,
  promisiune_data date, promisiune_suma numeric, promisiune_logata_at timestamp with time zone,
  id_locatie uuid, cursuri text, suspendat boolean, ultim_sms_at date,
  status_client text, suspendat_automat boolean
)
language plpgsql
stable
security invoker
set search_path = public
set plan_cache_mode = force_custom_plan
as $$
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
              and date_trunc('month', data_incepere) = date_trunc('month', p_luna)
              and ((not p_doar_depasite) or (current_date - scadenta) >= 1)) as are_luna_ceruta,
      bool_or(p_curs is not null and id_curs = p_curs
              and ((not p_doar_depasite) or (current_date - scadenta) >= 1)) as are_curs_cerut
    from baza
    group by client_id
    having (not p_doar_depasite) or max((current_date - scadenta)::int) >= 1
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
$$;

revoke execute on function public.get_restante_worklist(uuid, uuid, date, uuid, boolean) from anon, public;
grant execute on function public.get_restante_worklist(uuid, uuid, date, uuid, boolean) to authenticated;

-- Vederea „Pe rate": un rând = o rată (lună × curs) a unui client.
create or replace function public.get_restante_worklist_rate(
  p_locatie       uuid    default null,
  p_sezon         uuid    default null,
  p_luna          date    default null,
  p_curs          uuid    default null,
  p_doar_depasite boolean default true
)
returns table (
  id_enrollment uuid, client_id uuid, nume text, prenume text, telefon text,
  id_locatie uuid, nume_locatie text, id_curs uuid, nume_curs text,
  data_incepere date, scadenta date, zile_depasire integer,
  total_de_plata numeric, platit numeric, rest numeric,
  status_client text, suspendat boolean
)
language plpgsql
stable
security invoker
set search_path = public
set plan_cache_mode = force_custom_plan
as $$
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
$$;

revoke execute on function public.get_restante_worklist_rate(uuid, uuid, date, uuid, boolean) from anon, public;
grant execute on function public.get_restante_worklist_rate(uuid, uuid, date, uuid, boolean) to authenticated;
