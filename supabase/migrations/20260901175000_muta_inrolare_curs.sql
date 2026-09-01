-- Mutarea unui cursant de la un curs recurent la altul mută TOATĂ seria, nu doar
-- luna deschisă în modal.
--
-- Context: până acum `moveEnrollmentToCurs` (TS) muta un singur rând și RE­ZILIA
-- lunile ulterioare pe cursul vechi. Rezultatul: cursantul apărea în grupa nouă o
-- singură lună, iar restul sezonului îi era anulat — exact invers față de ce
-- înseamnă o mutare („dacă se mută, se mută cu totul").
--
-- Reguli:
--   • Seria mutată = rândul selectat + toate înrolările ULTERIOARE ale clientului
--     pe cursul vechi, nereziliate, până la finalul sezonului cursului NOU.
--     Lunile anterioare rămân pe cursul vechi (istoric).
--   • Sursă „Per sedinta" (drop-in) ⇒ se mută doar acel rând; o ședință e un
--     eveniment punctual, nu o serie. Ședințele drop-in ulterioare nu sunt atinse.
--   • Gard anti-dublură: dacă pe cursul nou clientul are deja înrolări care se
--     suprapun peste perioada mutată, mutarea e refuzată (nu creăm 2× aceeași lună).
--   • `sezon_id` se re-derivă din cursul nou (coloana derivă din curs — vezi
--     trigger-ul `_enrollment_derive_sezon`).
--   • Banii NU se mișcă: încasările rămân legate de aceleași înrolări.
--   • `p_aplica_tarif_nou` (implicit true): lunile ULTERIOARE celei mutate, „Per
--     luna", fără nicio încasare și din luna curentă încolo, primesc tariful
--     cursului nou (`suma_baza`). Luna selectată și lunile deja (parțial) plătite
--     rămân la prețul lor — plata făcută nu se rescrie. `suma` + reducerile se
--     recalculează singure prin trigger-ul `trg_enrollments_recalc`.
--   • `p_simulare`: rulează toate gărzile și întoarce ce s-ar întâmpla, fără să
--     scrie — modalul îl folosește ca preview.

create or replace function muta_inrolare_curs(
  p_enrollment       uuid,
  p_curs_nou         uuid,
  p_motiv            text,
  p_aplica_tarif_nou boolean default true,
  p_simulare         boolean default false
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_enr          enrollments%rowtype;
  v_curs_nou     cursuri%rowtype;
  v_sezon_final  date;
  v_limita       date;
  v_luna_sursa   date;
  v_luna_curenta date := date_trunc('month', current_date)::date;
  v_ids          uuid[];
  v_luni         text[];
  v_candidate    uuid[];
  v_repretuite   uuid[];
  v_platite      int  := 0;
  v_rata_normala numeric;
  v_rata_promo   numeric;
  v_are_promo    boolean;
  v_conflict     text;
begin
  if not (is_front_desk() or is_manager() or is_admin()) then
    raise exception 'forbidden: doar recepția+ poate muta înrolări între cursuri';
  end if;
  if p_motiv is null or btrim(p_motiv) = '' then
    raise exception 'Motivul e obligatoriu.';
  end if;

  select * into v_enr from enrollments where id = p_enrollment;
  if not found then raise exception 'Înrolarea nu există.'; end if;
  if v_enr.reziliat then
    raise exception 'Înrolarea e reziliată — nu se mai mută.';
  end if;
  if v_enr.cursul is null then
    raise exception 'Înrolarea nu are curs asociat.';
  end if;
  if v_enr.data_incepere is null then
    raise exception 'Înrolarea nu are dată de început.';
  end if;
  if v_enr.cursul = p_curs_nou then
    raise exception 'Cursul nou e identic cu cel curent.';
  end if;

  select * into v_curs_nou from cursuri where id = p_curs_nou;
  if not found then raise exception 'Cursul nou nu există.'; end if;

  select s.data_final into v_sezon_final
    from sezoane s where s.id = v_curs_nou.sezon;

  v_luna_sursa := date_trunc('month', v_enr.data_incepere)::date;
  v_limita     := coalesce(v_sezon_final, date '9999-12-31');

  -- Seria: rândul selectat + lunile ulterioare pe cursul vechi. Drop-in-urile
  -- („Per sedinta") nu intră în serie; doar rândul selectat, dacă el e drop-in.
  select array_agg(e.id order by e.data_incepere),
         array_agg(to_char(e.data_incepere, 'MM.YYYY') order by e.data_incepere)
    into v_ids, v_luni
  from enrollments e
  where e.client = v_enr.client
    and e.cursul = v_enr.cursul
    and not e.reziliat
    and e.data_incepere is not null
    and e.data_incepere >= v_enr.data_incepere
    and e.data_incepere <= v_limita
    and (
      e.id = p_enrollment
      or (v_enr.tip_plata <> 'Per sedinta' and e.tip_plata <> 'Per sedinta')
    );

  if v_ids is null or not (p_enrollment = any(v_ids)) then
    raise exception 'Luna înrolării (%) e în afara sezonului cursului nou (sezon până la %).',
      to_char(v_enr.data_incepere, 'MM.YYYY'), v_sezon_final;
  end if;

  -- Dublură pe cursul nou: orice înrolare nereziliată care se suprapune peste
  -- perioada mutată. Drop-in-urile sunt legitime în paralel, deci sunt excluse.
  select string_agg(distinct to_char(e.data_incepere, 'MM.YYYY'), ', ')
    into v_conflict
  from enrollments e
  where e.client = v_enr.client
    and e.cursul = p_curs_nou
    and not e.reziliat
    and e.tip_plata <> 'Per sedinta'
    and exists (
      select 1 from enrollments m
      where m.id = any(v_ids)
        and m.tip_plata <> 'Per sedinta'
        and m.data_incepere <= coalesce(e.data_final, date '9999-12-31')
        and e.data_incepere <= coalesce(m.data_final, date '9999-12-31')
    );
  if v_conflict is not null then
    raise exception 'Clientul are deja înrolări pe cursul nou în perioada mutată (%). Rezolvă dublura întâi.', v_conflict;
  end if;

  -- Tariful cursului nou pentru lunile viitoare.
  v_rata_normala := case
    when v_curs_nou.facultativ then v_curs_nou.pret_lunar
    when v_curs_nou.pret_anual is not null then round(v_curs_nou.pret_anual / 10.0)
  end;
  v_rata_promo := v_curs_nou.pret_lunar_promo;

  -- Candidate la repreţuire: lunile de DUPĂ cea mutată, „Per luna", din luna
  -- curentă încolo, fără nicio încasare.
  select array_agg(e.id order by e.data_incepere)
    into v_candidate
  from enrollments e
  where e.id = any(v_ids)
    and e.tip_plata = 'Per luna'
    and date_trunc('month', e.data_incepere)::date > v_luna_sursa
    and e.data_incepere >= v_luna_curenta
    and not exists (
      select 1 from incasari i
      where i.inregistrare = e.id and coalesce(i.suma, 0) > 0
    );

  select count(*) into v_platite
  from enrollments e
  where e.id = any(v_ids)
    and date_trunc('month', e.data_incepere)::date > v_luna_sursa
    and exists (
      select 1 from incasari i
      where i.inregistrare = e.id and coalesce(i.suma, 0) > 0
    );

  if p_aplica_tarif_nou and coalesce(array_length(v_candidate, 1), 0) > 0 then
    if v_rata_normala is null then
      raise exception 'Cursul „%" nu are tarif lunar setat (Preț anual / Preț lunar). Completează-l în fișa cursului sau debifează aplicarea tarifului.',
        v_curs_nou.numele;
    end if;
    select exists (
      select 1 from enrollments e
      where e.id = any(v_candidate) and e.este_reinscriere
    ) into v_are_promo;
    if v_are_promo and (v_rata_promo is null or v_rata_promo <= 0) then
      raise exception 'Clientul e pe preț de reînscriere, iar cursul „%" nu are „Preț lunar PROMO". Setează-l în fișa cursului sau debifează aplicarea tarifului.',
        v_curs_nou.numele;
    end if;

    select array_agg(e.id order by e.data_incepere)
      into v_repretuite
    from enrollments e
    where e.id = any(v_candidate)
      and e.suma_baza is distinct from (
        case when e.este_reinscriere then v_rata_promo else v_rata_normala end
      );
  end if;

  if p_simulare then
    return jsonb_build_object(
      'simulare',    true,
      'mutate',      coalesce(array_length(v_ids, 1), 0),
      'luni',        coalesce(to_jsonb(v_luni), '[]'::jsonb),
      'repretuite',  coalesce(array_length(v_repretuite, 1), 0),
      'platite',     v_platite,
      'tarif',       case when p_aplica_tarif_nou then v_rata_normala end,
      'tarif_promo', case when p_aplica_tarif_nou then v_rata_promo end
    );
  end if;

  update enrollments e
     set cursul   = p_curs_nou,
         sezon_id = coalesce(v_curs_nou.sezon, e.sezon_id),
         updated  = now()
   where e.id = any(v_ids);

  -- suma_baza declanșează trg_enrollments_recalc → suma + reducerile se
  -- recalculează pe tot pool-ul (familie/cross-sell), inclusiv voucherele.
  if coalesce(array_length(v_repretuite, 1), 0) > 0 then
    update enrollments e
       set suma_baza = case when e.este_reinscriere then v_rata_promo else v_rata_normala end,
           updated   = now()
     where e.id = any(v_repretuite);
  end if;

  return jsonb_build_object(
    'simulare',    false,
    'mutate',      coalesce(array_length(v_ids, 1), 0),
    'luni',        coalesce(to_jsonb(v_luni), '[]'::jsonb),
    'repretuite',  coalesce(array_length(v_repretuite, 1), 0),
    'platite',     v_platite,
    'tarif',       case when p_aplica_tarif_nou then v_rata_normala end,
    'tarif_promo', case when p_aplica_tarif_nou then v_rata_promo end,
    'curs_vechi',  v_enr.cursul,
    'curs_nou',    p_curs_nou
  );
end;
$$;

revoke all on function muta_inrolare_curs(uuid, uuid, text, boolean, boolean) from anon, public;
grant execute on function muta_inrolare_curs(uuid, uuid, text, boolean, boolean) to authenticated;
