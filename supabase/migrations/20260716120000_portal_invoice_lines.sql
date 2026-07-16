-- Descrieri detaliate pe factura automată din portal (Netopia), per serviciu vândut.
-- Înainte: o singură linie generică ("Abonament cursuri (plată online)") indiferent de ce
-- s-a plătit. Acum: o linie per element real, construită din datele comenzii:
--   • abonament (FIFO) — câte o linie per înrolare ("Abonament <curs> — <luna anul>")
--     sau per datorie one-off (descrierea / categoria ei);
--   • rezervare      — "Rezervare ședință <curs> din <dată> (plată online)";
--   • bilet          — "Bilet <eveniment> × <nr> (plată online)".
-- Suma liniilor = amount-ul comenzii (pentru FIFO, Σ pay = amount).
-- Reutilizat de emitPortalInvoice (emiterea reală) și de lista „De facturat" (preview).
-- Doar service_role o cheamă (facturarea rulează server-side); contul `parinte` nu are acces.

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
  v_curs  text;
  v_data  date;
  v_ev    text;
  v_luna  text;
  v_desc  text;
  v_cat   text;
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
                then ' × ' || v_order.nr_bilete::text else '' end
        || ' (plată online)',
      'suma', v_order.amount));
  end if;

  -- ----- REZERVARE -----
  if v_order.order_type = 'rezervare' then
    select c.numele, s.data::date
      into v_curs, v_data
    from open_rezervari r
    join open_sesiuni s on s.id = r.sesiune
    join cursuri c on c.id = s.curs
    where r.id = v_order.rezervare_id;
    return jsonb_build_array(jsonb_build_object(
      'denumire',
        'Rezervare ședință ' || coalesce(v_curs, '')
        || case when v_data is not null then ' din ' || to_char(v_data, 'DD.MM.YYYY') else '' end
        || ' (plată online)',
      'suma', v_order.amount));
  end if;

  -- ----- ABONAMENT (FIFO): o linie per element din plan -----
  for v_item in select * from jsonb_array_elements(coalesce(v_order.fifo_plan, '[]'::jsonb))
  loop
    if (v_item->>'pay') is null or (v_item->>'pay')::numeric <= 0 then
      continue;
    end if;

    if v_item ? 'enrollment_id' then
      select c.numele,
             (array['ianuarie','februarie','martie','aprilie','mai','iunie','iulie',
                    'august','septembrie','octombrie','noiembrie','decembrie']
              )[extract(month from e.data_incepere)::int]
             || ' ' || extract(year from e.data_incepere)::text
        into v_curs, v_luna
      from enrollments e
      join cursuri c on c.id = e.cursul
      where e.id = (v_item->>'enrollment_id')::uuid;

      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'denumire',
          'Abonament ' || coalesce(v_curs, 'cursuri')
          || case when v_luna is not null then ' — ' || v_luna else '' end,
        'suma', (v_item->>'pay')::numeric));

    elsif v_item ? 'datorie_id' then
      select nullif(btrim(d.descriere), ''), d.categorie::text
        into v_desc, v_cat
      from datorii d
      where d.id = (v_item->>'datorie_id')::uuid;

      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'denumire', coalesce(v_desc, v_cat, 'Datorie') || ' (plată online)',
        'suma', (v_item->>'pay')::numeric));
    end if;
  end loop;

  -- Fallback dacă planul e gol / neașteptat: linia generică de dinainte.
  if jsonb_array_length(v_lines) = 0 then
    return jsonb_build_array(jsonb_build_object(
      'denumire', 'Abonament cursuri (plată online)', 'suma', v_order.amount));
  end if;

  return v_lines;
end;
$$;

revoke all on function get_portal_invoice_lines(text) from public, authenticated;
grant execute on function get_portal_invoice_lines(text) to service_role;
