-- Reînscriere pe sezon țintă: generează RATELE LUNARE, nu un singur rând.
--
-- Bug (descoperit 2026-08-28, la pregătirea sezonului 2026-2027): butonul
-- „Activează" din /reinscrieri crea UN SINGUR enrollment cu
-- data_incepere = start sezon și data_final = final sezon, suma = pret_lunar_promo.
-- Rezultat: clientul apărea cu 260 RON de plată pe TOT sezonul, în loc de
-- 10 × 260 = 2600. Sub-facturare de 10× pe fiecare reînscriere activată.
--
-- Fix: oglindim exact `buildRecurentPerLuna` din src/features/plati/api/enrollments.ts —
-- un rând per lună a sezonului, prima lună cu data_incepere = startul sezonului
-- (nu ziua 1, ca să nu cadă în „gaura" dintre sezoane), fiecare rând cu
-- data_final = ultima zi a lunii.
--
-- În plus: reînscrierea NU se aplică la cursuri facultative (regula de domeniu
-- confirmată 2026-05-27, deja aplicată în `activate_reinscriere`). Lipsea aici,
-- iar `get_reinscrieri_progress` lista și cursurile facultative — de acolo se
-- putea apăsa „Activează" pe o grupă facultativă.

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
  v_sezon_id     uuid;
  v_facultativ   boolean;
  v_nume         text;
  v_sezon_start  date;
  v_sezon_end    date;
  v_luna         date;
  v_prima_luna   date;
  v_count        int := 0;
begin
  select pret_lunar_promo, sezon, facultativ, numele
    into v_promo, v_sezon_id, v_facultativ, v_nume
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
  if v_promo is null then
    raise exception
      'Cursul „%" nu are „Preț lunar PROMO" configurat. Setează-l în Cursuri → fișa cursului.',
      v_nume;
  end if;
  if v_sezon_id is null then
    raise exception 'Cursul țintă nu este asociat unui sezon.';
  end if;

  select data_incepere, data_final
    into v_sezon_start, v_sezon_end
  from sezoane
  where id = v_sezon_id;

  if v_sezon_start is null or v_sezon_end is null then
    raise exception 'Sezonul cursului țintă nu are interval complet (început/final).';
  end if;

  -- Există deja înrolări pe sezonul țintă (create normal sau la o activare
  -- anterioară)? Atunci doar coborâm prețul pe TOATE ratele nereziliate — nu
  -- adăugăm rânduri noi. `suma_baza` e obligatoriu: triggerul trg_enrollments_recalc
  -- rescrie `suma` din ea (vezi migr. 20260608170200).
  update enrollments
  set suma_baza = v_promo,
      suma = v_promo,
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

  -- Altfel generăm ratele lunare ale sezonului.
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
      v_promo,
      v_promo,
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

-- ============================================================
-- get_reinscrieri_progress — doar cursuri RECURENTE în board
-- ============================================================
create or replace function get_reinscrieri_progress(p_sezon_tinta uuid)
returns table (
  curs_id           uuid,
  curs_nume         text,
  varsta            varsta_curs,
  total_eligibili   integer,
  activati          integer,
  ramasi            integer,
  procent           numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with target as (
    select c.id           as curs_target_id,
           c.numele       as numele,
           c.varsta       as varsta,
           c.cursul_original
    from cursuri c
    where c.sezon = p_sezon_tinta
      and c.facultativ = false
  ),
  eligibili as (
    select t.curs_target_id, count(distinct e.client)::int as total
    from target t
    join enrollments e on e.cursul = t.cursul_original
    where t.cursul_original is not null
      and e.activ = true
      and e.reziliat = false
      and (e.data_incepere is null or e.data_incepere <= current_date)
      and (e.data_final is null or e.data_final >= current_date)
    group by t.curs_target_id
  ),
  activati as (
    select e.cursul as curs_target_id, count(distinct e.client)::int as total
    from enrollments e
    where e.sezon_id = p_sezon_tinta
      and e.este_reinscriere = true
      and e.reziliat = false
    group by e.cursul
  )
  select
    t.curs_target_id,
    t.numele,
    t.varsta,
    coalesce(el.total, 0),
    coalesce(a.total, 0),
    (coalesce(el.total, 0) - coalesce(a.total, 0)),
    case when coalesce(el.total, 0) > 0
         then round(100.0 * coalesce(a.total, 0) / el.total, 1)
         else 0 end
  from target t
  left join eligibili el on el.curs_target_id = t.curs_target_id
  left join activati a   on a.curs_target_id  = t.curs_target_id
  order by t.numele;
$$;

grant execute on function get_reinscrieri_progress(uuid) to authenticated;
revoke execute on function get_reinscrieri_progress(uuid) from anon, public;
