-- Fix: activate_reinscriere_pe_sezon trebuie să seteze și `suma_baza`, nu doar `suma`.
--
-- Triggerul trg_enrollments_recalc (recalculate_pool_discount, migr. 20260518110000)
-- recalculează `suma` din `suma_baza` (politica de discount familie). RPC-ul seta doar
-- `suma = pret_lunar_promo`, iar triggerul o rescria imediat la coalesce(suma_baza,0) = 0,
-- deci prețul PROMO nu se aplica efectiv (clientul apărea cu 0 RON de plată).
-- Setăm `suma_baza = pret_lunar_promo` ca baza promo să intre corect în pool-ul de discount.

create or replace function activate_reinscriere_pe_sezon(
  p_client_id uuid,
  p_curs_tinta_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_promo numeric;
  v_sezon_id uuid;
  v_sezon_start date;
  v_sezon_end date;
  v_existing_id uuid;
  v_count int := 0;
begin
  select pret_lunar_promo, sezon
    into v_promo, v_sezon_id
  from cursuri
  where id = p_curs_tinta_id;

  if v_promo is null then
    raise exception 'Cursul țintă nu are preț promo configurat (pret_lunar_promo).';
  end if;
  if v_sezon_id is null then
    raise exception 'Cursul țintă nu este asociat unui sezon.';
  end if;

  select data_incepere, data_final
    into v_sezon_start, v_sezon_end
  from sezoane
  where id = v_sezon_id;

  select id into v_existing_id
  from enrollments
  where client = p_client_id
    and cursul = p_curs_tinta_id
    and sezon_id = v_sezon_id
    and reziliat = false
  order by created desc
  limit 1;

  if v_existing_id is not null then
    update enrollments
    set suma = v_promo,
        suma_baza = v_promo,
        este_reinscriere = true,
        activ = true,
        updated = now()
    where id = v_existing_id;
    v_count := 1;
  else
    insert into enrollments (
      client, cursul, sezon_id, tip_plata, suma, suma_baza,
      data_incepere, data_final, activ, este_reinscriere
    )
    values (
      p_client_id, p_curs_tinta_id, v_sezon_id, 'Per luna'::tip_plata, v_promo, v_promo,
      v_sezon_start, v_sezon_end, true, true
    );
    v_count := 1;
  end if;

  return v_count;
end;
$$;
