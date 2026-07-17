-- Fiecare linie de factură portal primește un `articol` sugerat (din nomenclatorul
-- FGO ARTICOLE_FGO) și un flag `certain`. Generarea automată emite DOAR când toate
-- liniile sunt `certain`; altfel plata rămâne pentru recepție, care alege articolul
-- manual (ca la facturarea din bancă). Cazul degenerat (plan gol) => `[]` (nesigur),
-- fără linie generică ghicită.
--
-- Formă returnată: jsonb array de { denumire, suma, articol (text|null), certain (bool) }.

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
  v_art    text;   -- inventar.articol (produs merch)
  v_den    text;   -- denumirea tipărită pe factură
  v_sug    text;   -- articolul FGO sugerat (din ARTICOLE_FGO)
  v_cert   boolean;
  v_months text[] := array['ianuarie','februarie','martie','aprilie','mai','iunie',
                           'iulie','august','septembrie','octombrie','noiembrie','decembrie'];
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

    v_den := null; v_sug := null; v_cert := false;

    if v_item ? 'enrollment_id' then
      select e.tip_plata,
             v_months[extract(month from e.data_incepere)::int],
             extract(year from e.data_incepere)::text
        into v_tip, v_luna, v_an
      from enrollments e
      where e.id = (v_item->>'enrollment_id')::uuid;

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
      v_cert := true;

    elsif v_item ? 'datorie_id' then
      select d.categorie::text, nullif(btrim(d.descriere), ''), ev.nume_eveniment, inv.articol
        into v_cat, v_desc, v_ev, v_art
      from datorii d
      left join evenimente ev on ev.id = d.bilet
      left join inventar inv on inv.id = d.articol_inventar
      where d.id = (v_item->>'datorie_id')::uuid;

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
    end if;

    if v_den is not null then
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'denumire', v_den, 'suma', (v_item->>'pay')::numeric,
        'articol', v_sug, 'certain', v_cert));
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

revoke all on function get_portal_invoice_lines(text) from public, authenticated;
grant execute on function get_portal_invoice_lines(text) to service_role;
