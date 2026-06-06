-- Qapp v2 — Flux SMS bulk „double-check" pentru plăți/restanțe.
--
-- 1. RPC get_sms_recipients(p_locatie, p_sezon, p_cod) — extrage destinatarii
--    grupați pe familie (un telefon = o familie), cu membri + sume + zile depășire,
--    filtrați după tipul de mesaj (`p_cod`):
--      - 'notificare_restante' → familii cu rest > 0
--      - 'reminder_plata'      → rest > 0 pe luna curentă, înainte/pe ziua 15
--      - 'avertisment_loc'     → termen depășit cu ≥ 45 zile (pierderea locului)
--      - 'mesaj_liber'         → toate familiile cu înrolare activă la locație
--    Front-end-ul construiește textul; aici doar selectăm cine + cât.
--
-- 2. RLS restrictiv: rândurile cu cod_mesaj='mesaj_liber' pot fi inserate doar de
--    manager în sus (owner/admin/manager). Front-desk NU poate trimite mesaje
--    ad-hoc libere — doar template-urile de plăți/restanțe.

-- ============================================================
-- 1. RPC get_sms_recipients
-- ============================================================

create or replace function get_sms_recipients(
  p_locatie uuid default null,
  p_sezon uuid default null,
  p_cod text default 'notificare_restante'
)
returns table (
  familia_id      uuid,
  telefon         text,
  membri          jsonb,   -- [{ "nume": "Nume Prenume", "rest": 120 }]
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
      pi.id_locatie,
      pi.rest,
      pi.data_incepere,
      e.sezon_id,
      e.activ,
      e.data_final,
      -- termenul lunar = ziua 15 a lunii înrolării; zile de la termen până azi
      (current_date - (date_trunc('month', pi.data_incepere)::date + 14))::int as zile_dep
    from plati_inrolari pi
    join enrollments e on e.id = pi.id_enrollment
    where pi.id_familie is not null
      and (p_locatie is null or pi.id_locatie = p_locatie)
      and (p_sezon is null or e.sezon_id = p_sezon)
  ),
  filtrat as (
    select * from baza
    where case
      when p_cod = 'avertisment_loc' then rest > 0 and zile_dep >= 45
      when p_cod = 'reminder_plata' then
        rest > 0
        and extract(day from current_date) <= 15
        and date_trunc('month', data_incepere) = date_trunc('month', current_date)
      when p_cod = 'mesaj_liber' then
        activ = true and (data_final is null or data_final >= current_date)
      else rest > 0  -- notificare_restante (default)
    end
  ),
  per_membru as (
    select
      id_familie,
      id_cursant,
      max(nume_complet) as nume,
      sum(rest) as rest_membru,
      max(zile_dep) as zile_dep
    from filtrat
    group by id_familie, id_cursant
  )
  select
    pm.id_familie,
    coalesce(nullif(trim(fam.telefon), ''), fam.telefon_2) as telefon,
    jsonb_agg(
      jsonb_build_object('nume', pm.nume, 'rest', round(pm.rest_membru))
      order by pm.nume
    ) as membri,
    round(sum(pm.rest_membru)) as total_restanta,
    max(pm.zile_dep) as zile_depasire,
    array_agg(pm.id_cursant) as client_ids
  from per_membru pm
  join familii fam on fam.id = pm.id_familie
  group by pm.id_familie, fam.telefon, fam.telefon_2
  having coalesce(nullif(trim(fam.telefon), ''), fam.telefon_2) is not null
  order by total_restanta desc nulls last;
$$;

grant execute on function get_sms_recipients(uuid, uuid, text) to authenticated;

-- ============================================================
-- 2. RLS restrictiv: mesaj_liber doar manager+
-- ============================================================
-- Politicile permisive existente (situatie_sms_uri_user_insert) permit insert
-- pentru owner/admin/manager/front_desk. Adăugăm o politică RESTRICTIVĂ (AND)
-- care blochează cod_mesaj='mesaj_liber' pentru oricine sub manager.

drop policy if exists situatie_sms_uri_adhoc_restrict on situatie_sms_uri;
create policy situatie_sms_uri_adhoc_restrict on situatie_sms_uri
  as restrictive for insert to authenticated
  with check (
    cod_mesaj is distinct from 'mesaj_liber'
    or auth_role() in ('owner', 'admin', 'manager')
  );
