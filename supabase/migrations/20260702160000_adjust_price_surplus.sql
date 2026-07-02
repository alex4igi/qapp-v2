-- Ajustare preț înrolare cu gestionarea surplusului (credit) — qapp v2.
-- Context: la reducerea sumei unei înrolări DEJA plătite rezultă un surplus
-- (plătit − suma nouă). Vechiul cod lăsa surplusul „prins" ca rest negativ pe
-- luna trecută, invizibil, și NU alinia suma_baza (portalul părinte arăta fals
-- „reducere = suma_baza − suma"). Acest RPC face totul atomic:
--   1) suma = suma_baza = suma nouă  (repară invariantul suma_baza).
--   2) surplusul e tratat după alegerea recepției:
--        'allocate' → mută min(surplus, rest țintă) pe altă datorie a clientului
--                     (înrolare SAU one-off: bilet/merch/taxă), prin split de încasări.
--        'refund'   → încasare negativă (credit note) = banii ies, restul devine 0.
--        'credit'   → nu atinge încasările; surplusul rămâne credit vizibil pe profil.
-- Ținta alocării e generală (nu doar abonamente): incasari pointează fie
-- `inregistrare` (înrolare), fie `datorie` (one-off).

create or replace function adjust_enrollment_price(
  p_enrollment     uuid,
  p_new_suma       numeric,
  p_motiv          text,
  p_surplus_action text default 'none',   -- 'none' | 'allocate' | 'credit' | 'refund'
  p_target_type    text default null,      -- 'enrollment' | 'datorie' (doar la 'allocate')
  p_target_id      uuid default null
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_enr          enrollments%rowtype;
  v_client       uuid;
  v_paid         numeric;
  v_surplus      numeric;
  v_move         numeric := 0;
  v_rem          numeric;
  v_target_rest  numeric;
  v_target_cat   categorie_incasare;
  v_target_loc   uuid;
  v_refunded     numeric := 0;
  v_credit_left  numeric := 0;
  v_inc          incasari%rowtype;
  v_take         numeric;
  v_metoda       metoda_plata;
  v_sezon        uuid;
  v_locatie      uuid;
begin
  if not (is_manager() or is_admin()) then
    raise exception 'forbidden: doar managerul+ poate ajusta prețul înrolării';
  end if;
  if p_motiv is null or btrim(p_motiv) = '' then
    raise exception 'Motivul e obligatoriu.';
  end if;
  if p_new_suma is null or p_new_suma < 0 then
    raise exception 'Suma trebuie să fie un număr pozitiv.';
  end if;

  select * into v_enr from enrollments where id = p_enrollment;
  if not found then raise exception 'Înrolarea nu există.'; end if;
  v_client := v_enr.client;

  select coalesce(sum(suma), 0) into v_paid from incasari where inregistrare = p_enrollment;
  v_surplus := round(v_paid - p_new_suma, 2);

  -- (1) suma + suma_baza = suma nouă. Pe rând plătit (incasari > 0), triggerul de
  -- discount îl sare, deci valoarea manuală rămâne. Al doilea update forțează `suma`
  -- (triggerul NU monitorizează coloana suma) pentru rândurile neplătite, ca prețul
  -- manual să rămână autoritar chiar dacă recalc-ul de pool ar reaplica un discount.
  update enrollments set suma = p_new_suma, suma_baza = p_new_suma, updated = now()
    where id = p_enrollment;
  update enrollments set suma = p_new_suma where id = p_enrollment;

  -- (2) gestionarea surplusului
  if v_surplus > 0.004 and p_surplus_action <> 'none' then

    if p_surplus_action = 'allocate' then
      if p_target_id is null or p_target_type is null then
        raise exception 'Ținta alocării lipsește.';
      end if;

      if p_target_type = 'enrollment' then
        select rest into v_target_rest
          from plati_inrolari where id_enrollment = p_target_id and id_cursant = v_client;
        v_target_cat := 'Abonament';
        select c.locatie into v_target_loc
          from enrollments e join cursuri c on c.id = e.cursul where e.id = p_target_id;
      elsif p_target_type = 'datorie' then
        select rest into v_target_rest
          from datorii_rest where id = p_target_id and client = v_client;
        select categorie, locatie into v_target_cat, v_target_loc
          from datorii where id = p_target_id;
      else
        raise exception 'Tip țintă invalid: %', p_target_type;
      end if;

      if v_target_rest is null then
        raise exception 'Ținta nu există sau nu aparține clientului.';
      end if;

      v_move := least(v_surplus, greatest(v_target_rest, 0));

      if v_move > 0.004 then
        v_rem := v_move;
        for v_inc in
          select * from incasari
          where inregistrare = p_enrollment and coalesce(suma, 0) > 0
          order by data asc nulls last, id
        loop
          exit when v_rem <= 0.004;
          v_take := least(v_rem, v_inc.suma);

          if v_take >= v_inc.suma - 0.004 then
            -- mută tot rândul pe țintă
            if p_target_type = 'enrollment' then
              update incasari
                set inregistrare = p_target_id, datorie = null,
                    categorie = 'Abonament', updated = now()
                where id = v_inc.id;
            else
              update incasari
                set datorie = p_target_id, inregistrare = null,
                    categorie = v_target_cat, updated = now()
                where id = v_inc.id;
            end if;
          else
            -- split: reduce sursa cu v_take, inserează v_take pe țintă
            update incasari set suma = round(v_inc.suma - v_take, 2), updated = now()
              where id = v_inc.id;
            if p_target_type = 'enrollment' then
              insert into incasari (client, inregistrare, data, suma, metoda, categorie, sezon, locatie, observatii)
                values (v_inc.client, p_target_id, v_inc.data, v_take, v_inc.metoda,
                        'Abonament', v_inc.sezon, coalesce(v_inc.locatie, v_target_loc),
                        'Alocare credit din ajustare preț');
            else
              insert into incasari (client, datorie, data, suma, metoda, categorie, sezon, locatie, observatii)
                values (v_inc.client, p_target_id, v_inc.data, v_take, v_inc.metoda,
                        v_target_cat, v_inc.sezon, coalesce(v_target_loc, v_inc.locatie),
                        'Alocare credit din ajustare preț');
            end if;
          end if;

          v_rem := round(v_rem - v_take, 2);
        end loop;
      end if;

      v_credit_left := round(v_surplus - v_move, 2);

    elsif p_surplus_action = 'refund' then
      -- credit note: încasare negativă pe aceeași înrolare → net plătit scade la suma nouă
      select metoda, sezon, locatie into v_metoda, v_sezon, v_locatie
        from incasari where inregistrare = p_enrollment order by data desc nulls last, id desc limit 1;
      insert into incasari (client, inregistrare, data, suma, metoda, categorie, sezon, locatie, observatii)
        values (v_client, p_enrollment, current_date, -v_surplus, coalesce(v_metoda, 'Cash'),
                'Abonament', v_sezon, v_locatie, 'Restituire surplus (ajustare preț): ' || btrim(p_motiv));
      v_refunded := v_surplus;

    elsif p_surplus_action = 'credit' then
      -- surplusul rămâne credit (rest negativ) pe rând, vizibil pe profil
      v_credit_left := v_surplus;
    else
      raise exception 'Acțiune surplus invalidă: %', p_surplus_action;
    end if;
  end if;

  return jsonb_build_object(
    'old_suma',    v_enr.suma,
    'new_suma',    p_new_suma,
    'paid',        v_paid,
    'surplus',     greatest(v_surplus, 0),
    'action',      case when v_surplus > 0.004 then p_surplus_action else 'none' end,
    'moved',       v_move,
    'refunded',    v_refunded,
    'credit_left', greatest(v_credit_left, 0)
  );
end;
$$;

revoke all on function adjust_enrollment_price(uuid, numeric, text, text, text, uuid) from public;
grant execute on function adjust_enrollment_price(uuid, numeric, text, text, text, uuid) to authenticated;
