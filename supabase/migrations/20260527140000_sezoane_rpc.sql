-- Qapp v2 — RPC-uri ciclu de viață sezoane + clonare + progres reînscrieri
--
-- 1. cursuri.cursul_original — lineage pentru clonare (pentru matching la reînscrieri)
-- 2. clone_sezon — creează sezon nou + cursuri clonate (cu overrides) + vacanțe
-- 3. activate_sezon — arhivează activul curent + activează țintă (planificat → activ)
-- 4. archive_expired_sezoane — apelat de cron: orice activ cu data_final < azi → arhivat
-- 5. activate_eligible_sezoane — apelat de cron: orice planificat cu data_incepere ≤ azi → activ
-- 6. get_reinscrieri_progress — agregare per curs din sezonul țintă

-- ============================================================================
-- 1. CURSURI.CURSUL_ORIGINAL — lineage prin clonare
-- ============================================================================

alter table cursuri add column if not exists cursul_original uuid;

alter table cursuri drop constraint if exists fk_cursuri_cursul_original;
alter table cursuri add constraint fk_cursuri_cursul_original
  foreign key (cursul_original) references cursuri(id) on delete set null;

create index if not exists idx_cursuri_cursul_original on cursuri(cursul_original);

-- ============================================================================
-- 2. RPC clone_sezon
--    p_cursuri: [{"sursa_id":"<uuid>","overrides":{numele,pret_lunar,...}}]
--    p_vacante: [{"nume":"...","data_incepere":"YYYY-MM-DD","data_final":"YYYY-MM-DD"}]
-- ============================================================================

create or replace function clone_sezon(
  p_sezon_sursa uuid,
  p_nume text,
  p_tip text,
  p_data_incepere date,
  p_data_final date,
  p_cursuri jsonb default '[]'::jsonb,
  p_vacante jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_sezon uuid;
  v_item jsonb;
  v_ov jsonb;
  v_sursa cursuri%rowtype;
begin
  if not is_admin() then
    raise exception 'Acces refuzat: doar admin poate crea sezoane.';
  end if;

  if p_tip not in ('principal','extra') then
    raise exception 'Tipul sezonului trebuie să fie principal sau extra.';
  end if;

  if p_data_incepere is null or p_data_final is null then
    raise exception 'Datele de început și final ale sezonului sunt obligatorii.';
  end if;

  if p_data_final < p_data_incepere then
    raise exception 'data_final nu poate fi înainte de data_incepere.';
  end if;

  insert into sezoane (numele_sezonului, tip, data_incepere, data_final, stare)
  values (trim(p_nume), p_tip, p_data_incepere, p_data_final, 'planificat')
  returning id into v_new_sezon;

  for v_item in select * from jsonb_array_elements(coalesce(p_cursuri, '[]'::jsonb))
  loop
    select * into v_sursa from cursuri where id = (v_item->>'sursa_id')::uuid;
    if not found then
      continue;
    end if;
    v_ov := coalesce(v_item->'overrides', '{}'::jsonb);

    -- La extra-sezon forțăm facultativ=true; trigger-ul ar bloca altfel.
    insert into cursuri (
      numele, stil, nivelul, varsta, teacher, sala, sezon,
      facultativ, pret_anual, pret_lunar, pret_sedinta, pret_lunar_promo,
      capacitate_maxima, participari_eveniment, zile, ora, durata_cursului,
      one_time, suspendat, cursul_original
    ) values (
      coalesce(nullif(v_ov->>'numele',''), v_sursa.numele),
      coalesce(nullif(v_ov->>'stil',''), v_sursa.stil),
      coalesce(nullif(v_ov->>'nivelul','')::nivel_curs, v_sursa.nivelul),
      coalesce(nullif(v_ov->>'varsta','')::varsta_curs, v_sursa.varsta),
      coalesce(nullif(v_ov->>'teacher','')::uuid, v_sursa.teacher),
      coalesce(nullif(v_ov->>'sala','')::uuid, v_sursa.sala),
      v_new_sezon,
      case
        when p_tip = 'extra' then true
        when v_ov ? 'facultativ' then (v_ov->>'facultativ')::boolean
        else v_sursa.facultativ
      end,
      coalesce(nullif(v_ov->>'pret_anual','')::numeric, v_sursa.pret_anual),
      coalesce(nullif(v_ov->>'pret_lunar','')::numeric, v_sursa.pret_lunar),
      coalesce(nullif(v_ov->>'pret_sedinta','')::numeric, v_sursa.pret_sedinta),
      coalesce(nullif(v_ov->>'pret_lunar_promo','')::numeric, v_sursa.pret_lunar_promo),
      coalesce(nullif(v_ov->>'capacitate_maxima','')::int, v_sursa.capacitate_maxima),
      v_sursa.participari_eveniment,
      coalesce(nullif(v_ov->>'zile','')::zi_saptamana, v_sursa.zile),
      coalesce(nullif(v_ov->>'ora',''), v_sursa.ora),
      coalesce(nullif(v_ov->>'durata_cursului','')::numeric, v_sursa.durata_cursului),
      v_sursa.one_time,
      false,
      v_sursa.id
    );
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_vacante, '[]'::jsonb))
  loop
    insert into vacante (sezon_id, nume, data_incepere, data_final)
    values (
      v_new_sezon,
      trim(v_item->>'nume'),
      (v_item->>'data_incepere')::date,
      (v_item->>'data_final')::date
    );
  end loop;

  return v_new_sezon;
end;
$$;

grant execute on function clone_sezon(uuid, text, text, date, date, jsonb, jsonb) to authenticated;

-- ============================================================================
-- 3. RPC activate_sezon
-- ============================================================================

create or replace function activate_sezon(p_sezon_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stare text;
begin
  if not is_admin() then
    raise exception 'Acces refuzat: doar admin poate activa sezoane.';
  end if;

  select stare into v_stare from sezoane where id = p_sezon_id;
  if v_stare is null then
    raise exception 'Sezonul nu există.';
  end if;
  if v_stare = 'activ' then
    return;
  end if;
  if v_stare = 'arhivat' then
    raise exception 'Sezonul este arhivat și nu poate fi reactivat.';
  end if;

  update sezoane set stare = 'arhivat' where stare = 'activ';
  update sezoane set stare = 'activ' where id = p_sezon_id;
end;
$$;

grant execute on function activate_sezon(uuid) to authenticated;

-- ============================================================================
-- 4. RPC archive_expired_sezoane (apelat de cron)
-- ============================================================================

create or replace function archive_expired_sezoane()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  with arch as (
    update sezoane
    set stare = 'arhivat'
    where stare = 'activ'
      and data_final is not null
      and data_final < current_date
    returning id
  )
  select count(*) into v_count from arch;
  return v_count;
end;
$$;

grant execute on function archive_expired_sezoane() to authenticated;

-- ============================================================================
-- 5. RPC activate_eligible_sezoane (apelat de cron)
--    Pentru fiecare sezon `planificat` cu data_incepere ≤ azi (și interval valid):
--    îl activează DACĂ nu există alt sezon `activ` (constraint unique l-ar bloca).
-- ============================================================================

create or replace function activate_eligible_sezoane()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
  v_id uuid;
begin
  for v_id in
    select id from sezoane
    where stare = 'planificat'
      and data_incepere is not null
      and data_incepere <= current_date
      and (data_final is null or data_final >= current_date)
    order by data_incepere
  loop
    if not exists (select 1 from sezoane where stare = 'activ') then
      update sezoane set stare = 'activ' where id = v_id;
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

grant execute on function activate_eligible_sezoane() to authenticated;

-- ============================================================================
-- 6. RPC get_reinscrieri_progress
--    Pentru fiecare curs din sezonul țintă (CTE „target"):
--      total_eligibili = clienți cu înrolare activă pe `cursul_original` (sezon curent)
--      activati = clienți cu înrolare în sezonul țintă cu este_reinscriere=true
-- ============================================================================

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
