-- get_sms_recipients: `are_promo` → `are_reducere`.
--
-- Sub regulile noi (20260831170000 + 170100) prețul promo NU se mai pierde la
-- depășirea termenului — se pierde reducerea de familie pentru luna respectivă.
-- Reminderul de plată trebuie deci să avertizeze exact destinatarii care AU o
-- reducere de pierdut (`politica_discount > 0`), nu pe cei care stau pe promo.
-- Corpul e cel din 20260828200000; se schimbă doar semnalul propagat până la ieșire.

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
  scadenta        date,
  membri          jsonb,
  total_restanta  numeric,
  zile_depasire   int,
  client_ids      uuid[],
  are_reducere    boolean
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
      (coalesce(e.politica_discount, 0) > 0) as are_reducere,
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
      max(f.zile_dep) as zile_dep,
      bool_or(coalesce(f.are_reducere, false)) as are_reducere
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
    array_agg(c.id_cursant) as client_ids,
    bool_or(c.are_reducere) as are_reducere
  from calificati c
  left join familii fam on fam.id = c.id_familie
  group by c.grup_id, c.id_familie, fam.telefon, fam.telefon_2
  order by total_restanta desc nulls last;
$$;

revoke execute on function get_sms_recipients(uuid, uuid, text) from anon, public;
grant execute on function get_sms_recipients(uuid, uuid, text) to authenticated;
