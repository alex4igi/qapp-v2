-- RPC-urile de configurare a grilelor KPI.
--
-- Tabelele au politici de scriere doar pentru admin/owner, dar scrierea reală
-- trece prin funcțiile de aici: o grilă e un set coerent de linii, iar salvarea
-- rând-cu-rând (ca în PraguriModal) lasă configurația pe jumătate scrisă dacă
-- pică request-ul al treilea — pe o tabelă care produce salarii, nu e acceptabil.

-- ── 1. Cine poate primi o grilă ─────────────────────────────────────────────
-- Nu există tabelă de profiluri: conturile de staff trăiesc în auth.users, iar
-- instructorii au rând în `teacheri` cu `auth_user_id` NULLABLE. Dropdown-ul are
-- nevoie de ambele populații într-o singură listă, plus „cine n-are încă grilă",
-- ca să nu ceară un al doilea query.
--
-- Edge function-ul `admin-users` nu servește aici: nu întoarce instructorii fără
-- cont și nu poate face join cu grilele.

create or replace function get_titulari_kpi(p_include_teacheri boolean default true)
returns table (
  tip         text,
  titular_id  uuid,
  nume_afisat text,
  email       text,
  rol         text,
  locatie_id  uuid,
  are_grila   boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Doar owner/admin pot vedea titularii de grilă KPI'
      using errcode = '42501';
  end if;

  return query
  select 'user'::text,
         u.id,
         trim(coalesce(
           nullif(trim(concat_ws(' ', t.prenume, t.nume)), ''),
           nullif(u.raw_user_meta_data ->> 'full_name', ''),
           split_part(u.email, '@', 1)
         )),
         u.email::text,
         (u.raw_app_meta_data ->> 'role')::text,
         nullif(u.raw_app_meta_data ->> 'locatie_id', '')::uuid,
         exists (select 1 from kpi_grile g
                  where g.titular_user = u.id and g.stare <> 'incheiata')
  from auth.users u
  left join teacheri t on t.auth_user_id = u.id
  where u.raw_app_meta_data ->> 'role' in ('owner','admin','manager','front_desk')
    and u.deleted_at is null

  union all

  select 'teacher'::text,
         t.id,
         trim(concat_ws(' ', t.prenume, t.nume)),
         null,
         'teacher'::text,
         t.locatie,
         exists (select 1 from kpi_grile g
                  where g.titular_teacher = t.id and g.stare <> 'incheiata')
  from teacheri t
  where p_include_teacheri
    and coalesce(t.arhivat, false) = false
    and t.auth_user_id is null   -- cei cu cont apar deja în prima ramură

  order by 3;
end;
$$;

revoke execute on function get_titulari_kpi(boolean) from anon, public;
grant execute on function get_titulari_kpi(boolean) to authenticated;

-- ── 2. Atribuirea unei grile = CLONAREA șablonului ──────────────────────────
-- Modelat pe `duplica_program` (20260723160000): gard de rol, copie antet +
-- linii, copia intră în 'ciorna'. Clonare, nu moștenire: o editare ulterioară a
-- șablonului nu are voie să miște tăcut bonusul cuiva.

create or replace function kpi_atribuie_grila(
  p_sablon        uuid,
  p_titular_tip   text,
  p_titular_id    uuid,
  p_locatii       uuid[],
  p_valabil_de_la date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sablon kpi_sabloane;
  v_grila  uuid;
  v_nume   text;
  v_loc    uuid;
begin
  if not is_admin() then
    raise exception 'Doar owner/admin pot atribui grile KPI' using errcode = '42501';
  end if;

  select * into v_sablon from kpi_sabloane where id = p_sablon;
  if not found then
    raise exception 'Șablonul nu există' using errcode = 'P0002';
  end if;
  if v_sablon.stare = 'arhivat' then
    raise exception 'Șablonul e arhivat' using errcode = '22023';
  end if;
  if p_locatii is null or array_length(p_locatii, 1) is null then
    raise exception 'Grila trebuie să acopere cel puțin un punct de lucru'
      using errcode = '22023';
  end if;
  if extract(day from p_valabil_de_la) <> 1 then
    raise exception 'Grila poate începe doar în ziua 1 a unei luni'
      using errcode = '22023';
  end if;

  select nume_afisat into v_nume from get_titulari_kpi(true)
   where titular_id = p_titular_id and tip = p_titular_tip;
  if v_nume is null then
    raise exception 'Titularul nu a fost găsit' using errcode = 'P0002';
  end if;

  insert into kpi_grile (
    titular_user, titular_teacher, titular_nume, post, perioada,
    cota_manager, zile_min_evaluare, sablon_sursa, valabil_de_la, stare, creat_de
  ) values (
    case when p_titular_tip = 'user'    then p_titular_id end,
    case when p_titular_tip = 'teacher' then p_titular_id end,
    v_nume, v_sablon.post, v_sablon.perioada,
    v_sablon.cota_manager, v_sablon.zile_min_evaluare, v_sablon.id,
    p_valabil_de_la, 'ciorna', auth.uid()
  ) returning id into v_grila;

  foreach v_loc in array p_locatii loop
    insert into kpi_grila_locatii (grila_id, locatie) values (v_grila, v_loc)
    on conflict do nothing;
  end loop;

  insert into kpi_grila_linii (
    grila_id, kpi_id, pondere, tip_prag, prag_standard, prag_peste,
    conditie_sub, conditie_standard, conditie_peste, suma_standard, suma_peste,
    mod_calcul, comision_procent_standard, comision_procent_peste, comision_plafon,
    luni_active, eliminatoriu, are_poarta, parametri, activ, ordine
  )
  select v_grila, l.kpi_id, l.pondere, l.tip_prag, l.prag_standard, l.prag_peste,
         l.conditie_sub, l.conditie_standard, l.conditie_peste, l.suma_standard, l.suma_peste,
         l.mod_calcul, l.comision_procent_standard, l.comision_procent_peste, l.comision_plafon,
         l.luni_active, l.eliminatoriu, l.are_poarta, l.parametri, l.activ, l.ordine
  from kpi_sablon_linii l
  where l.sablon_id = p_sablon;

  insert into audit_log (actor_id, actor_role, entity_type, entity_id, action, new_value)
  values (auth.uid(), auth_role(), 'kpi_grila', v_grila, 'create',
          jsonb_build_object('sablon', p_sablon, 'titular', v_nume,
                             'de_la', p_valabil_de_la));

  return v_grila;
end;
$$;

revoke execute on function kpi_atribuie_grila(uuid, text, uuid, uuid[], date) from anon, public;
grant execute on function kpi_atribuie_grila(uuid, text, uuid, uuid[], date) to authenticated;

-- ── 3. Salvarea liniilor, cu tot setul dintr-o dată ─────────────────────────

create or replace function kpi_grila_seteaza_linii(p_grila uuid, p_linii jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  if not is_admin() then
    raise exception 'Doar owner/admin pot edita grilele KPI' using errcode = '42501';
  end if;
  if not exists (select 1 from kpi_grile where id = p_grila) then
    raise exception 'Grila nu există' using errcode = 'P0002';
  end if;

  delete from kpi_grila_linii where grila_id = p_grila;

  insert into kpi_grila_linii (
    grila_id, kpi_id, pondere, tip_prag, prag_standard, prag_peste,
    conditie_sub, conditie_standard, conditie_peste, suma_standard, suma_peste,
    mod_calcul, comision_procent_standard, comision_procent_peste, comision_plafon,
    luni_active, eliminatoriu, are_poarta, parametri, activ, ordine
  )
  select p_grila,
         (l ->> 'kpi_id')::uuid,
         coalesce((l ->> 'pondere')::numeric, 0),
         coalesce(l ->> 'tip_prag', 'procent'),
         nullif(l ->> 'prag_standard', '')::numeric,
         nullif(l ->> 'prag_peste', '')::numeric,
         l ->> 'conditie_sub', l ->> 'conditie_standard', l ->> 'conditie_peste',
         nullif(l ->> 'suma_standard', '')::numeric,
         nullif(l ->> 'suma_peste', '')::numeric,
         coalesce(l ->> 'mod_calcul', 'fix'),
         nullif(l ->> 'comision_procent_standard', '')::numeric,
         nullif(l ->> 'comision_procent_peste', '')::numeric,
         nullif(l ->> 'comision_plafon', '')::numeric,
         case when l -> 'luni_active' is null or jsonb_typeof(l -> 'luni_active') = 'null'
              then null
              else (select array_agg(value::text::int)
                      from jsonb_array_elements(l -> 'luni_active')) end,
         coalesce((l ->> 'eliminatoriu')::boolean, false),
         coalesce((l ->> 'are_poarta')::boolean, false),
         coalesce(l -> 'parametri', '{}'::jsonb),
         coalesce((l ->> 'activ')::boolean, true),
         coalesce((l ->> 'ordine')::int, 0)
  from jsonb_array_elements(p_linii) l;

  get diagnostics v_n = row_count;

  update kpi_grile set updated = now() where id = p_grila;

  insert into audit_log (actor_id, actor_role, entity_type, entity_id, action, new_value)
  values (auth.uid(), auth_role(), 'kpi_grila', p_grila, 'update',
          jsonb_build_object('linii', v_n));

  return v_n;
end;
$$;

revoke execute on function kpi_grila_seteaza_linii(uuid, jsonb) from anon, public;
grant execute on function kpi_grila_seteaza_linii(uuid, jsonb) to authenticated;

-- Aceeași operație pe șablon (structura pe post).
create or replace function kpi_sablon_seteaza_linii(p_sablon uuid, p_linii jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_n int;
begin
  if not is_admin() then
    raise exception 'Doar owner/admin pot edita șabloanele KPI' using errcode = '42501';
  end if;

  delete from kpi_sablon_linii where sablon_id = p_sablon;

  insert into kpi_sablon_linii (
    sablon_id, kpi_id, pondere, tip_prag, prag_standard, prag_peste,
    conditie_sub, conditie_standard, conditie_peste, suma_standard, suma_peste,
    mod_calcul, comision_procent_standard, comision_procent_peste, comision_plafon,
    luni_active, eliminatoriu, are_poarta, parametri, activ, ordine
  )
  select p_sablon, (l ->> 'kpi_id')::uuid,
         coalesce((l ->> 'pondere')::numeric, 0),
         coalesce(l ->> 'tip_prag', 'procent'),
         nullif(l ->> 'prag_standard', '')::numeric,
         nullif(l ->> 'prag_peste', '')::numeric,
         l ->> 'conditie_sub', l ->> 'conditie_standard', l ->> 'conditie_peste',
         nullif(l ->> 'suma_standard', '')::numeric,
         nullif(l ->> 'suma_peste', '')::numeric,
         coalesce(l ->> 'mod_calcul', 'fix'),
         nullif(l ->> 'comision_procent_standard', '')::numeric,
         nullif(l ->> 'comision_procent_peste', '')::numeric,
         nullif(l ->> 'comision_plafon', '')::numeric,
         case when l -> 'luni_active' is null or jsonb_typeof(l -> 'luni_active') = 'null'
              then null
              else (select array_agg(value::text::int) from jsonb_array_elements(l -> 'luni_active')) end,
         coalesce((l ->> 'eliminatoriu')::boolean, false),
         coalesce((l ->> 'are_poarta')::boolean, false),
         coalesce(l -> 'parametri', '{}'::jsonb),
         coalesce((l ->> 'activ')::boolean, true),
         coalesce((l ->> 'ordine')::int, 0)
  from jsonb_array_elements(p_linii) l;

  get diagnostics v_n = row_count;
  update kpi_sabloane set updated = now() where id = p_sablon;
  return v_n;
end;
$$;

revoke execute on function kpi_sablon_seteaza_linii(uuid, jsonb) from anon, public;
grant execute on function kpi_sablon_seteaza_linii(uuid, jsonb) to authenticated;

-- ── 4. Activarea: aici se validează coerența, nu la fiecare tastă ───────────
-- Σ ponderi = 100 e o regulă între rânduri, deci nu poate fi CHECK de rând, iar
-- ca trigger ar respinge fiecare salvare intermediară. Se verifică o dată, la
-- trecerea în 'activa'; în editor rămâne doar un avertisment.

create or replace function kpi_grila_activeaza(p_grila uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grila    kpi_grile;
  v_pondere  numeric;
  v_probleme text[] := '{}';
  v_linie    record;
begin
  if not is_admin() then
    raise exception 'Doar owner/admin pot activa grile KPI' using errcode = '42501';
  end if;

  select * into v_grila from kpi_grile where id = p_grila;
  if not found then
    raise exception 'Grila nu există' using errcode = 'P0002';
  end if;

  if not exists (select 1 from kpi_grila_locatii where grila_id = p_grila) then
    v_probleme := v_probleme || 'Grila nu are niciun punct de lucru.';
  end if;

  select coalesce(sum(pondere), 0) into v_pondere
  from kpi_grila_linii where grila_id = p_grila and activ and not eliminatoriu;

  if abs(v_pondere - 100) > 0.01 then
    v_probleme := v_probleme
      || format('Suma ponderilor e %s%%, nu 100%%.', round(v_pondere, 2));
  end if;

  for v_linie in
    select l.*, d.denumire
    from kpi_grila_linii l
    join kpi_definitii d on d.id = l.kpi_id
    where l.grila_id = p_grila and l.activ and not l.eliminatoriu and l.pondere > 0
  loop
    if v_linie.mod_calcul = 'comision' then
      if v_linie.comision_procent_standard is null or v_linie.comision_plafon is null then
        v_probleme := v_probleme
          || format('„%s": comisionul nu are procent sau plafon.', v_linie.denumire);
      end if;
    elsif v_linie.suma_standard is null or v_linie.suma_peste is null then
      -- Blocantul principal: MOA nu conține sume în lei, deci fără completarea
      -- lor grila ar produce bonus zero fără să spună de ce.
      v_probleme := v_probleme
        || format('„%s": lipsesc sumele în lei.', v_linie.denumire);
    end if;

    if v_linie.tip_prag <> 'afirmativ' and v_linie.prag_standard is null then
      v_probleme := v_probleme
        || format('„%s": lipsește pragul de standard.', v_linie.denumire);
    end if;
  end loop;

  if array_length(v_probleme, 1) > 0 then
    return jsonb_build_object('activata', false, 'probleme', to_jsonb(v_probleme));
  end if;

  update kpi_grile set stare = 'activa', updated = now() where id = p_grila;

  insert into audit_log (actor_id, actor_role, entity_type, entity_id, action, new_value)
  values (auth.uid(), auth_role(), 'kpi_grila', p_grila, 'update',
          jsonb_build_object('stare', 'activa'));

  return jsonb_build_object('activata', true, 'pondere_totala', v_pondere);
end;
$$;

revoke execute on function kpi_grila_activeaza(uuid) from anon, public;
grant execute on function kpi_grila_activeaza(uuid) to authenticated;

-- ── 5. KPI manuale noi, din interfață ───────────────────────────────────────
-- `sursa` e HARDCODATĂ pe 'manual'. Un indicator 'auto' creat din UI ar avea o
-- cheie fără ramură în dispecerul de calcul și ar produce zero în tăcere, exact
-- în luna în care se plătesc bani.

create or replace function salveaza_definitie_kpi(
  p_id          uuid,
  p_cheie       text,
  p_denumire    text,
  p_descriere   text default null,
  p_tip_valoare text default 'procent',
  p_unitate     text default null,
  p_directie    text default 'mai_mare_e_bine'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not is_admin() then
    raise exception 'Doar owner/admin pot edita catalogul de KPI' using errcode = '42501';
  end if;

  if p_id is null then
    insert into kpi_definitii (cheie, denumire, descriere, sursa, tip_valoare, unitate, directie)
    values (lower(regexp_replace(trim(p_cheie), '[^a-zA-Z0-9]+', '_', 'g')),
            p_denumire, p_descriere, 'manual', p_tip_valoare, p_unitate, p_directie)
    returning id into v_id;
  else
    -- Cheia și sursa nu se schimbă la editare: cheia e referința din rapoartele
    -- deja închise, iar sursa ar putea transforma un manual într-un auto fantomă.
    update kpi_definitii
       set denumire = p_denumire, descriere = p_descriere,
           tip_valoare = p_tip_valoare, unitate = p_unitate, directie = p_directie
     where id = p_id
     returning id into v_id;
  end if;

  return v_id;
end;
$$;

revoke execute on function salveaza_definitie_kpi(uuid, text, text, text, text, text, text) from anon, public;
grant execute on function salveaza_definitie_kpi(uuid, text, text, text, text, text, text) to authenticated;

-- ── 6. Citirea grilelor pentru listă ────────────────────────────────────────

create or replace function get_grile_kpi()
returns table (
  id              uuid,
  titular_nume    text,
  tip_titular     text,
  post            text,
  perioada        text,
  locatii         text,
  valabil_de_la   date,
  valabil_pana_la date,
  stare           text,
  pondere_totala  numeric,
  nr_linii        int,
  sume_lipsa      int
)
language sql
stable
security invoker
set search_path = public
as $$
  select g.id, g.titular_nume,
         case when g.titular_user is not null then 'user' else 'teacher' end,
         g.post, g.perioada,
         (select string_agg(l.nume, ', ' order by l.nume)
            from kpi_grila_locatii gl join locatii l on l.id = gl.locatie
           where gl.grila_id = g.id),
         g.valabil_de_la, g.valabil_pana_la, g.stare,
         coalesce((select sum(pondere) from kpi_grila_linii
                    where grila_id = g.id and activ and not eliminatoriu), 0),
         (select count(*)::int from kpi_grila_linii where grila_id = g.id),
         (select count(*)::int from kpi_grila_linii
           where grila_id = g.id and activ and not eliminatoriu and pondere > 0
             and mod_calcul = 'fix' and (suma_standard is null or suma_peste is null))
  from kpi_grile g
  order by g.stare, g.titular_nume;
$$;

revoke execute on function get_grile_kpi() from anon, public;
grant execute on function get_grile_kpi() to authenticated;
