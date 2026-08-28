-- Qapp v2 — Promo reînscrieri: scadența REALĂ a ratei (nu „ziua 15" hardcodat)
-- + semnal pentru SMS-ul de reamintire.
--
-- Context: promo-ul se pierde dacă rata nu e achitată până la termen. Termenul nu e
-- mereu ziua 15: prima rată a sezonului (luna de început) și ultima rată (luna de
-- final) au date explicite pe sezon (`sezoane.scadenta_prima_rata` /
-- `scadenta_ultima_rata`, introduse în 20260608150000). Ex. sezon 2026-2027:
-- prima rată = 20 sept, ultima = 7 iunie. `cancel_expired_reinscrieri()` tăia promo-ul
-- de pe 16 ale lunii ⇒ în septembrie anula promo-ul cu 4 zile ÎNAINTE de termen.
--
-- 1. cancel_expired_reinscrieri(): scadență per rând (aceeași expresie canonică
--    ca în get_sms_recipients / get_restante_worklist), fără gardul „ziua 16".
-- 2. get_sms_recipients(): coloană nouă `are_promo` — destinatarul are cel puțin o
--    rată pe preț promo în selecție ⇒ SMS-ul de reamintire îi spune că pierde
--    prețul promoțional după termen.

-- ============================================================
-- 1. cancel_expired_reinscrieri — pe scadența reală a ratei
-- ============================================================
create or replace function cancel_expired_reinscrieri()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_today date := current_date;
begin
  with scadente as (
    select
      e.id,
      e.client,
      e.cursul,
      e.suma,
      e.data_incepere,
      -- scadența canonică a ratei (paritate get_sms_recipients, 20260608150000)
      case
        when sz.scadenta_prima_rata is not null
             and date_trunc('month', e.data_incepere) = date_trunc('month', sz.data_incepere)
          then sz.scadenta_prima_rata
        when sz.scadenta_ultima_rata is not null
             and date_trunc('month', e.data_incepere) = date_trunc('month', sz.data_final)
          then sz.scadenta_ultima_rata
        else (date_trunc('month', e.data_incepere)::date + 14)
      end as scadenta
    from enrollments e
    left join sezoane sz on sz.id = e.sezon_id
    where e.este_reinscriere = true
      and e.reziliat = false
  ),
  neachitate as (
    select s.id, s.client, s.cursul, s.data_incepere
    from scadente s
    left join incasari i on i.inregistrare = s.id
    where v_today > s.scadenta
    group by s.id, s.client, s.cursul, s.data_incepere, s.suma
    having coalesce(sum(i.suma), 0) < coalesce(s.suma, 0)
  ),
  expirate as (
    -- promo-ul se pierde pentru tot restul sezonului: de la luna ratei restante
    -- (sau de la luna curentă, dacă termenul a căzut în luna următoare) încolo
    select client, cursul, min(date_trunc('month', data_incepere)::date) as luna_min
    from neachitate
    group by client, cursul
  )
  update enrollments e
  set suma = coalesce(c.pret_lunar, e.suma),
      este_reinscriere = false,
      promo_anulat_la = now(),
      updated = now()
  from expirate ex
  join cursuri c on c.id = ex.cursul
  where e.client = ex.client
    and e.cursul = ex.cursul
    and e.reziliat = false
    and e.este_reinscriere = true
    and e.data_incepere >= least(ex.luna_min, date_trunc('month', v_today)::date);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function cancel_expired_reinscrieri() from anon, public;
grant execute on function cancel_expired_reinscrieri() to authenticated;

-- ============================================================
-- 2. get_sms_recipients + are_promo
--    Corpul e cel din 20260825120000 (worklist deschis la toți datornicii);
--    se ADAUGĂ doar bool_or(este_reinscriere) propagat până la ieșire.
-- ============================================================
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
  are_promo       boolean
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
      e.este_reinscriere,
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
      bool_or(coalesce(f.este_reinscriere, false)) as are_promo
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
    bool_or(c.are_promo) as are_promo
  from calificati c
  left join familii fam on fam.id = c.id_familie
  group by c.grup_id, c.id_familie, fam.telefon, fam.telefon_2
  order by total_restanta desc nulls last;
$$;

revoke execute on function get_sms_recipients(uuid, uuid, text) from anon, public;
grant execute on function get_sms_recipients(uuid, uuid, text) to authenticated;
