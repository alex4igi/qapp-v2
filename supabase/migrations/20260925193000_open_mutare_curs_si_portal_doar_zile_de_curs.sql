-- OPEN: două goluri de același fel ca cel din 25.09 (Moraru) — omul plătit nu
-- apare în rosterul ședinței reale.
--
-- 1) muta_inrolare_curs pe o ședință OPEN „Per ședință" mută acum și rezervarea
--    pe sesiunea cursului nou din aceeași zi (creată la nevoie). Înainte, rezervarea
--    rămânea pe grupa veche (Bobutanu, 09.07.2026). Refuză dacă grupa nouă nu se
--    ține în ziua aceea, e plină, e suspendată sau clientul e deja acolo.
-- 2) Portalul nu mai listează și nu mai rezervă sesiuni pe zile în care grupa nu
--    se ține: sesiunea-fantomă din 23.09 a stat la vânzare online tot restul zilei.
--    Asumat (Alex, 25.09): o ședință reprogramată pe altă zi nu apare în portal.

CREATE OR REPLACE FUNCTION public.muta_inrolare_curs(p_enrollment uuid, p_curs_nou uuid, p_motiv text, p_aplica_tarif_nou boolean DEFAULT true, p_simulare boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_n_rez         int;
  v_rez_id        uuid;
  v_rez_data      date;
  v_ses_veche     uuid;
  v_ses_noua      uuid;
  v_ses_cap       int;
  v_ses_status    text;
  v_ses_ocupate   int;
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

  -- Ședința OPEN plătită se mută odată cu înrolarea: rosterul grupei citește
  -- rezervarea, nu doar înrolarea (Bobutanu, 09.07.2026, rămăsese pe grupa veche).
  -- Verificat înainte de simulare, ca modalul să blocheze submit-ul.
  if v_enr.tip_plata = 'Per sedinta' then
    select count(*) into v_n_rez
      from open_rezervari r
     where r.enrollment = p_enrollment and r.status in ('rezervat', 'platit');
    if v_n_rez > 1 then
      raise exception 'Înrolarea are % rezervări OPEN active — cere unui manager.', v_n_rez;
    end if;
    if v_n_rez = 1 then
      select r.id, r.sesiune, s.data into v_rez_id, v_ses_veche, v_rez_data
        from open_rezervari r
        join open_sesiuni s on s.id = r.sesiune
       where r.enrollment = p_enrollment and r.status in ('rezervat', 'platit');

      if not coalesce(v_curs_nou.facultativ, false) then
        raise exception 'Ședința OPEN se poate muta doar pe un curs facultativ — anulează rezervarea și înscrie-l pe grupa nouă.';
      end if;
      if not curs_activ_in_luna(p_curs_nou, v_rez_data) then
        raise exception 'Grupa nouă este suspendată în luna ședinței (%).', to_char(v_rez_data, 'DD.MM.YYYY');
      end if;

      select id, capacitate, status into v_ses_noua, v_ses_cap, v_ses_status
        from open_sesiuni where curs = p_curs_nou and data = v_rez_data;
      if v_ses_noua is null
         and not ((array['Duminica','Luni','Marti','Miercuri','Joi','Vineri','Sambata']::zi_saptamana[])[extract(dow from v_rez_data)::int + 1]
                  = any (coalesce(v_curs_nou.zile, '{}'))) then
        raise exception 'Cursul „%" nu are ședință pe % (se ține: %). Corectează întâi data sau alege altă grupă.',
          v_curs_nou.numele, to_char(v_rez_data, 'DD.MM.YYYY'), array_to_string(v_curs_nou.zile, ', ');
      end if;
      if v_ses_noua is not null then
        if v_ses_status = 'anulata' then
          raise exception 'Ședința din % a cursului nou este anulată.', to_char(v_rez_data, 'DD.MM.YYYY');
        end if;
        if exists (
          select 1 from open_rezervari
           where sesiune = v_ses_noua and client = v_enr.client and status <> 'anulat'
        ) then
          raise exception 'Clientul are deja o rezervare la ședința din % a cursului nou.', to_char(v_rez_data, 'DD.MM.YYYY');
        end if;
        select count(*) into v_ses_ocupate
          from open_rezervari where sesiune = v_ses_noua and status <> 'anulat';
        if v_ses_ocupate >= v_ses_cap then
          raise exception 'Ședința din % a cursului nou e completă (% / %).',
            to_char(v_rez_data, 'DD.MM.YYYY'), v_ses_ocupate, v_ses_cap;
        end if;
      end if;
    end if;
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

  if v_rez_id is not null then
    insert into open_sesiuni (curs, data, capacitate)
    values (p_curs_nou, v_rez_data, coalesce(v_curs_nou.capacitate_maxima, 35))
    on conflict (curs, data) do update set instructor = open_sesiuni.instructor
    returning id into v_ses_noua;

    -- Același zăvor ca în rezerva_loc_open; capacitatea se re-verifică sub el.
    select capacitate into v_ses_cap from open_sesiuni where id = v_ses_noua for update;
    select count(*) into v_ses_ocupate
      from open_rezervari where sesiune = v_ses_noua and status <> 'anulat';
    if v_ses_ocupate >= v_ses_cap then
      raise exception 'Ședința din % a cursului nou e completă (% / %).',
        to_char(v_rez_data, 'DD.MM.YYYY'), v_ses_ocupate, v_ses_cap;
    end if;

    update open_rezervari set sesiune = v_ses_noua where id = v_rez_id;

    -- Sesiunea veche dispare doar dacă e fantomă (goală + zi fără curs).
    delete from open_sesiuni s
     using cursuri c
     where s.id = v_ses_veche
       and c.id = s.curs
       and not ((array['Duminica','Luni','Marti','Miercuri','Joi','Vineri','Sambata']::zi_saptamana[])[extract(dow from s.data)::int + 1] = any (coalesce(c.zile, '{}')))
       and not exists (select 1 from open_rezervari r where r.sesiune = s.id)
       and not exists (select 1 from feedback f where f.open_sesiune = s.id);
  end if;

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
    'curs_nou',      p_curs_nou,
    'rezervare_mutata', v_rez_id is not null
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_open_sesiuni_client(p_locatie uuid DEFAULT NULL::uuid)
 RETURNS TABLE(sesiune_id uuid, curs_id uuid, curs_nume text, data date, locuri_ramase integer, capacitate integer, pret numeric, instructor_nume text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select s.id, c.id, c.numele, s.data::date,
         (s.capacitate - occ.n)::integer,
         s.capacitate,
         c.pret_sedinta,
         coalesce(t.nume, s.instructor_manual)
  from open_sesiuni s
  join cursuri c on c.id = s.curs
    and coalesce(c.facultativ, false)
    and coalesce(c.rezervari_online, false)
    -- Grupa suspendată nu se mai vinde. Verificarea e pe DATA sesiunii, nu pe
    -- „acum": o sesiune dintr-o lună dinaintea opririi rămâne validă.
    and curs_activ_in_luna(c.id, s.data::date)
    -- Doar zilele din orar: o sesiune-fantomă (dată greșită la recepție) nu se
    -- vinde online. Asumat: o ședință reprogramată pe altă zi nu apare în portal.
    and (array['Duminica','Luni','Marti','Miercuri','Joi','Vineri','Sambata']::zi_saptamana[])[extract(dow from s.data)::int + 1] = any (coalesce(c.zile, '{}'))
  left join teacheri t on t.id = s.instructor
  cross join lateral (
    select count(*) as n from (
      select r.client from open_rezervari r
      where r.sesiune = s.id and r.status <> 'anulat'
      union
      select e.client from enrollments e
      where e.cursul = c.id
        and e.client is not null
        and e.reziliat = false
        and e.tip_plata in ('Per luna', 'Per an')
        and e.data_incepere <= s.data::date
        and (e.data_final is null or e.data_final >= s.data::date)
    ) occupants
  ) occ
  where s.data >= current_date
    and s.status <> 'anulata'
    and (p_locatie is null or c.locatie = p_locatie)
    and (s.capacitate - occ.n) > 0
  order by s.data asc;
$function$
;

CREATE OR REPLACE FUNCTION public.hold_loc_open(p_client uuid, p_sesiune uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cap     integer;
  v_status  text;
  v_curs    uuid;
  v_data    date;
  v_count   integer;
  v_pret    numeric;
  v_rez     uuid;
begin
  -- authz: doar conturi parinte, doar pentru membrii propriei familii
  if not is_parinte() then
    raise exception 'forbidden';
  end if;
  if p_client not in (select client_member_ids()) then
    raise exception 'forbidden: clientul nu aparține familiei contului';
  end if;

  -- blochează rândul sesiunii → serializează rezervările concurente
  select s.capacitate, s.status, s.curs, s.data::date into v_cap, v_status, v_curs, v_data
  from open_sesiuni s where s.id = p_sesiune for update;
  if not found then
    raise exception 'Sesiunea nu există.';
  end if;
  if v_status = 'anulata' then
    raise exception 'Sesiunea este anulată.';
  end if;
  -- Aceeași regulă ca list_open_sesiuni_client: din portal nu se rezervă o
  -- sesiune pe o zi în care grupa nu se ține (sesiune-fantomă).
  if not exists (
    select 1 from cursuri c
     where c.id = v_curs
       and (array['Duminica','Luni','Marti','Miercuri','Joi','Vineri','Sambata']::zi_saptamana[])[extract(dow from v_data)::int + 1] = any (coalesce(c.zile, '{}'))
  ) then
    raise exception 'Sesiunea nu mai este disponibilă online.';
  end if;

  -- preț din curs + validare facultativ + bifa de rezervări online
  select c.pret_sedinta into v_pret
  from cursuri c
  where c.id = v_curs
    and coalesce(c.facultativ, false)
    and coalesce(c.rezervari_online, false);
  if not found then
    raise exception 'Cursul nu permite rezervări online.';
  end if;
  -- Grupa suspendată în luna sesiunii nu mai poate fi rezervată din portal.
  if not curs_activ_in_luna(v_curs, (select s.data::date from open_sesiuni s where s.id = p_sesiune)) then
    raise exception 'Grupa este suspendată în luna acestei sesiuni.';
  end if;
  if v_pret is null or v_pret <= 0 then
    raise exception 'Sesiunea nu are un preț valid.';
  end if;

  -- reutilizează un hold viu existent (retry după abandon la Netopia) → nu dubla (23505)
  select id, status into v_rez, v_status
  from open_rezervari
  where sesiune = p_sesiune and client = p_client and status <> 'anulat'
  limit 1;
  if found then
    if v_status = 'platit' then
      raise exception 'Ai deja o rezervare plătită pentru această sesiune.';
    end if;
    -- 'rezervat': locul e deja al lui → reia hold-ul, resetează fereastra de expirare
    update open_rezervari set created = now() where id = v_rez;
    return jsonb_build_object('rezervare_id', v_rez, 'amount', v_pret);
  end if;

  -- capacitate strictă: rezervări vii ∪ abonați activi (formula din list_open_sesiuni_client)
  select count(*) into v_count from (
    select r.client from open_rezervari r
    where r.sesiune = p_sesiune and r.status <> 'anulat'
    union
    select e.client from enrollments e
    where e.cursul = v_curs
      and e.client is not null
      and e.reziliat = false
      and e.tip_plata in ('Per luna', 'Per an')
      and e.data_incepere <= v_data
      and (e.data_final is null or e.data_final >= v_data)
  ) occupants;
  if v_count >= v_cap then
    raise exception 'Sesiune completă (% / %). Nu mai sunt locuri.', v_count, v_cap;
  end if;

  -- creează HOLD fără bani. uq_open_rez_client_active prinde dublarea (23505).
  insert into open_rezervari (sesiune, client, status, suma)
  values (p_sesiune, p_client, 'rezervat', v_pret)
  returning id into v_rez;

  return jsonb_build_object('rezervare_id', v_rez, 'amount', v_pret);
end;
$function$
;

revoke execute on function public.muta_inrolare_curs(uuid, uuid, text, boolean, boolean) from anon, public;
revoke execute on function public.list_open_sesiuni_client(uuid) from anon, public;
revoke execute on function public.hold_loc_open(uuid, uuid) from anon, public;
grant execute on function public.muta_inrolare_curs(uuid, uuid, text, boolean, boolean) to authenticated;
grant execute on function public.list_open_sesiuni_client(uuid) to authenticated;
grant execute on function public.hold_loc_open(uuid, uuid) to authenticated;
