-- Trupele nu au preț promo de reînscriere (decizie Alex, 2026-08-28).
--
-- Toate cele 10 trupe din sezonul 2026-2027 au `pret_lunar_promo = null`, iar
-- `activate_reinscriere_pe_sezon` cerea promo obligatoriu → butonul „Activează"
-- din /reinscrieri crăpa pe fiecare trupă cu „Cursul nu are preț promo".
--
-- Reînscrierea rămâne validă pentru trupe — doar că se face la RATA NORMALĂ
-- (pret_anual / 10), nu la un preț redus. Rândurile păstrează
-- `este_reinscriere = true`, deci progresul din board și KPI-urile din
-- /statistici continuă să le numere.
--
-- La GRUPE promo rămâne obligatoriu: acolo lipsa lui e o fișă incompletă,
-- nu o regulă de business.

create or replace function activate_reinscriere_pe_sezon(
  p_client_id uuid,
  p_curs_tinta_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_promo        numeric;
  v_anual        numeric;
  v_nivel        text;
  v_sezon_id     uuid;
  v_facultativ   boolean;
  v_nume         text;
  v_rata         numeric;
  v_sezon_start  date;
  v_sezon_end    date;
  v_luna         date;
  v_prima_luna   date;
  v_count        int := 0;
begin
  select pret_lunar_promo, pret_anual, nivelul::text, sezon, facultativ, numele
    into v_promo, v_anual, v_nivel, v_sezon_id, v_facultativ, v_nume
  from cursuri
  where id = p_curs_tinta_id;

  if not found then
    raise exception 'Cursul țintă nu există.';
  end if;
  if v_facultativ then
    raise exception
      'Reînscrierea se aplică doar grupelor recurente. „%" e curs facultativ (se plătește per ședință/lună, fără angajament de sezon).',
      v_nume;
  end if;
  if v_sezon_id is null then
    raise exception 'Cursul țintă nu este asociat unui sezon.';
  end if;

  -- Trupă → rata normală (nu există preț promo la trupe).
  -- Grupă → prețul promo e obligatoriu.
  if v_nivel = 'Trupa' then
    if v_anual is null then
      raise exception
        'Trupa „%" nu are preț anual configurat, deci nu se poate calcula rata lunară.',
        v_nume;
    end if;
    v_rata := round(v_anual / 10);
  else
    if v_promo is null then
      raise exception
        'Grupa „%" nu are „Preț lunar PROMO" configurat. Setează-l în Cursuri → fișa cursului.',
        v_nume;
    end if;
    v_rata := v_promo;
  end if;

  select data_incepere, data_final
    into v_sezon_start, v_sezon_end
  from sezoane
  where id = v_sezon_id;

  if v_sezon_start is null or v_sezon_end is null then
    raise exception 'Sezonul cursului țintă nu are interval complet (început/final).';
  end if;

  update enrollments
  set suma_baza = v_rata,
      suma = v_rata,
      este_reinscriere = true,
      activ = true,
      updated = now()
  where client = p_client_id
    and cursul = p_curs_tinta_id
    and sezon_id = v_sezon_id
    and reziliat = false;

  get diagnostics v_count = row_count;
  if v_count > 0 then
    return v_count;
  end if;

  v_prima_luna := date_trunc('month', v_sezon_start)::date;
  v_luna := v_prima_luna;
  while v_luna <= v_sezon_end loop
    insert into enrollments (
      client, cursul, sezon_id, tip_plata, suma, suma_baza,
      data_incepere, data_final, activ, este_reinscriere
    )
    values (
      p_client_id,
      p_curs_tinta_id,
      v_sezon_id,
      'Per luna'::tip_plata,
      v_rata,
      v_rata,
      case when v_luna = v_prima_luna then v_sezon_start else v_luna end,
      (v_luna + interval '1 month' - interval '1 day')::date,
      true,
      true
    );
    v_count := v_count + 1;
    v_luna := (v_luna + interval '1 month')::date;
  end loop;

  return v_count;
end;
$$;

grant execute on function activate_reinscriere_pe_sezon(uuid, uuid) to authenticated;
revoke execute on function activate_reinscriere_pe_sezon(uuid, uuid) from anon, public;
