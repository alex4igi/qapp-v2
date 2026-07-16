-- Agregă liniile facturii din portal care au aceeași denumire (ex. 2 abonamente
-- lunare pentru aceeași lună, la cursuri diferite — fără numele cursului ar apărea
-- două linii identice). Suma se însumează; ordinea = prima apariție.
-- Restul logicii (maparea pe tip de serviciu) rămâne din 20260716130000.

create or replace function get_portal_invoice_lines(p_order_ref text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_order  netopia_orders%rowtype;
  v_lines  jsonb := '[]'::jsonb;
  v_item   jsonb;
  v_data   date;
  v_ev     text;
  v_luna   text;
  v_an     text;
  v_tip    tip_plata;
  v_desc   text;
  v_cat    text;
  v_art    text;
  v_den    text;
  v_months text[] := array['ianuarie','februarie','martie','aprilie','mai','iunie',
                           'iulie','august','septembrie','octombrie','noiembrie','decembrie'];
begin
  select * into v_order from netopia_orders where order_ref = p_order_ref;
  if not found then
    return '[]'::jsonb;
  end if;

  -- ----- BILET: numele evenimentului (cerut explicit) -----
  if v_order.order_type = 'bilet' then
    select nume_eveniment into v_ev from evenimente where id = v_order.eveniment_id;
    return jsonb_build_array(jsonb_build_object(
      'denumire',
        'Bilet ' || coalesce(v_ev, 'spectacol')
        || case when coalesce(v_order.nr_bilete, 1) > 1
                then ' × ' || v_order.nr_bilete::text else '' end,
      'suma', v_order.amount));
  end if;

  -- ----- REZERVARE open class = ședință (cu data, fără nume curs) -----
  if v_order.order_type = 'rezervare' then
    select s.data::date into v_data
    from open_rezervari r
    join open_sesiuni s on s.id = r.sesiune
    where r.id = v_order.rezervare_id;
    return jsonb_build_array(jsonb_build_object(
      'denumire',
        'Sedinta dans gimnastica'
        || case when v_data is not null then ' din ' || to_char(v_data, 'DD.MM.YYYY') else '' end,
      'suma', v_order.amount));
  end if;

  -- ----- ABONAMENT (FIFO): o linie per element din plan -----
  for v_item in select * from jsonb_array_elements(coalesce(v_order.fifo_plan, '[]'::jsonb))
  loop
    if (v_item->>'pay') is null or (v_item->>'pay')::numeric <= 0 then
      continue;
    end if;

    if v_item ? 'enrollment_id' then
      select e.tip_plata,
             v_months[extract(month from e.data_incepere)::int],
             extract(year from e.data_incepere)::text
        into v_tip, v_luna, v_an
      from enrollments e
      where e.id = (v_item->>'enrollment_id')::uuid;

      v_den := case v_tip
        when 'Per sedinta' then 'Sedinta dans gimnastica'
        when 'Per an' then 'Abonament anual dans gimnastica'
                          || case when v_an is not null then ' ' || v_an else '' end
        else 'Abonament dans gimnastica'
             || case when v_luna is not null
                     then ' — ' || v_luna || case when v_an is not null then ' ' || v_an else '' end
                     else '' end
      end;

      v_lines := v_lines || jsonb_build_array(
        jsonb_build_object('denumire', v_den, 'suma', (v_item->>'pay')::numeric));

    elsif v_item ? 'datorie_id' then
      select d.categorie::text, nullif(btrim(d.descriere), ''), ev.nume_eveniment, inv.articol
        into v_cat, v_desc, v_ev, v_art
      from datorii d
      left join evenimente ev on ev.id = d.bilet
      left join inventar inv on inv.id = d.articol_inventar
      where d.id = (v_item->>'datorie_id')::uuid;

      v_den := case
        when v_cat = 'Merch' then
          'Articole vestimentar' || case when v_art is not null then ' — ' || v_art else '' end
        when v_cat = 'Bilet' then 'Bilet ' || coalesce(v_ev, v_desc, 'spectacol')
        when v_cat = 'Workshop' then 'Taxa workshop'
        when v_cat = 'Auditie' then 'Taxa auditie'
        when v_cat = 'Inchiriere' then coalesce(v_desc, 'Inchiriere sala')
        when v_cat = 'Taxa' then
          case
            when v_desc ~* 're[iî]nscriere' then 'Taxa Reinscriere'
            when v_desc ~* 'concurs' then 'Taxa concurs'
            when v_desc ~* 'confirmare|rezervare loc' then 'Taxa confirmare loc'
            else coalesce(v_desc, 'Taxa')
          end
        when v_cat = 'Abonament' then 'Abonament dans gimnastica'
        else coalesce(v_desc, v_cat, 'Serviciu')
      end;

      v_lines := v_lines || jsonb_build_array(
        jsonb_build_object('denumire', v_den, 'suma', (v_item->>'pay')::numeric));
    end if;
  end loop;

  -- Agregă liniile cu aceeași denumire (sumă însumată, ordinea primei apariții).
  select coalesce(
           jsonb_agg(jsonb_build_object('denumire', denumire, 'suma', s) order by ord),
           '[]'::jsonb)
    into v_lines
  from (
    select elem->>'denumire' as denumire,
           sum((elem->>'suma')::numeric) as s,
           min(idx) as ord
    from jsonb_array_elements(v_lines) with ordinality as t(elem, idx)
    group by elem->>'denumire'
  ) g;

  if jsonb_array_length(v_lines) = 0 then
    return jsonb_build_array(jsonb_build_object(
      'denumire', 'Abonament dans gimnastica', 'suma', v_order.amount));
  end if;

  return v_lines;
end;
$$;

revoke all on function get_portal_invoice_lines(text) from public, authenticated;
grant execute on function get_portal_invoice_lines(text) to service_role;
