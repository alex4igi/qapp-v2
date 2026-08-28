-- Trupele ies COMPLET din fluxul de reînscrieri (decizie Alex, 2026-08-28).
--
-- Context: reînscrierea = preț promo blocat + loc rezervat, mecanism care la trupe
-- nu are corespondent (nu au `pret_lunar_promo` și nici nu vor avea). Migrația
-- anterioară (`20260828160000`) le lăsa în board activând la rata normală; userul
-- a cerut sa dispara de tot. Membrii trupelor se trec în sezonul nou prin
-- înrolarea obișnuită din fișa clientului.
--
-- Revizuiește decizia din 2026-05-27 („reînscrierile se aplică recurentelor,
-- inclusiv trupă") — rămâne valabilă doar pentru `recurent-grupa`.
--
-- Atinge: board-ul clasic (get_reinscrieri_progress), board-ul de campanie
-- (get_campanie_progress_curs) și poarta de activare (activate_reinscriere_pe_sezon).

-- ============================================================
-- 1) Activarea refuză trupele
-- ============================================================
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
  v_nivel        text;
  v_sezon_id     uuid;
  v_facultativ   boolean;
  v_nume         text;
  v_sezon_start  date;
  v_sezon_end    date;
  v_luna         date;
  v_prima_luna   date;
  v_count        int := 0;
begin
  select pret_lunar_promo, nivelul::text, sezon, facultativ, numele
    into v_promo, v_nivel, v_sezon_id, v_facultativ, v_nume
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
  if v_nivel = 'Trupa' then
    raise exception
      'Trupele nu intră în reînscrieri (nu au preț promo). Treci membrii „%" în sezonul nou din fișa clientului → Înrolare nouă.',
      v_nume;
  end if;
  if v_promo is null then
    raise exception
      'Grupa „%" nu are „Preț lunar PROMO" configurat. Setează-l în Cursuri → fișa cursului.',
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
-- 2) Board-ul clasic — fără trupe
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
      and c.nivelul is distinct from 'Trupa'
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

-- ============================================================
-- 3) Board-ul de campanie — fără trupe
-- ============================================================
drop function if exists get_campanie_progress_curs(uuid);
create function get_campanie_progress_curs(p_campanie_id uuid)
returns table (
  curs_id          uuid,
  curs_nume        text,
  varsta           varsta_curs,
  total_eligibili  integer,
  taxa_done        integer,
  act_done         integer,
  act_de_verificat integer,
  ambele           integer,
  ramasi           integer,
  procent          numeric,
  activi           integer,
  capacitate       integer,
  procent_ocupare  numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with camp as (
    select sezon_tinta from campanii_reinscriere where id = p_campanie_id
  ),
  target as (
    select c.id as curs_id, c.numele, c.varsta, c.cursul_original, c.capacitate_maxima
    from cursuri c, camp
    where c.sezon = camp.sezon_tinta
      and c.facultativ = false
      and c.nivelul is distinct from 'Trupa'
  ),
  eligibili as (
    select t.curs_id, count(distinct e.client)::int as total
    from target t
    join enrollments e on e.cursul = t.cursul_original
    where t.cursul_original is not null
      and e.activ = true
      and e.reziliat = false
      and (e.data_incepere is null or e.data_incepere <= current_date)
      and (e.data_final is null or e.data_final >= current_date)
    group by t.curs_id
  ),
  gates as (
    select curs_tinta_id,
           count(*) filter (where taxa_platita_la is not null)::int  as taxa_done,
           count(*) filter (where act_status = 'verificat')::int     as act_done,
           count(*) filter (where act_status = 'de_verificat'
                               or (act_status = 'semnat' and act_canal = 'app'))::int as act_de_verificat,
           count(*) filter (where activat_la is not null)::int       as ambele
    from reinscrieri_gate
    where campanie_id = p_campanie_id
    group by curs_tinta_id
  ),
  ocupare as (
    select e.cursul as curs_id, count(distinct e.client)::int as activi
    from enrollments e, camp
    where e.sezon_id = camp.sezon_tinta
      and e.reziliat = false
    group by e.cursul
  )
  select
    t.curs_id,
    t.numele,
    t.varsta,
    coalesce(el.total, 0),
    coalesce(g.taxa_done, 0),
    coalesce(g.act_done, 0),
    coalesce(g.act_de_verificat, 0),
    coalesce(g.ambele, 0),
    (coalesce(el.total, 0) - coalesce(g.ambele, 0)),
    case when coalesce(el.total, 0) > 0
         then round(100.0 * coalesce(g.ambele, 0) / el.total, 1)
         else 0 end,
    coalesce(o.activi, 0),
    t.capacitate_maxima,
    case when coalesce(t.capacitate_maxima, 0) > 0
         then round(100.0 * coalesce(o.activi, 0) / t.capacitate_maxima, 1)
         else null end
  from target t
  left join eligibili el on el.curs_id = t.curs_id
  left join gates g      on g.curs_tinta_id = t.curs_id
  left join ocupare o    on o.curs_id = t.curs_id
  order by t.numele;
$$;

grant execute on function get_campanie_progress_curs(uuid) to authenticated;
revoke execute on function get_campanie_progress_curs(uuid) from anon, public;
