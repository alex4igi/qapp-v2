-- Folosirea creditului unui client (bani plătiți în plus, „rest negativ") — qapp v2.
-- Creditul apare când o înrolare/datorie plătită e redusă (vezi adjust_enrollment_price
-- cu acțiunea 'credit'). Acest RPC îl consumă ULTERIOR, la alegerea recepției:
--   'allocate' → mută creditul pe o altă datorie a clientului (înrolare SAU one-off).
--   'refund'   → restituie creditul (încasare negativă pe rândul-sursă).
-- Sursa creditului = rândurile cu rest < 0 (înrolări + datorii), consumate vechi→nou.
-- Mutarea se face prin split de încasări (ca la conversii), fără a atinge motorul FIFO.

create or replace function use_client_credit(
  p_client      uuid,
  p_amount      numeric,             -- cât credit se folosește
  p_action      text,                -- 'allocate' | 'refund'
  p_target_type text default null,   -- pt 'allocate': 'enrollment' | 'datorie'
  p_target_id   uuid default null,
  p_motiv       text default null
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_enr_neg     numeric;
  v_dat_neg     numeric;
  v_available   numeric;
  v_target_rest numeric;
  v_tcat        categorie_incasare;
  v_tloc        uuid;
  v_cap         numeric;
  v_remaining   numeric;
  v_used        numeric;
  v_take        numeric;
  v_row_rem     numeric;
  v_itake       numeric;
  v_src         record;
  v_inc         incasari%rowtype;
  v_m           metoda_plata;
  v_s           uuid;
  v_l           uuid;
  v_cat         categorie_incasare;
begin
  if auth_role() = 'parinte' then
    raise exception 'forbidden: acțiune de staff';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Suma de folosit trebuie să fie pozitivă.';
  end if;
  if p_action not in ('allocate', 'refund') then
    raise exception 'Acțiune invalidă: %', p_action;
  end if;

  -- credit disponibil = |suma resturilor negative| (înrolări + datorii)
  select coalesce(sum(rest), 0) into v_enr_neg from plati_inrolari where id_cursant = p_client and rest < 0;
  select coalesce(sum(rest), 0) into v_dat_neg from datorii_rest   where client = p_client and rest < 0;
  v_available := -(v_enr_neg + v_dat_neg);

  if v_available <= 0.004 then
    return jsonb_build_object('used', 0, 'action', p_action, 'available', 0, 'remaining_credit', 0);
  end if;

  if p_action = 'allocate' then
    if p_target_id is null or p_target_type is null then
      raise exception 'Ținta alocării lipsește.';
    end if;
    if p_target_type = 'enrollment' then
      select rest into v_target_rest from plati_inrolari where id_enrollment = p_target_id and id_cursant = p_client;
      v_tcat := 'Abonament';
      select c.locatie into v_tloc from enrollments e join cursuri c on c.id = e.cursul where e.id = p_target_id;
    elsif p_target_type = 'datorie' then
      select rest, categorie, locatie into v_target_rest, v_tcat, v_tloc
        from datorii_rest where id = p_target_id and client = p_client;
    else
      raise exception 'Tip țintă invalid: %', p_target_type;
    end if;
    if v_target_rest is null then
      raise exception 'Ținta nu există sau nu aparține clientului.';
    end if;
    v_cap := least(p_amount, v_available, greatest(v_target_rest, 0));
  else
    v_cap := least(p_amount, v_available);
  end if;

  if v_cap <= 0.004 then
    return jsonb_build_object('used', 0, 'action', p_action, 'available', v_available, 'remaining_credit', v_available);
  end if;

  v_remaining := v_cap;

  for v_src in
    select 'enrollment'::text as kind, e.id_enrollment as row_id, (-e.rest) as overpay,
           e.data_incepere::timestamptz as ord
      from plati_inrolari e where e.id_cursant = p_client and e.rest < 0
    union all
    select 'datorie', d.id, (-d.rest), d.created
      from datorii_rest d where d.client = p_client and d.rest < 0
    order by ord asc nulls last
  loop
    exit when v_remaining <= 0.004;
    v_take := least(v_remaining, v_src.overpay);
    if v_take <= 0.004 then continue; end if;

    if p_action = 'refund' then
      if v_src.kind = 'enrollment' then
        select metoda, sezon, locatie into v_m, v_s, v_l
          from incasari where inregistrare = v_src.row_id order by data desc nulls last, id desc limit 1;
        insert into incasari (client, inregistrare, data, suma, metoda, categorie, sezon, locatie, observatii)
          values (p_client, v_src.row_id, current_date, -v_take, coalesce(v_m, 'Cash'),
                  'Abonament', v_s, v_l, 'Restituire credit' || coalesce(': ' || nullif(btrim(p_motiv), ''), ''));
      else
        select metoda, sezon, locatie, categorie into v_m, v_s, v_l, v_cat
          from incasari where datorie = v_src.row_id order by data desc nulls last, id desc limit 1;
        insert into incasari (client, datorie, data, suma, metoda, categorie, sezon, locatie, observatii)
          values (p_client, v_src.row_id, current_date, -v_take, coalesce(v_m, 'Cash'),
                  coalesce(v_cat, 'Taxa'), v_s, v_l, 'Restituire credit' || coalesce(': ' || nullif(btrim(p_motiv), ''), ''));
      end if;

    else -- allocate: mută v_take de încasări de pe sursă pe țintă
      v_row_rem := v_take;
      for v_inc in
        select * from incasari
        where ((v_src.kind = 'enrollment' and inregistrare = v_src.row_id)
            or (v_src.kind = 'datorie'    and datorie = v_src.row_id))
          and coalesce(suma, 0) > 0
        order by data asc nulls last, id
      loop
        exit when v_row_rem <= 0.004;
        v_itake := least(v_row_rem, v_inc.suma);
        if v_itake >= v_inc.suma - 0.004 then
          if p_target_type = 'enrollment' then
            update incasari set inregistrare = p_target_id, datorie = null,
                   categorie = 'Abonament', updated = now() where id = v_inc.id;
          else
            update incasari set datorie = p_target_id, inregistrare = null,
                   categorie = v_tcat, updated = now() where id = v_inc.id;
          end if;
        else
          update incasari set suma = round(v_inc.suma - v_itake, 2), updated = now() where id = v_inc.id;
          if p_target_type = 'enrollment' then
            insert into incasari (client, inregistrare, data, suma, metoda, categorie, sezon, locatie, observatii)
              values (v_inc.client, p_target_id, v_inc.data, v_itake, v_inc.metoda,
                      'Abonament', v_inc.sezon, coalesce(v_inc.locatie, v_tloc), 'Folosire credit');
          else
            insert into incasari (client, datorie, data, suma, metoda, categorie, sezon, locatie, observatii)
              values (v_inc.client, p_target_id, v_inc.data, v_itake, v_inc.metoda,
                      v_tcat, v_inc.sezon, coalesce(v_tloc, v_inc.locatie), 'Folosire credit');
          end if;
        end if;
        v_row_rem := round(v_row_rem - v_itake, 2);
      end loop;
    end if;

    v_remaining := round(v_remaining - v_take, 2);
  end loop;

  v_used := round(v_cap - v_remaining, 2);

  return jsonb_build_object(
    'used',             v_used,
    'action',           p_action,
    'target_type',      p_target_type,
    'target_id',        p_target_id,
    'available',        v_available,
    'remaining_credit', round(v_available - v_used, 2)
  );
end;
$$;

revoke all on function use_client_credit(uuid, numeric, text, text, uuid, text) from public;
grant execute on function use_client_credit(uuid, numeric, text, text, uuid, text) to authenticated;
