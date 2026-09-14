-- Plată încasată la clientul greșit (ex. două „Alesia" în aceeași grupă): rândul din
-- `incasari` se RE-ATRIBUIE lunii clientului corect, nu se șterge și re-creează.
-- Rămân neatinse data, metoda, locația și `created`, deci casa zilei, scorecard-ul
-- restanțelor și KPI-urile care citesc data plății nu se mișcă. Singura urmă e în
-- audit_log (`incasare_moved`).
--
-- Aceeași funcție face și verificarea (p_doar_verificare = true, implicit): fereastra
-- arată exact regulile serverului, iar la confirmare totul se re-verifică sub lock —
-- dacă între timp cineva a corectat altfel (restituire la sursă, plată nouă la țintă),
-- mutarea e refuzată în loc să dubleze corecția.

create or replace function muta_incasare_la_alt_client(
  p_incasare         uuid,
  p_enrollment_sursa uuid,
  p_enrollment_tinta uuid,
  p_motiv            text default null,
  p_doar_verificare  boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service      boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_rol          text := (select auth_role());
  v_motiv        text := nullif(btrim(coalesce(p_motiv, '')), '');
  v_inc          incasari;
  v_src          enrollments;
  v_dst          enrollments;
  v_src_client   clienti;
  v_dst_client   clienti;
  v_src_curs     text;
  v_dst_curs     text;
  v_src_platit   numeric;
  v_dst_platit   numeric;
  v_dst_rest     numeric;
  v_factura      facturi_fgo;
  v_locatie_nume text;
  v_scadenta     date;
  v_pool         uuid[];
  v_avert        text[] := '{}';
  v_sursa        jsonb;
  v_tinta        jsonb;
begin
  if not (
    v_service
    or (auth.uid() is not null and v_rol in ('owner', 'admin', 'manager', 'front_desk'))
  ) then
    raise exception 'Doar recepția și managerii pot muta plăți.' using errcode = 'QD403';
  end if;

  -- ── Plata ────────────────────────────────────────────────────────────────
  select * into v_inc from incasari where id = p_incasare for update;
  if not found then
    raise exception 'Plata nu mai există — reîncarcă fișa.' using errcode = 'QD404';
  end if;
  if v_inc.inregistrare is distinct from p_enrollment_sursa then
    raise exception 'Plata nu mai e pe luna aceasta — probabil a fost deja corectată. Reîncarcă fișa.'
      using errcode = 'QD409';
  end if;
  if coalesce(v_inc.suma, 0) <= 0 then
    raise exception 'Rândurile de restituire (sumă negativă) nu se mută.' using errcode = 'QD400';
  end if;
  if v_inc.categorie is distinct from 'Abonament' then
    raise exception 'Se pot muta doar plățile de abonament.' using errcode = 'QD400';
  end if;
  if v_inc.metoda = 'Online' then
    raise exception 'Plățile online (Netopia) le face părintele din portal și au factură automată — nu se mută de aici. Cere unui manager.'
      using errcode = 'QD400';
  end if;
  if v_inc.voucher is not null
     or exists (select 1 from voucher_redemptions where incasare = v_inc.id) then
    raise exception 'Plata are voucher — nu se mută.' using errcode = 'QD400';
  end if;
  if v_inc.datorie is not null or v_inc.inchiriere is not null or v_inc.bilet is not null
     or v_inc.articol_inventar is not null or v_inc.lead is not null
     or exists (select 1 from reinscrieri_gate where taxa_incasare_id = v_inc.id) then
    raise exception 'Plata e legată de altceva decât luna de abonament — nu se mută.' using errcode = 'QD400';
  end if;
  if exists (select 1 from open_rezervari where incasare = v_inc.id) then
    raise exception 'Plata e a unei rezervări OPEN — anulează rezervarea în loc să muți plata.'
      using errcode = 'QD400';
  end if;
  if coalesce(v_inc.observatii, '') ilike 'Folosire credit%'
     or coalesce(v_inc.observatii, '') ilike 'Alocare credit%' then
    raise exception 'Plata provine din creditul clientului, nu din bani aduși acum — nu se mută.'
      using errcode = 'QD400';
  end if;

  select * into v_factura
  from facturi_fgo
  where incasare_id = v_inc.id and status <> 'Ignorata'
  order by created desc
  limit 1;
  if found then
    raise exception 'Pentru plata asta există deja factură FGO (%, %). Factura nu se mută — trebuie stornată în FGO înainte. Cere unui manager.',
      coalesce(v_factura.factura_fgo, 'fără număr'), v_factura.status
      using errcode = 'QD409';
  end if;

  -- Recepția corectează greșeli proaspete, la casa ei; mai vechi = manager.
  if not v_service and v_rol = 'front_desk' then
    if current_date - coalesce(v_inc.data, v_inc.created::date) > 14 then
      raise exception 'Recepția poate muta doar plăți din ultimele 14 zile — cere unui manager.'
        using errcode = 'QD403';
    end if;
    if auth_locatie_id() is not null and v_inc.locatie is not null
       and v_inc.locatie <> auth_locatie_id() then
      raise exception 'Plata e încasată la altă locație — o poate muta recepția de acolo sau un manager.'
        using errcode = 'QD403';
    end if;
  end if;

  -- ── Luna de la care pleacă ────────────────────────────────────────────────
  select * into v_src from enrollments where id = p_enrollment_sursa;
  if not found then
    raise exception 'Luna de pe care pleacă plata nu mai există.' using errcode = 'QD404';
  end if;
  if coalesce(v_src.discount_integral, 0) > 0 then
    raise exception 'Luna face parte dintr-o plată integrală de sezon (−5%%) — nu se mută. Cere unui manager.'
      using errcode = 'QD400';
  end if;
  select coalesce(sum(suma), 0) into v_src_platit from incasari where inregistrare = v_src.id;
  if v_src_platit - v_inc.suma < -0.009 then
    raise exception 'Pe luna asta există deja o restituire, deci plata pare corectată altfel. Mutarea ar lăsa clientul pe minus.'
      using errcode = 'QD409';
  end if;

  -- ── Luna pe care intră ────────────────────────────────────────────────────
  select * into v_dst from enrollments where id = p_enrollment_tinta for update;
  if not found then
    raise exception 'Luna aleasă nu există.' using errcode = 'QD404';
  end if;
  if v_dst.id = v_src.id then
    raise exception 'Alege o lună a altui client.' using errcode = 'QD400';
  end if;
  if v_dst.client is null then
    raise exception 'Luna aleasă nu are client.' using errcode = 'QD400';
  end if;
  if v_dst.client = v_src.client or v_dst.client = v_inc.client then
    raise exception 'Plata e deja la acest client — alege clientul corect.' using errcode = 'QD400';
  end if;
  if v_dst.reziliat then
    raise exception 'Luna aleasă e reziliată — alege o lună activă.' using errcode = 'QD400';
  end if;
  if coalesce(v_dst.discount_integral, 0) > 0 then
    raise exception 'Luna aleasă e plătită integral pe sezon.' using errcode = 'QD400';
  end if;
  select coalesce(sum(suma), 0) into v_dst_platit from incasari where inregistrare = v_dst.id;
  v_dst_rest := coalesce(v_dst.suma, 0) - v_dst_platit;
  if v_dst_rest <= 0.009 then
    raise exception 'Luna aleasă e deja achitată — plata pare deja corectată.' using errcode = 'QD409';
  end if;
  if v_inc.suma > v_dst_rest + 0.009 then
    raise exception 'Plata (% RON) e mai mare decât restul de plată al lunii alese (% RON). Alege altă lună sau cere unui manager.',
      v_inc.suma, v_dst_rest
      using errcode = 'QD400';
  end if;

  select * into v_src_client from clienti where id = v_src.client;
  select * into v_dst_client from clienti where id = v_dst.client;
  select numele into v_src_curs from cursuri where id = v_src.cursul;
  select numele into v_dst_curs from cursuri where id = v_dst.cursul;
  select nume into v_locatie_nume from locatii where id = v_inc.locatie;

  -- ── Avertismente (nu blochează) ───────────────────────────────────────────
  if coalesce(v_dst_client.suspendat_datorii, false) then
    v_avert := array_append(v_avert, format(
      '%s are accesul suspendat pentru datorii. Suspendarea nu se ridică singură — verific-o în /datorii.',
      btrim(coalesce(v_dst_client.nume, '') || ' ' || coalesce(v_dst_client.prenume, ''))
    ));
  end if;

  -- Sursa rămâne neachitată după termen ⇒ cronul de la 00:30 îi anulează reducerea
  -- pe luna asta (cancel_discount_familie_restant), ca oricărui restant.
  if v_src.tip_plata = 'Per luna' and v_src.sezon_id is not null
     and coalesce(v_src.politica_discount, 0) > 0
     and v_src_platit - v_inc.suma < coalesce(v_src.suma, 0)
     and exists (select 1 from sezoane s where s.id = v_src.sezon_id and s.data_incepere >= date '2026-09-01') then
    v_scadenta := scadenta_rata(v_src.data_incepere, v_src.sezon_id);
    if v_scadenta < current_date then
      v_avert := array_append(v_avert, format(
        'Termenul lunii lui %s a trecut (%s): dacă nu plătește, la noapte i se anulează reducerea pe luna asta.',
        btrim(coalesce(v_src_client.nume, '') || ' ' || coalesce(v_src_client.prenume, '')),
        to_char(v_scadenta, 'DD.MM.YYYY')
      ));
    end if;
  end if;

  -- Ținta putea pierde reducerea de familie tocmai pentru că plata ei stătea la altcineva.
  if v_dst.tip_plata = 'Per luna' and v_dst.sezon_id is not null
     and coalesce(v_dst.politica_discount, 0) = 0
     and exists (select 1 from sezoane s where s.id = v_dst.sezon_id and s.data_incepere >= date '2026-09-01') then
    v_scadenta := scadenta_rata(v_dst.data_incepere, v_dst.sezon_id);
    if v_scadenta < current_date and coalesce(v_inc.data, v_inc.created::date) <= v_scadenta then
      if v_dst_client.familia is not null then
        select array_agg(id) into v_pool from clienti where familia = v_dst_client.familia;
      else
        v_pool := array[v_dst.client];
      end if;
      if (
        select count(*) from enrollments e
        where e.client = any(v_pool) and e.tip_plata = 'Per luna' and not e.reziliat
          and date_trunc('month', e.data_incepere) = date_trunc('month', v_dst.data_incepere)
      ) >= 2 then
        v_avert := array_append(v_avert, format(
          'Plata e din %s, deci la timp pentru %s. Dacă i s-a anulat reducerea de familie pe luna asta pentru întârziere, cere unui manager s-o refacă.',
          to_char(coalesce(v_inc.data, v_inc.created::date), 'DD.MM.YYYY'),
          btrim(coalesce(v_dst_client.nume, '') || ' ' || coalesce(v_dst_client.prenume, ''))
        ));
      end if;
    end if;
  end if;

  if v_inc.metoda = 'Transfer' and exists (
    select 1 from facturi_fgo f
    where f.status in ('Emisa', 'Marcata')
      and (f.client_id = v_src.client
           or f.linii @> jsonb_build_array(jsonb_build_object('client_id', v_src.client::text)))
      and f.data_tranzactie between v_inc.data - 7 and v_inc.data + 7
  ) then
    v_avert := array_append(v_avert, format(
      'Există o factură FGO emisă pe %s pentru un transfer din aceeași perioadă. Dacă e pentru banii ăștia, factura rămâne pe numele greșit — verific-o în Facturare.',
      btrim(coalesce(v_src_client.nume, '') || ' ' || coalesce(v_src_client.prenume, ''))
    ));
  end if;

  if exists (
    select 1 from salarii_teacher st
    where st.anul = extract(year from coalesce(v_inc.data, v_inc.created::date))
      and st.luna = extract(month from coalesce(v_inc.data, v_inc.created::date))
      and st.teacher in (
        select c.teacher from cursuri c where c.id in (v_src.cursul, v_dst.cursul) and c.teacher is not null
        union
        select ct.teacher_id from cursuri_teacheri ct where ct.curs_id in (v_src.cursul, v_dst.cursul)
      )
  ) then
    v_avert := array_append(v_avert, 'Salariul profesorului pe luna plății e deja confirmat — mutarea poate schimba numărul de cursanți plătitori; recalculează-l.'::text);
  end if;

  v_sursa := jsonb_build_object(
    'client_id', v_src.client,
    'client_nume', btrim(coalesce(v_src_client.nume, '') || ' ' || coalesce(v_src_client.prenume, '')),
    'enrollment_id', v_src.id,
    'curs', v_src_curs,
    'data_incepere', v_src.data_incepere,
    'tip_plata', v_src.tip_plata,
    'total', coalesce(v_src.suma, 0),
    'platit_inainte', v_src_platit,
    'platit_dupa', v_src_platit - v_inc.suma
  );
  v_tinta := jsonb_build_object(
    'client_id', v_dst.client,
    'client_nume', btrim(coalesce(v_dst_client.nume, '') || ' ' || coalesce(v_dst_client.prenume, '')),
    'enrollment_id', v_dst.id,
    'curs', v_dst_curs,
    'data_incepere', v_dst.data_incepere,
    'tip_plata', v_dst.tip_plata,
    'total', coalesce(v_dst.suma, 0),
    'platit_inainte', v_dst_platit,
    'platit_dupa', v_dst_platit + v_inc.suma
  );

  if not p_doar_verificare then
    if v_motiv is null then
      raise exception 'Motivul e obligatoriu.' using errcode = 'QD400';
    end if;

    update incasari
       set client       = v_dst.client,
           inregistrare = v_dst.id,
           sezon        = coalesce(v_dst.sezon_id, v_inc.sezon),
           updated      = now()
     where id = v_inc.id;

    -- audit_log_record() cere auth.uid(); pe cheia de serviciu scriem direct.
    if auth.uid() is not null then
      perform audit_log_record(
        'incasare_moved', 'incasare', v_inc.id,
        v_sursa || jsonb_build_object('sezon', v_inc.sezon),
        v_tinta || jsonb_build_object(
          'sezon', coalesce(v_dst.sezon_id, v_inc.sezon),
          'suma', v_inc.suma, 'metoda', v_inc.metoda, 'data', v_inc.data
        ),
        v_motiv,
        v_inc.locatie
      );
    else
      insert into audit_log (
        actor_id, actor_role, action, entity_type, entity_id,
        old_value, new_value, reason, locatie_id
      ) values (
        null, 'service_role', 'incasare_moved', 'incasare', v_inc.id,
        v_sursa || jsonb_build_object('sezon', v_inc.sezon),
        v_tinta || jsonb_build_object(
          'sezon', coalesce(v_dst.sezon_id, v_inc.sezon),
          'suma', v_inc.suma, 'metoda', v_inc.metoda, 'data', v_inc.data
        ),
        v_motiv,
        v_inc.locatie
      );
    end if;
  end if;

  return jsonb_build_object(
    'mutat', not p_doar_verificare,
    'incasare', jsonb_build_object(
      'id', v_inc.id,
      'data', v_inc.data,
      'suma', v_inc.suma,
      'metoda', v_inc.metoda,
      'locatie_nume', v_locatie_nume
    ),
    'sursa', v_sursa,
    'tinta', v_tinta,
    'avertismente', to_jsonb(v_avert)
  );
end;
$$;

revoke execute on function muta_incasare_la_alt_client(uuid, uuid, uuid, text, boolean) from anon, public;
grant execute on function muta_incasare_la_alt_client(uuid, uuid, uuid, text, boolean) to authenticated;
