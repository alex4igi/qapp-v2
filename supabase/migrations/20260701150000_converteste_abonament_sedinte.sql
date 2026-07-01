-- Conversie „abonament → ședințe" (invers față de converteste_sedinta_in_abonament).
--
-- Context: la cursurile facultative un client alege un abonament „Per luna", apoi se
-- răzgândește și vrea să plătească DOAR ședințele la care vine. Regula de business
-- (confirmată de user):
--   1) Încasăm doar ședințele deja PREZENTE în luna curentă (bifate `Prezent` pe
--      abonament). Ședințele viitoare NU se pre-încasează — se plătesc per-ședință
--      când clientul chiar vine. Un no-show viitor = 0 lei.
--   2) Dacă abonamentul era achitat peste valoarea ședințelor prezente, surplusul
--      rămâne credit în favoarea clientului (rest negativ), consumat la următoarea
--      plată — patternul `sold_favoare` din aproba_motivare_absenta.
--
-- Model DB (simetric cu conversia inversă):
--   (a) câte un rând `Per sedinta` per ședință prezentă (data = ziua ședinței);
--   (b) prezența se mută pe rândul cu data ei (triggerul trg_prezente_dedup păstrează
--       invariantul 1 prezență/(client,curs,zi));
--   (c) încasările abonamentului se realocă FIFO (cu split) peste rândurile noi, ca
--       fiecare ședință prezentă să apară achitată și surplusul să devină credit pe
--       ultimul rând — altfel mutarea în bloc ar lăsa rânduri cu restanță falsă;
--   (d) void curat al abonamentului (suma=suma_baza=0, reziliat) → fără restanță
--       fantomă (view-urile exclud reziliat=true; vezi invariant suma_baza).
--
-- Edge 0 ședințe prezente: dacă abonamentul e neachitat → void curat; dacă e achitat
-- → NU rezilia, doar suma=suma_baza=0 (banii rămân ca sold în favoare pe rând).
--
-- Idempotent: dacă abonamentul e deja reziliat, conversia s-a făcut.
-- Authz: front_desk și mai sus (recepția face conversia la ghișeu).

create or replace function converteste_abonament_in_sedinte(
  p_abonament uuid,
  p_motiv     text default 'Convertit din abonament în ședințe (facultativ)'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enr        enrollments%rowtype;
  v_facultativ boolean;
  v_pret       numeric;
  v_luna_start date;
  v_luna_end   date;
  v_platit     numeric;
  v_dates      date[];
  v_target_ids uuid[] := '{}';
  v_target_sum numeric[] := '{}';
  v_new_id     uuid;
  v_new_suma   numeric;
  v_d          date;
  v_total      numeric := 0;
  -- FIFO
  v_ti         int := 1;
  v_cap        numeric := 0;
  v_rem        numeric;
  v_take       numeric;
  v_first      boolean;
  v_tgt        uuid;
  inc          record;
begin
  if auth_role() not in ('admin', 'owner', 'manager', 'front_desk') then
    raise exception 'Acces refuzat.';
  end if;

  select * into v_enr from enrollments where id = p_abonament;
  if not found then
    raise exception 'Înrolarea nu există.';
  end if;
  if v_enr.reziliat then
    return jsonb_build_object('already_converted', true);
  end if;
  if v_enr.tip_plata <> 'Per luna' then
    raise exception 'Doar abonamentele „Per luna" se pot converti în ședințe.';
  end if;
  if v_enr.data_incepere is null then
    raise exception 'Abonamentul nu are lună (data_incepere).';
  end if;

  select c.facultativ, c.pret_sedinta into v_facultativ, v_pret
  from cursuri c where c.id = v_enr.cursul;
  if not coalesce(v_facultativ, false) then
    raise exception 'Conversia în ședințe e disponibilă doar pentru cursuri facultative.';
  end if;
  if v_pret is null or v_pret <= 0 then
    raise exception 'Cursul nu are „Preț ședință" setat.';
  end if;

  v_luna_start := date_trunc('month', v_enr.data_incepere)::date;
  v_luna_end   := (v_luna_start + interval '1 month - 1 day')::date;

  select coalesce(sum(i.suma), 0) into v_platit
  from incasari i where i.inregistrare = p_abonament;

  -- ședințe deja PREZENTE în lună (doar Prezent — Absent/Motivat nu se facturează)
  select coalesce(array_agg(p.data order by p.data), '{}')
    into v_dates
  from prezente p
  where p.enrollment = p_abonament
    and p.status = 'Prezent'
    and p.data >= v_luna_start and p.data <= v_luna_end;

  -- (a)+(b) creează un rând „Per sedinta" per ședință prezentă și mută prezența pe el.
  foreach v_d in array v_dates loop
    insert into enrollments (
      client, cursul, tip_plata, suma, suma_baza,
      data_incepere, data_final, activ, sezon_id
    ) values (
      v_enr.client, v_enr.cursul, 'Per sedinta', v_pret, v_pret,
      v_d, null, true, v_enr.sezon_id
    )
    returning id, suma into v_new_id, v_new_suma;  -- suma poate fi ajustată de triggerul de politică

    v_target_ids := array_append(v_target_ids, v_new_id);
    v_target_sum := array_append(v_target_sum, coalesce(v_new_suma, v_pret));
    v_total := v_total + coalesce(v_new_suma, v_pret);

    -- mută prezența acelei zile pe rândul nou (triggerul dedup păstrează invariantul)
    update prezente
      set enrollment = v_new_id, updated = now()
    where enrollment = p_abonament
      and data = v_d
      and status = 'Prezent';
  end loop;

  -- (c) realocă încasările FIFO (cu split) peste rândurile noi; surplusul → ultimul rând.
  if array_length(v_target_ids, 1) is not null then
    v_ti  := 1;
    v_cap := v_target_sum[1];
    for inc in
      select * from incasari
      where inregistrare = p_abonament
      order by data nulls first, created
    loop
      v_rem := inc.suma;
      v_first := true;
      while v_rem > 0.004 loop
        if v_ti > array_length(v_target_ids, 1) then
          -- capacitatea rândurilor s-a epuizat → surplus pe ultimul rând (credit)
          v_tgt  := v_target_ids[array_length(v_target_ids, 1)];
          v_take := v_rem;
        else
          v_tgt  := v_target_ids[v_ti];
          v_take := least(v_rem, v_cap);
        end if;

        if v_first then
          update incasari set inregistrare = v_tgt, suma = v_take, updated = now()
          where id = inc.id;
          v_first := false;
        else
          insert into incasari (
            client, inregistrare, data, suma, bucati, metoda, voucher, sezon,
            observatii, categorie, locatie
          )
          select client, v_tgt, data, v_take, bucati, metoda, voucher, sezon,
                 observatii, categorie, locatie
          from incasari where id = inc.id;
        end if;

        v_rem := round(v_rem - v_take, 2);
        if v_ti <= array_length(v_target_ids, 1) then
          v_cap := round(v_cap - v_take, 2);
          if v_cap <= 0.004 then
            v_ti  := v_ti + 1;
            if v_ti <= array_length(v_target_ids, 1) then
              v_cap := v_target_sum[v_ti];
            end if;
          end if;
        end if;
      end loop;
    end loop;
  end if;

  -- (d) închide abonamentul.
  if array_length(v_target_ids, 1) is null and v_platit > 0 then
    -- 0 ședințe prezente + achitat: nu rezilia (banii rămân ca sold în favoare pe rând),
    -- doar reduce luna la 0 (patternul sold_favoare).
    update enrollments
      set suma = 0, suma_baza = 0, updated = now()
    where id = p_abonament;
  else
    update enrollments
      set suma = 0,
          suma_baza = 0,
          reziliat = true,
          activ = false,
          motiv_reziliere = p_motiv,
          data_reziliere = now(),
          updated = now()
    where id = p_abonament;
  end if;

  return jsonb_build_object(
    'converted', true,
    'sedinte', coalesce(array_length(v_target_ids, 1), 0),
    'pret_sedinta', v_pret,
    'total_charged', v_total,
    'platit', v_platit,
    'credit', greatest(v_platit - v_total, 0),
    'datorie', greatest(v_total - v_platit, 0)
  );
end;
$$;

grant execute on function converteste_abonament_in_sedinte(uuid, text) to authenticated;
