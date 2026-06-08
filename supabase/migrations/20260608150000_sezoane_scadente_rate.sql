-- Qapp v2 — scadențe explicite pentru prima/ultima rată a abonamentului recurent
-- (TODO #4 din scripts/sms/templates.md).
--
-- Context: la abonamentul recurent „Per luna", prima rată (luna de început a
-- sezonului, ex. septembrie) și ultima rată (luna de final, ex. iunie) au termene
-- de plată care diferă de la sezon la sezon și NU coincid cu „ziua 15" standard
-- (ex. sezon 2025-2026: prima = 19 sept, ultima = 13 iunie). Le definim explicit
-- pe sezon. Lunile intermediare rămân pe ziua 15.

alter table sezoane
  add column if not exists scadenta_prima_rata date,
  add column if not exists scadenta_ultima_rata date;

comment on column sezoane.scadenta_prima_rata is
  'Termen de plata pentru prima rata (luna de inceput a sezonului). Null => ziua 15.';
comment on column sezoane.scadenta_ultima_rata is
  'Termen de plata pentru ultima rata (luna de final a sezonului). Null => ziua 15.';

-- Recreăm get_sms_recipients: scadența per rând (prima/ultima rată din sezon vs
-- ziua 15), folosită pentru zile_depasire + fereastra reminder_plata, și o întoarcem
-- ca să poată construi textul „N zile pana la termen".
drop function if exists get_sms_recipients(uuid, uuid, text);

create function get_sms_recipients(
  p_locatie uuid default null,
  p_sezon uuid default null,
  p_cod text default 'notificare_restante'
)
returns table (
  familia_id      uuid,
  telefon         text,
  nume_locatie    text,
  scadenta        date,    -- termenul de plata (prima/ultima rata din sezon sau ziua 15)
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
      pi.id_locatie,
      pi.nume_locatie,
      pi.rest,
      pi.data_incepere,
      e.sezon_id,
      e.activ,
      e.data_final,
      -- scadența rândului: prima rată (luna de început a sezonului) → scadenta_prima_rata;
      -- ultima rată (luna de final a sezonului) → scadenta_ultima_rata; altfel ziua 15.
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
    where pi.id_familie is not null
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
      else rest > 0  -- notificare_restante (default)
    end
  ),
  per_membru as (
    select
      id_familie,
      id_cursant,
      max(nume_complet) as nume,
      max(nume_locatie) as nume_locatie,
      max(scadenta) as scadenta,
      sum(rest) as rest_membru,
      max(zile_dep) as zile_dep
    from filtrat
    group by id_familie, id_cursant
  )
  select
    pm.id_familie,
    coalesce(nullif(trim(fam.telefon), ''), fam.telefon_2) as telefon,
    max(pm.nume_locatie) as nume_locatie,
    max(pm.scadenta) as scadenta,
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
