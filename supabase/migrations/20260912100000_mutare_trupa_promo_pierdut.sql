-- Mutarea unei înrolări pe promo într-o TRUPĂ: promo-ul se pierde, lunile
-- neplătite trec pe tariful trupei (decizie Alex, 2026-09-12).
--
-- Context de business: audițiile pentru trupe au loc DUPĂ campania de
-- reînscriere promo. Copilul e reînscris implicit în grupa lui la preț promo ca
-- să-și țină locul; dacă ulterior intră în trupă, e mutat acolo. Deci mutarea
-- promo → trupă e fluxul normal, nu un caz-limită.
--
-- Până acum RPC-ul ridica excepție („cursul nu are Preț lunar PROMO"), iar
-- singura ieșire era debifarea aplicării tarifului — care lăsa promo-ul grupei
-- (ex. 260) pe o trupă de 290, cu `este_reinscriere` rămas true. În plus,
-- motorul de reduceri nu mai recunoștea rândul ca promo (trupele au
-- `pret_lunar_promo` null), deci la următorul recalcul din familie putea da și
-- −10% peste prețul promo — exact cumularea interzisă de
-- `20260831120000_promo_family_neacumulabile`.
--
-- Reguli noi, doar când cursul ȚINTĂ e trupă (`nivelul = 'Trupa'`):
--   • Promo-ul se pierde pe TOATE lunile mutate: `este_reinscriere = false` +
--     `promo_anulat_la` (aceeași urmă istorică pe care o lasă
--     `trg_reziliere_incheie_promo` la reziliere).
--   • Lunile neplătite din luna curentă încolo — INCLUSIV luna selectată —
--     trec pe rata normală a trupei (`pret_anual / 10`).
--   • Lunile deja plătite și cele din trecut rămân la prețul lor: nu rescriem
--     plăți făcute și nu taxăm cu tariful trupei o lună petrecută în grupă.
--     Sunt raportate separat (`promo_platite`), ca recepția să știe.
--   • Pierderea promo-ului NU depinde de bifa „Aplică tariful noului curs":
--     e regulă de business, nu opțiune. Bifa rămâne pentru rândurile obișnuite.
--
-- La GRUPE nu se schimbă nimic: acolo lipsa prețului promo e fișă incompletă,
-- deci excepția rămâne (vezi `20260828180000_reinscrieri_fara_trupe`).

create or replace function muta_inrolare_curs(
  p_enrollment       uuid,
  p_curs_nou         uuid,
  p_motiv            text,
  p_aplica_tarif_nou boolean default true,
  p_simulare         boolean default false
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_enr           enrollments%rowtype;
  v_curs_nou      cursuri%rowtype;
  v_sezon_final   date;
  v_limita        date;
  v_luna_sursa    date;
  v_luna_curenta  date := date_trunc('month', current_date)::date;
  v_ids           uuid[];
  v_luni          text[];
  v_candidate     uuid[];
  v_repretuite    uuid[];
  v_platite       int  := 0;
  v_rata_normala  numeric;
  v_rata_promo    numeric;
  v_are_promo     boolean;
  v_conflict      text;
  v_e_trupa       boolean;
  v_promo_ids     uuid[];
  v_promo_pierdut boolean := false;
  v_promo_platite int  := 0;
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
  v_e_trupa := v_curs_nou.nivelul::text = 'Trupa';

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

  -- Țintă trupă ⇒ promo-ul se pierde pe toată seria mutată.
  if v_e_trupa then
    select exists (
      select 1 from enrollments e
      where e.id = any(v_ids) and e.este_reinscriere
    ) into v_promo_pierdut;

    if v_promo_pierdut then
      if v_rata_normala is null then
        raise exception 'Trupa „%" nu are preț anual configurat, deci nu se poate calcula rata lunară. Completează fișa cursului.',
          v_curs_nou.numele;
      end if;

      -- Repreţuite: lunile neplătite din luna curentă încolo, inclusiv cea selectată.
      select array_agg(e.id order by e.data_incepere)
        into v_promo_ids
      from enrollments e
      where e.id = any(v_ids)
        and e.este_reinscriere
        and e.tip_plata = 'Per luna'
        and e.data_incepere >= v_luna_curenta
        and not exists (
          select 1 from incasari i
          where i.inregistrare = e.id and coalesce(i.suma, 0) > 0
        );

      -- Restul rândurilor pe promo: plătite sau din trecut ⇒ preț neatins.
      select count(*) into v_promo_platite
      from enrollments e
      where e.id = any(v_ids)
        and e.este_reinscriere
        and not (e.id = any(coalesce(v_promo_ids, '{}'::uuid[])));
    end if;
  end if;

  -- Candidate la repreţuire: lunile de DUPĂ cea mutată, „Per luna", din luna
  -- curentă încolo, fără nicio încasare. Rândurile pe promo mutate în trupă au
  -- deja tratamentul lor de mai sus.
  select array_agg(e.id order by e.data_incepere)
    into v_candidate
  from enrollments e
  where e.id = any(v_ids)
    and e.tip_plata = 'Per luna'
    and date_trunc('month', e.data_incepere)::date > v_luna_sursa
    and e.data_incepere >= v_luna_curenta
    and not (v_e_trupa and e.este_reinscriere)
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
    -- La grupe promo-ul e obligatoriu: lipsa lui e fișă incompletă.
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
      'simulare',      true,
      'mutate',        coalesce(array_length(v_ids, 1), 0),
      'luni',          coalesce(to_jsonb(v_luni), '[]'::jsonb),
      'repretuite',    coalesce(array_length(v_repretuite, 1), 0),
      'platite',       v_platite,
      'tarif',         case when p_aplica_tarif_nou or v_promo_pierdut then v_rata_normala end,
      'tarif_promo',   case when p_aplica_tarif_nou then v_rata_promo end,
      'promo_pierdut', v_promo_pierdut,
      'promo_luni',    coalesce(array_length(v_promo_ids, 1), 0),
      'promo_platite', v_promo_platite
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

  if coalesce(array_length(v_promo_ids, 1), 0) > 0 then
    update enrollments e
       set suma_baza        = v_rata_normala,
           este_reinscriere = false,
           promo_anulat_la  = coalesce(e.promo_anulat_la, now()),
           updated          = now()
     where e.id = any(v_promo_ids);
  end if;

  -- Lunile plătite/din trecut își păstrează prețul, dar nu mai sunt „promo":
  -- trupa nu are preț de reînscriere.
  if v_promo_pierdut then
    update enrollments e
       set este_reinscriere = false,
           promo_anulat_la  = coalesce(e.promo_anulat_la, now()),
           updated          = now()
     where e.id = any(v_ids)
       and e.este_reinscriere;
  end if;

  return jsonb_build_object(
    'simulare',      false,
    'mutate',        coalesce(array_length(v_ids, 1), 0),
    'luni',          coalesce(to_jsonb(v_luni), '[]'::jsonb),
    'repretuite',    coalesce(array_length(v_repretuite, 1), 0),
    'platite',       v_platite,
    'tarif',         case when p_aplica_tarif_nou or v_promo_pierdut then v_rata_normala end,
    'tarif_promo',   case when p_aplica_tarif_nou then v_rata_promo end,
    'promo_pierdut', v_promo_pierdut,
    'promo_luni',    coalesce(array_length(v_promo_ids, 1), 0),
    'promo_platite', v_promo_platite,
    'curs_vechi',    v_enr.cursul,
    'curs_nou',      p_curs_nou
  );
end;
$$;

revoke all on function muta_inrolare_curs(uuid, uuid, text, boolean, boolean) from anon, public;
grant execute on function muta_inrolare_curs(uuid, uuid, text, boolean, boolean) to authenticated;

-- Mutarea schimbă cursul, deci schimbă prețul de listă cu care rândul intră în
-- ranking-ul pool-ului (cine rămâne integral, cine ia −10%). Fără `cursul` în
-- lista coloanelor urmărite, o mutare fără repreţuire lăsa reducerile calculate
-- pe cursul VECHI până la următoarea modificare din familie.
-- `suma` și `politica_discount` rămân în afara listei (evităm bucla).
drop trigger if exists trg_enrollments_recalc on enrollments;
create trigger trg_enrollments_recalc
  after insert or delete
     or update of voucher, reziliat, activ, suma_baza, client, data_incepere,
                  tip_plata, cursul
  on enrollments
  for each row
  execute function trg_enrollments_recalc_pool();
