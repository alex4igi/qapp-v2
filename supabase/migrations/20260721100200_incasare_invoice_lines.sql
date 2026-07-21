-- Facturare „la cerere": linii de factură per încasare + worklist „De facturat" (tab Clienți).
-- Maparea denumire/articol/certain e factorizată în helpere reutilizate și de
-- get_portal_invoice_lines (sursa unică de adevăr pentru etichetele pe tip de serviciu).

-- ============================================================
-- 1) Helpere: o linie {denumire, suma, articol, certain} per înrolare / datorie
-- ============================================================

create or replace function fgo_line_for_enrollment(p_enrollment uuid, p_suma numeric)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_tip    tip_plata;
  v_luna   text;
  v_an     text;
  v_den    text;
  v_sug    text;
  v_months text[] := array['ianuarie','februarie','martie','aprilie','mai','iunie',
                           'iulie','august','septembrie','octombrie','noiembrie','decembrie'];
begin
  select e.tip_plata,
         v_months[extract(month from e.data_incepere)::int],
         extract(year from e.data_incepere)::text
    into v_tip, v_luna, v_an
  from enrollments e
  where e.id = p_enrollment;

  if v_tip = 'Per sedinta' then
    v_den := 'Sedinta dans gimnastica';
    v_sug := 'Sedinta dans gimnastica';
  elsif v_tip = 'Per an' then
    v_den := 'Abonament anual dans gimnastica'
             || case when v_an is not null then ' ' || v_an else '' end;
    v_sug := 'Abonament anual dans gimnastica promo';
  else
    v_den := 'Abonament dans gimnastica'
             || case when v_luna is not null
                     then ' — ' || v_luna || case when v_an is not null then ' ' || v_an else '' end
                     else '' end;
    v_sug := 'Abonament dans gimnastica';
  end if;

  return jsonb_build_object('denumire', v_den, 'suma', p_suma, 'articol', v_sug, 'certain', true);
end;
$$;

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
    v_den := 'Taxa workshop'; v_sug := 'Taxa workshop'; v_cert := true;
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
    -- Auditie / Inchiriere / necunoscut => recepția alege.
    v_den := coalesce(v_desc, v_cat, 'Serviciu'); v_sug := null; v_cert := false;
  end if;

  return jsonb_build_object('denumire', v_den, 'suma', p_suma, 'articol', v_sug, 'certain', v_cert);
end;
$$;

revoke all on function fgo_line_for_enrollment(uuid, numeric) from public, anon, authenticated;
revoke all on function fgo_line_for_datorie(uuid, numeric) from public, anon, authenticated;
grant execute on function fgo_line_for_enrollment(uuid, numeric) to service_role;
grant execute on function fgo_line_for_datorie(uuid, numeric) to service_role;

-- ============================================================
-- 2) get_portal_invoice_lines — recreat peste helpere (comportament identic)
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
  v_ev    text;
begin
  select * into v_order from netopia_orders where order_ref = p_order_ref;
  if not found then
    return '[]'::jsonb;
  end if;

  -- ----- BILET -----
  if v_order.order_type = 'bilet' then
    select nume_eveniment into v_ev from evenimente where id = v_order.eveniment_id;
    return jsonb_build_array(jsonb_build_object(
      'denumire',
        'Bilet ' || coalesce(v_ev, 'spectacol')
        || case when coalesce(v_order.nr_bilete, 1) > 1
                then ' × ' || v_order.nr_bilete::text else '' end,
      'suma', v_order.amount, 'articol', 'Bilet spectacol', 'certain', true));
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
-- 3) Linii per încasare (fluxul „la cerere")
-- ============================================================

create or replace function get_incasare_invoice_lines(p_incasare_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  r      incasari%rowtype;
  v_ev   text;
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
    select nume_eveniment into v_ev from evenimente where id = r.bilet;
    return jsonb_build_array(jsonb_build_object(
      'denumire',
        'Bilet ' || coalesce(v_ev, 'spectacol')
        || case when coalesce(r.bucati, 1) > 1 then ' × ' || r.bucati::text else '' end,
      'suma', r.suma, 'articol', 'Bilet spectacol', 'certain', true));
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
    -- Auditie / Inchiriere / necunoscut => recepția alege articolul.
    v_den := coalesce(nullif(btrim(r.observatii), ''), r.categorie::text, 'Serviciu');
    v_sug := null; v_cert := false;
  end if;

  return jsonb_build_array(jsonb_build_object(
    'denumire', v_den, 'suma', r.suma, 'articol', v_sug, 'certain', v_cert));
end;
$$;

revoke all on function get_incasare_invoice_lines(uuid) from public, anon, authenticated;
grant execute on function get_incasare_invoice_lines(uuid) to service_role;

-- ============================================================
-- 4) Worklist „De facturat" (tab Clienți) — apelat direct din CRM (staff)
-- ============================================================

create or replace function get_clienti_pending_incasari()
returns table (
  incasare_id uuid,
  client_id uuid,
  client_nume text,
  data date,
  metoda text,
  suma numeric,
  linii jsonb,
  certain boolean
)
language plpgsql stable security definer set search_path = public as $$
begin
  -- Gardă dublă: auth_role() cade pe front_desk la tokenuri fără rol, deci conturile
  -- de portal (is_parinte) trebuie excluse explicit.
  if is_parinte() or auth_role() not in ('owner', 'admin', 'manager', 'front_desk') then
    raise exception 'Acces refuzat.';
  end if;

  return query
  select i.id,
         c.id,
         trim(c.nume || ' ' || coalesce(c.prenume, '')),
         i.data,
         i.metoda::text,
         i.suma,
         l.linii,
         coalesce((select bool_and((e->>'certain')::boolean)
                     from jsonb_array_elements(l.linii) e), false)
  from incasari i
  join clienti c on c.id = i.client
  cross join lateral (select get_incasare_invoice_lines(i.id) as linii) l
  where c.factura_lunara
    and c.factura_lunara_de_la is not null
    and i.data >= c.factura_lunara_de_la
    and i.suma > 0
    -- dedup 1: nimic în registru pentru încasarea asta (orice status — erorile au Reemite în istoric)
    and not exists (select 1 from facturi_fgo f
                    where f.incasare_id = i.id or f.ref = 'INC-' || i.id::text)
    -- dedup 2: plățile online rămân pe fluxul portal (tab Plăți portal)
    and coalesce(i.observatii, '') not ilike '%netopia%'
    -- dedup 3: încasările create de emiterea din extras bancar au deja factură
    and coalesce(i.observatii, '') not ilike '%factura fgo%'
  order by i.data desc, i.created desc;
end;
$$;

grant execute on function get_clienti_pending_incasari() to authenticated;
revoke execute on function get_clienti_pending_incasari() from anon, public;

-- ============================================================
-- 5) Indexuri pentru worklist
-- ============================================================
create index if not exists facturi_fgo_incasare_idx on facturi_fgo (incasare_id);
create index if not exists idx_incasari_client_data on incasari (client, data);
