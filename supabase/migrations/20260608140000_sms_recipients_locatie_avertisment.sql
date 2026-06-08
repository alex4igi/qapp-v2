-- Qapp v2 — rafinări flux SMS bulk plăți/restanțe (2026-06-08):
--   1. get_sms_recipients întoarce și `nume_locatie` (locația înrolării) — front-end-ul
--      mapează numele la telefonul locației pentru placeholderul {telefon locatie}.
--   2. avertisment_loc: pragul de pierdere a locului trece de la ≥ 45 zile la > 50 zile
--      (vezi scripts/sms/templates.md → De implementat #3).
-- Return type-ul se schimbă (coloană nouă) → DROP + CREATE (CREATE OR REPLACE nu poate
-- modifica semnătura de retur).

drop function if exists get_sms_recipients(uuid, uuid, text);

create function get_sms_recipients(
  p_locatie uuid default null,
  p_sezon uuid default null,
  p_cod text default 'notificare_restante'
)
returns table (
  familia_id      uuid,
  telefon         text,
  nume_locatie    text,    -- locația înrolării (reprezentativă pe familie)
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
      pi.nume_locatie,
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
      when p_cod = 'avertisment_loc' then rest > 0 and zile_dep > 50
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
      max(nume_locatie) as nume_locatie,
      sum(rest) as rest_membru,
      max(zile_dep) as zile_dep
    from filtrat
    group by id_familie, id_cursant
  )
  select
    pm.id_familie,
    coalesce(nullif(trim(fam.telefon), ''), fam.telefon_2) as telefon,
    max(pm.nume_locatie) as nume_locatie,
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
