-- Audiția își primește articolul ei de factură: „Taxa auditie".
--
-- Până acum orice încasare de audiție (categorie 'Auditie', bilet pe un eveniment de
-- tip Auditie) rămânea fără articol FGO ⇒ `certain=false`, factura nu se emitea automat
-- din portal, iar la facturarea din extrasul bancar dropdown-ul n-avea ce oferi:
-- recepția nu putea încheia rândul (butonul „Emite factura" cere articol pe fiecare linie).
--
-- Sursa articolului e acum TIPUL evenimentului, nu textul scris de plătitor:
--   evenimente.tip = 'Auditie' → „Taxa auditie"
--   evenimente.tip = 'Workshop' → „Taxa workshop"
--   restul (inclusiv 'Eveniment') → „Bilet spectacol"
-- (vezi ARTICOLE_FGO din src/features/facturare/constants.ts — lista are acum 14 articole).

-- ============================================================
-- 1) Helper nou: linia de factură a unui bilet, după tipul evenimentului
-- ============================================================

create or replace function fgo_line_for_eveniment(
  p_eveniment uuid,
  p_suma numeric,
  p_bucati int default 1
)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_nume text;
  v_tip  text;
  v_den  text;
  v_sug  text;
begin
  select ev.nume_eveniment, ev.tip::text into v_nume, v_tip
  from evenimente ev where ev.id = p_eveniment;

  if v_tip = 'Auditie' then
    v_sug := 'Taxa auditie';
    v_den := 'Taxa auditie' || coalesce(' — ' || v_nume, '');
  elsif v_tip = 'Workshop' then
    v_sug := 'Taxa workshop';
    v_den := 'Taxa workshop' || coalesce(' — ' || v_nume, '');
  else
    v_sug := 'Bilet spectacol';
    v_den := 'Bilet ' || coalesce(v_nume, 'spectacol');
  end if;

  if coalesce(p_bucati, 1) > 1 then
    v_den := v_den || ' × ' || p_bucati::text;
  end if;

  return jsonb_build_object('denumire', v_den, 'suma', p_suma, 'articol', v_sug, 'certain', true);
end;
$$;

revoke all on function fgo_line_for_eveniment(uuid, numeric, int) from public, anon, authenticated;
grant execute on function fgo_line_for_eveniment(uuid, numeric, int) to service_role;

-- ============================================================
-- 2) Datorie one-off: categoria 'Auditie' devine articol ferm
-- ============================================================

create or replace function fgo_line_for_datorie(p_datorie uuid, p_suma numeric)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_cat  text;
  v_desc text;
  v_ev   text;
  v_art  text;   -- inventar.articol (produs merch)
  v_den  text;
  v_sug  text;
  v_cert boolean := false;
begin
  select d.categorie::text, nullif(btrim(d.descriere), ''), ev.nume_eveniment, inv.articol
    into v_cat, v_desc, v_ev, v_art
  from datorii d
  left join evenimente ev on ev.id = d.bilet
  left join inventar inv on inv.id = d.articol_inventar
  where d.id = p_datorie;

  if v_cat = 'Merch' then
    v_den := 'Articole vestimentar' || case when v_art is not null then ' — ' || v_art else '' end;
    v_sug := 'Articole vestimentar'; v_cert := true;
  elsif v_cat = 'Bilet' then
    v_den := 'Bilet ' || coalesce(v_ev, v_desc, 'spectacol');
    v_sug := 'Bilet spectacol'; v_cert := true;
  elsif v_cat = 'Workshop' then
    v_den := 'Taxa workshop' || coalesce(' — ' || v_ev, '');
    v_sug := 'Taxa workshop'; v_cert := true;
  elsif v_cat = 'Auditie' then
    v_den := 'Taxa auditie' || coalesce(' — ' || v_ev, '');
    v_sug := 'Taxa auditie'; v_cert := true;
  elsif v_cat = 'Abonament' then
    v_den := 'Abonament dans gimnastica'; v_sug := 'Abonament dans gimnastica'; v_cert := true;
  elsif v_cat = 'Taxa' then
    if v_desc ~* 're[iî]nscriere' then
      v_den := 'Taxa Reinscriere'; v_sug := 'Taxa Reinscriere'; v_cert := true;
    elsif v_desc ~* 'concurs' then
      v_den := 'Taxa concurs'; v_sug := 'Taxa concurs'; v_cert := true;
    elsif v_desc ~* 'confirmare|rezervare loc' then
      v_den := 'Taxa confirmare loc'; v_sug := 'Taxa confirmare loc'; v_cert := true;
    else
      -- Taxă cu text liber => recepția alege articolul.
      v_den := coalesce(v_desc, 'Taxa'); v_sug := null; v_cert := false;
    end if;
  else
    -- Inchiriere / necunoscut => recepția alege.
    v_den := coalesce(v_desc, v_cat, 'Serviciu'); v_sug := null; v_cert := false;
  end if;

  return jsonb_build_object('denumire', v_den, 'suma', p_suma, 'articol', v_sug, 'certain', v_cert);
end;
$$;

revoke all on function fgo_line_for_datorie(uuid, numeric) from public, anon, authenticated;
grant execute on function fgo_line_for_datorie(uuid, numeric) to service_role;

-- ============================================================
-- 3) Portal: biletul se etichetează după tipul evenimentului
-- ============================================================

create or replace function get_portal_invoice_lines(p_order_ref text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_order netopia_orders%rowtype;
  v_lines jsonb := '[]'::jsonb;
  v_item  jsonb;
  v_data  date;
begin
  select * into v_order from netopia_orders where order_ref = p_order_ref;
  if not found then
    return '[]'::jsonb;
  end if;

  -- ----- BILET / audiție / workshop -----
  if v_order.order_type = 'bilet' then
    return jsonb_build_array(fgo_line_for_eveniment(
      v_order.eveniment_id, v_order.amount, coalesce(v_order.nr_bilete, 1)));
  end if;

  -- ----- REZERVARE open class -----
  if v_order.order_type = 'rezervare' then
    select s.data::date into v_data
    from open_rezervari r
    join open_sesiuni s on s.id = r.sesiune
    where r.id = v_order.rezervare_id;
    return jsonb_build_array(jsonb_build_object(
      'denumire',
        'Sedinta dans gimnastica'
        || case when v_data is not null then ' din ' || to_char(v_data, 'DD.MM.YYYY') else '' end,
      'suma', v_order.amount, 'articol', 'Sedinta dans gimnastica', 'certain', true));
  end if;

  -- ----- ABONAMENT (FIFO): o linie per element -----
  for v_item in select * from jsonb_array_elements(coalesce(v_order.fifo_plan, '[]'::jsonb))
  loop
    if (v_item->>'pay') is null or (v_item->>'pay')::numeric <= 0 then
      continue;
    end if;

    if v_item ? 'enrollment_id' then
      v_lines := v_lines || jsonb_build_array(
        fgo_line_for_enrollment((v_item->>'enrollment_id')::uuid, (v_item->>'pay')::numeric));
    elsif v_item ? 'datorie_id' then
      v_lines := v_lines || jsonb_build_array(
        fgo_line_for_datorie((v_item->>'datorie_id')::uuid, (v_item->>'pay')::numeric));
    end if;
  end loop;

  -- Agregă liniile cu aceeași denumire (sumă însumată; articol/certain consecvente).
  select coalesce(
           jsonb_agg(jsonb_build_object(
             'denumire', denumire, 'suma', s, 'articol', art, 'certain', cert) order by ord),
           '[]'::jsonb)
    into v_lines
  from (
    select elem->>'denumire' as denumire,
           sum((elem->>'suma')::numeric) as s,
           max(elem->>'articol') as art,
           bool_and((elem->>'certain')::boolean) as cert,
           min(idx) as ord
    from jsonb_array_elements(v_lines) with ordinality as t(elem, idx)
    group by elem->>'denumire'
  ) g;

  return v_lines;  -- poate fi [] (nesigur) — apelantul decide
end;
$$;

revoke all on function get_portal_invoice_lines(text) from public, anon, authenticated;
grant execute on function get_portal_invoice_lines(text) to service_role;

-- ============================================================
-- 4) Încasare „la cerere": bilet după tipul evenimentului + fallback pe categorie
-- ============================================================

create or replace function get_incasare_invoice_lines(p_incasare_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  r      incasari%rowtype;
  v_art  text;
  v_den  text;
  v_sug  text;
  v_cert boolean := false;
begin
  select * into r from incasari where id = p_incasare_id;
  if not found or coalesce(r.suma, 0) <= 0 then
    return '[]'::jsonb;
  end if;

  if r.inregistrare is not null then
    return jsonb_build_array(fgo_line_for_enrollment(r.inregistrare, r.suma));
  end if;
  if r.datorie is not null then
    return jsonb_build_array(fgo_line_for_datorie(r.datorie, r.suma));
  end if;

  if r.bilet is not null then
    return jsonb_build_array(fgo_line_for_eveniment(r.bilet, r.suma, coalesce(r.bucati, 1)));
  end if;

  if r.articol_inventar is not null then
    select articol into v_art from inventar where id = r.articol_inventar;
    return jsonb_build_array(jsonb_build_object(
      'denumire', 'Articole vestimentar' || case when v_art is not null then ' — ' || v_art else '' end,
      'suma', r.suma, 'articol', 'Articole vestimentar', 'certain', true));
  end if;

  -- Fallback pe categorie (fără legătură fermă în date).
  if r.categorie::text = 'Abonament' then
    v_den := 'Abonament dans gimnastica'; v_sug := 'Abonament dans gimnastica'; v_cert := true;
  elsif r.categorie::text = 'Workshop' then
    v_den := 'Taxa workshop'; v_sug := 'Taxa workshop'; v_cert := true;
  elsif r.categorie::text = 'Auditie' then
    v_den := 'Taxa auditie'; v_sug := 'Taxa auditie'; v_cert := true;
  elsif r.categorie::text = 'Merch' then
    v_den := 'Articole vestimentar'; v_sug := 'Articole vestimentar'; v_cert := true;
  elsif r.categorie::text = 'Bilet' then
    v_den := 'Bilet spectacol'; v_sug := 'Bilet spectacol'; v_cert := true;
  elsif r.categorie::text = 'Taxa' then
    if r.observatii ~* 're[iî]nscriere' then
      v_den := 'Taxa Reinscriere'; v_sug := 'Taxa Reinscriere'; v_cert := true;
    elsif r.observatii ~* 'concurs' then
      v_den := 'Taxa concurs'; v_sug := 'Taxa concurs'; v_cert := true;
    elsif r.observatii ~* 'confirmare|rezervare loc' then
      v_den := 'Taxa confirmare loc'; v_sug := 'Taxa confirmare loc'; v_cert := true;
    else
      v_den := coalesce(nullif(btrim(r.observatii), ''), 'Taxa'); v_sug := null; v_cert := false;
    end if;
  else
    -- Inchiriere / necunoscut => recepția alege articolul.
    v_den := coalesce(nullif(btrim(r.observatii), ''), r.categorie::text, 'Serviciu');
    v_sug := null; v_cert := false;
  end if;

  return jsonb_build_array(jsonb_build_object(
    'denumire', v_den, 'suma', r.suma, 'articol', v_sug, 'certain', v_cert));
end;
$$;

revoke all on function get_incasare_invoice_lines(uuid) from public, anon, authenticated;
grant execute on function get_incasare_invoice_lines(uuid) to service_role;
