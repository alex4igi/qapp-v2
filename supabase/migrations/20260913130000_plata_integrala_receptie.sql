-- Plata integrală a sezonului (−5%, Anexa 1) și la recepție, nu doar în portal.
--
-- Regula rămâne într-un singur loc: motorul din 20260912120000 se extrage în
-- `_plan_plata_integrala()`, iar cele două intrări (portal / staff) diferă DOAR prin
-- cine are voie să întrebe. Altfel prețul din portal și cel de la ghișeu ar fi două
-- implementări care se despart tăcut la prima corecție.
--
-- Diferența față de portal: acolo discountul se materializează la confirmarea plății
-- (webhook), fiindcă intentul poate fi abandonat. La ghișeu omul plătește pe loc, deci
-- încasarea și rescrierea prețului se fac în ACEEAȘI tranzacție — dar în aceeași
-- ordine (întâi banii, apoi `suma`): `recalculate_pool_discount` ocolește rândurile
-- care au deja încasări, deci ordinea inversă ar rescrie prețul înapoi la întreg.

-- ── 1. Motorul, fără gardă de acces ───────────────────────────────────────────────
create or replace function _plan_plata_integrala(p_client uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sezon        sezoane%rowtype;
  v_nr           integer := 0;
  v_platit       numeric := 0;
  v_total_curent numeric := 0;
  v_total_lista  numeric := 0;
  v_disc_target  numeric := 0;
  v_disc_sum     numeric := 0;
  v_diff         numeric;
  v_rate         jsonb := '[]'::jsonb;
  v_out          jsonb := '[]'::jsonb;
  v_total_plata  numeric := 0;
  v_pay          numeric;
  v_idx          integer := -1;
  v_i            integer := 0;
  r              record;
begin
  select * into v_sezon
  from sezoane
  where activ
  order by data_incepere desc nulls last
  limit 1;
  if not found then
    return jsonb_build_object('eligibil', false, 'motiv', 'Nu există un sezon activ.');
  end if;

  with rate as (
    select e.id,
           e.data_incepere,
           coalesce(e.suma, e.suma_baza, 0)::numeric as suma_curenta,
           coalesce(
             case
               when e.este_reinscriere
                and c.pret_lunar_promo is not null and c.pret_lunar_promo > 0
                and c.pret_anual is not null and c.pret_anual > 0
                and coalesce(e.suma_baza, 0) = c.pret_lunar_promo
               then round(c.pret_anual / 10.0)
             end,
             coalesce(e.suma_baza, 0)
           )::numeric as pret_lista,
           (select coalesce(sum(i.suma), 0) from incasari i where i.inregistrare = e.id) as platit
    from enrollments e
    join cursuri c on c.id = e.cursul
    where e.client = p_client
      and e.activ and not e.reziliat
      and e.tip_plata in ('Per luna', 'Per an')
      and not c.facultativ
      and coalesce(e.sezon_id, c.sezon) = v_sezon.id
  )
  select count(*),
         coalesce(sum(platit), 0),
         coalesce(sum(suma_curenta), 0),
         coalesce(jsonb_agg(jsonb_build_object(
           'enrollment_id', id,
           'suma_curenta', suma_curenta,
           'pret_lista', pret_lista
         ) order by data_incepere asc nulls last, id), '[]'::jsonb)
    into v_nr, v_platit, v_total_curent, v_rate
  from rate;

  if v_sezon.scadenta_plata_integrala is null then
    return jsonb_build_object('eligibil', false, 'motiv', 'Sezonul nu are termen pentru plata integrală.');
  end if;
  if current_date > v_sezon.scadenta_plata_integrala then
    return jsonb_build_object('eligibil', false,
      'motiv', 'Termenul pentru plata integrală cu reducere a trecut (' ||
               to_char(v_sezon.scadenta_plata_integrala, 'DD.MM.YYYY') || ').');
  end if;
  if v_nr < 2 then
    return jsonb_build_object('eligibil', false, 'motiv', 'Nu există un contract pe sezon pentru acest membru.');
  end if;
  if v_platit > 0 then
    return jsonb_build_object('eligibil', false,
      'motiv', 'Reducerea de 5% se acordă doar dacă sezonul se achită integral, dintr-o singură plată.');
  end if;

  select coalesce(sum((x->>'pret_lista')::numeric), 0)
    into v_total_lista
  from jsonb_array_elements(v_rate) x
  where (x->>'pret_lista')::numeric - round((x->>'pret_lista')::numeric * 0.05)
        < (x->>'suma_curenta')::numeric;
  v_disc_target := round(v_total_lista * 0.05);

  for r in
    select (x->>'enrollment_id')::uuid as id,
           (x->>'suma_curenta')::numeric as suma_curenta,
           (x->>'pret_lista')::numeric as pret_lista
    from jsonb_array_elements(v_rate) x
  loop
    v_pay := least(r.suma_curenta, r.pret_lista - round(r.pret_lista * 0.05));
    if v_pay >= r.suma_curenta then
      v_pay := r.suma_curenta;
    else
      v_disc_sum := v_disc_sum + (r.suma_curenta - v_pay);
      if v_idx < 0 then v_idx := v_i; end if;
    end if;
    v_out := v_out || jsonb_build_object('enrollment_id', r.id, 'pay', v_pay);
    v_i := v_i + 1;
  end loop;

  v_diff := v_disc_target - v_disc_sum;
  if v_idx >= 0 and v_diff <> 0 then
    v_pay := (v_out -> v_idx ->> 'pay')::numeric - v_diff;
    v_out := jsonb_set(v_out, array[v_idx::text, 'pay'], to_jsonb(v_pay));
  end if;

  select coalesce(sum((x->>'pay')::numeric), 0) into v_total_plata
  from jsonb_array_elements(v_out) x;

  return jsonb_build_object(
    'eligibil', true,
    'sezon_id', v_sezon.id,
    'sezon_nume', v_sezon.numele_sezonului,
    'scadenta', v_sezon.scadenta_plata_integrala,
    'luni', v_nr,
    'total_curent', v_total_curent,
    'total_plata', v_total_plata,
    'discount', v_total_curent - v_total_plata,
    'amount', v_total_plata,
    'plan', v_out
  );
end;
$$;

revoke execute on function _plan_plata_integrala(uuid) from anon, public, authenticated;

-- ── 2. Intrarea portalului: aceeași semnătură, doar garda + motorul ───────────────
create or replace function plan_plata_integrala_sezon(p_client uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_client not in (select client_member_ids()) then
    raise exception 'forbidden: clientul nu aparține familiei contului';
  end if;
  return _plan_plata_integrala(p_client);
end;
$$;

revoke execute on function plan_plata_integrala_sezon(uuid) from anon, public;
grant execute on function plan_plata_integrala_sezon(uuid) to authenticated;

-- ── 3. Intrarea recepției ─────────────────────────────────────────────────────────
create or replace function plan_plata_integrala_staff(p_client uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth_role() not in ('owner', 'admin', 'manager', 'front_desk') then
    raise exception 'forbidden: rol fără drept de încasare';
  end if;
  return _plan_plata_integrala(p_client);
end;
$$;

revoke execute on function plan_plata_integrala_staff(uuid) from anon, public;
grant execute on function plan_plata_integrala_staff(uuid) to authenticated;

-- ── 4. Încasarea propriu-zisă la ghișeu ───────────────────────────────────────────
-- Suma NU vine de la client: se recalculează aici, din aceeași sursă. Formularul
-- trimite doar cum s-au dat banii (Cash / Card / mixt) și unde.
create or replace function incaseaza_plata_integrala_sezon(
  p_client   uuid,
  p_tenders  jsonb,             -- [{"metoda":"Cash","suma":1500}, …]; sum = totalul din plan
  p_data     date default current_date,
  p_locatie  uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_plan      jsonb;
  v_total     numeric;
  v_tenders   numeric;
  v_item      jsonb;
  v_enroll    uuid;
  v_pay       numeric;
  v_need      numeric;
  v_take      numeric;
  v_ti        integer := 0;
  v_trem      numeric;
  v_nr        integer := 0;
  v_metoda    metoda_plata;
begin
  if auth_role() not in ('owner', 'admin', 'manager', 'front_desk') then
    raise exception 'forbidden: rol fără drept de încasare';
  end if;
  if p_locatie is null then
    raise exception 'Setează locația de lucru înainte de încasare.';
  end if;

  v_plan := _plan_plata_integrala(p_client);
  if not (v_plan->>'eligibil')::boolean then
    raise exception '%', coalesce(v_plan->>'motiv', 'Plata integrală nu se aplică.');
  end if;
  v_total := (v_plan->>'total_plata')::numeric;

  select coalesce(sum((x->>'suma')::numeric), 0) into v_tenders
  from jsonb_array_elements(coalesce(p_tenders, '[]'::jsonb)) x;
  if abs(v_tenders - v_total) > 0.5 then
    raise exception 'Suma primită (%) nu acoperă plata integrală (%).', v_tenders, v_total;
  end if;

  -- Taie fiecare rată pe metodele de plată, în ordine — o rată plătită jumătate cash,
  -- jumătate card produce două încasări, ca în restul aplicației.
  v_trem := ((p_tenders->0)->>'suma')::numeric;
  for v_item in select * from jsonb_array_elements(v_plan->'plan')
  loop
    v_enroll := (v_item->>'enrollment_id')::uuid;
    v_pay := (v_item->>'pay')::numeric;
    if v_pay is null or v_pay <= 0 then continue; end if;
    v_need := v_pay;

    while v_need > 0.004 loop
      if v_trem <= 0.004 and v_ti < jsonb_array_length(p_tenders) - 1 then
        v_ti := v_ti + 1;
        v_trem := ((p_tenders->v_ti)->>'suma')::numeric;
        continue;
      end if;
      v_metoda := ((p_tenders->v_ti)->>'metoda')::metoda_plata;
      v_take := least(v_need, greatest(v_trem, 0));
      if v_take <= 0.004 then v_take := v_need; end if;   -- rotunjiri: restul pe ultima metodă

      insert into incasari (inregistrare, client, data, suma, metoda, categorie, locatie, observatii)
      values (v_enroll, p_client, p_data, round(v_take, 2), v_metoda, 'Abonament', p_locatie,
              'Plată integrală sezon (−5%)');

      v_need := round(v_need - v_take, 2);
      v_trem := round(v_trem - v_take, 2);
    end loop;

    -- Abia acum prețul rândului devine cel din ofertă: cu încasarea deja pe rând,
    -- motorul de reduceri nu-l mai atinge.
    update enrollments e
      set suma = v_pay,
          discount_integral = greatest(
            0, coalesce(e.suma_baza, 0) - coalesce(e.politica_discount, 0) - v_pay)
    where e.id = v_enroll;

    v_nr := v_nr + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'rate', v_nr,
    'total_platit', v_total,
    'discount', (v_plan->>'discount')::numeric,
    'sezon', v_plan->>'sezon_nume'
  );
end;
$$;

revoke execute on function incaseaza_plata_integrala_sezon(uuid, jsonb, date, uuid) from anon, public;
grant execute on function incaseaza_plata_integrala_sezon(uuid, jsonb, date, uuid) to authenticated;
