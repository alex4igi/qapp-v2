-- Qapp v2 — Feature Reînscrieri.
--
-- Context: în aprilie-mai se face „reînscrierea" pentru sezonul nou (septembrie+).
-- Clienții care se reînscriu primesc preț promo lunar (cursuri.pret_lunar_promo).
-- Promo rămâne valabil DOAR dacă plătesc la timp în fiecare lună (scadența: 15 a lunii).
-- La depășire, promo se anulează PERMANENT pentru tot sezonul (toate înrolările viitoare
-- ale clientului la curs revin la pret_lunar).

-- ============================================================
-- 1. Flag pe enrollments
-- ============================================================
alter table enrollments
  add column if not exists este_reinscriere boolean not null default false;

create index if not exists idx_enrollments_este_reinscriere
  on enrollments(este_reinscriere) where este_reinscriere = true;

-- ============================================================
-- 2. RPC activate_reinscriere
--    Aplică pret_lunar_promo pe toate înrolările viitoare (din luna următoare)
--    ale clientului la curs. Returnează numărul de înrolări actualizate.
-- ============================================================
create or replace function activate_reinscriere(
  p_client_id uuid,
  p_curs_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_promo numeric;
  v_count integer := 0;
  v_cutoff date := date_trunc('month', current_date + interval '1 month')::date;
begin
  select pret_lunar_promo into v_promo from cursuri where id = p_curs_id;
  if v_promo is null then
    raise exception 'Cursul nu are preț promo configurat (pret_lunar_promo).';
  end if;

  update enrollments
  set suma = v_promo,
      este_reinscriere = true,
      updated = now()
  where client = p_client_id
    and cursul = p_curs_id
    and reziliat = false
    and data_incepere >= v_cutoff;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function activate_reinscriere(uuid, uuid) to authenticated;

-- ============================================================
-- 3. RPC cancel_expired_reinscrieri
--    Apelat zilnic după ziua de scadență (16+). Pentru fiecare înrolare cu
--    este_reinscriere=true din luna TRECUTĂ care nu a fost achitată complet la 15,
--    anulează promo pe TOATE înrolările viitoare ale clientului la curs:
--    suma revine la pret_lunar, este_reinscriere=false.
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
  -- Doar dacă azi e >= 16 verific luna curentă; altfel skip (cron poate rula zilnic).
  if extract(day from v_today)::int < 16 then
    return 0;
  end if;

  with expirate as (
    select distinct e.client as client_id, e.cursul as curs_id
    from enrollments e
    left join incasari i on i.inregistrare = e.id
    where e.este_reinscriere = true
      and e.reziliat = false
      and e.data_incepere >= date_trunc('month', v_today)::date
      and e.data_incepere < (date_trunc('month', v_today) + interval '1 month')::date
    group by e.id, e.client, e.cursul, e.suma
    having coalesce(sum(i.suma), 0) < coalesce(e.suma, 0)
  )
  update enrollments e
  set suma = c.pret_lunar,
      este_reinscriere = false,
      updated = now()
  from expirate ex
  join cursuri c on c.id = ex.curs_id
  where e.client = ex.client_id
    and e.cursul = ex.curs_id
    and e.reziliat = false
    and e.este_reinscriere = true
    and e.data_incepere >= date_trunc('month', v_today)::date;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function cancel_expired_reinscrieri() to authenticated;
