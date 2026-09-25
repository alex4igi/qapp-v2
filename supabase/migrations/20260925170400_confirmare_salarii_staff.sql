-- Confirmarea salariilor de manager și recepție, pe componente.
--
-- O lună confirmată nu se mai mișcă: se îngheață suma fiecărei componente,
-- calculul din spatele ei și regulile aplicate (parametrii grilei, configurarea
-- omului). O schimbare ulterioară de normă, fidelitate, capacitate sau grilă nu
-- atinge ce e confirmat; corecția trece doar prin RPC, cu motiv și urmă.
--
-- Pe componente, pentru că luna calculată nu coincide cu momentul plății: baza și
-- fixul se știu oricând, bonusurile măsurate pe lună după ce luna s-a încheiat,
-- iar rata de încasare (manager) și K2 (recepție) abia după finalul lunii M+1.
-- O singură componentă provizorie nu ține tot salariul deschis.

-- ── 1. Ocuparea managerului e definitivă abia după finalul lunii ──────────────
create or replace function public.calculeaza_salariu_manager(p_user uuid, p_anul int, p_luna int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_m          date := make_date(p_anul, p_luna, 1);
  v_m1         date := (make_date(p_anul, p_luna, 1) + interval '1 month')::date;
  v_azi        date := (now() at time zone 'Europe/Bucharest')::date;
  v_par        jsonb;
  v_vara       boolean;
  v_nume       text;
  v_locs       uuid[];
  v_n          int;
  v_baza       numeric := 0;
  v_sezon      uuid;
  v_mod        text;
  v_loc        record;
  v_r          jsonb;
  v_rata       numeric;
  v_tr_inc     text;
  v_proc       numeric;
  v_bonus_inc  numeric;
  v_prov_inc   boolean;
  v_ids        uuid[];
  v_locuri     int;
  v_cap        int;
  v_nr_pool    int;
  v_lipsa      jsonb;
  v_pct        numeric;
  v_tr_mas     text;
  v_tr_oc      text;
  v_lei        numeric;
  v_bonus_oc   numeric;
  v_bl_oc      text;
  v_locatii    jsonb := '[]'::jsonb;
  v_comp       jsonb := '[]'::jsonb;
  v_total      numeric := 0;
  v_prov       boolean := false;
  v_blocante   jsonb := '[]'::jsonb;
  v_avert      jsonb := '[]'::jsonb;
begin
  if not (is_admin() or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then
    raise exception 'Acces refuzat.' using errcode = '42501';
  end if;

  v_par := _salarizare_parametri('manager', v_m);
  v_vara := exists (select 1 from jsonb_array_elements_text(v_par -> 'luni_vara') x where x::int = p_luna);

  select array_agg(ml.locatie_id order by ml.locatie_id), min(ml.titular_nume)
    into v_locs, v_nume
  from manageri_locatii ml
  where ml.user_id = p_user
    and ml.valabil_de_la <= v_m
    and (ml.valabil_pana_la is null or v_m < ml.valabil_pana_la);

  v_n := coalesce(array_length(v_locs, 1), 0);
  if v_n = 0 then
    return jsonb_build_object('user_id', p_user, 'anul', p_anul, 'luna', p_luna,
                              'manager', false, 'total', 0, 'locatii', '[]'::jsonb,
                              'componente', '[]'::jsonb);
  end if;

  -- Baza: 12 luni pe an.
  if v_n > jsonb_array_length(v_par -> 'baza_pe_nr_locatii') then
    v_blocante := v_blocante || to_jsonb(format(
      '%s locații — grila are bază doar până la %s.', v_n, jsonb_array_length(v_par -> 'baza_pe_nr_locatii')));
  else
    v_baza := (v_par -> 'baza_pe_nr_locatii' ->> (v_n - 1))::numeric;
  end if;
  v_total := v_baza;
  v_comp := v_comp || jsonb_build_object(
    'cheie', 'baza', 'eticheta', format('Bază (%s %s)', v_n, case when v_n = 1 then 'locație' else 'locații' end),
    'suma', v_baza, 'provizoriu', false,
    'blocant', case when v_n > jsonb_array_length(v_par -> 'baza_pe_nr_locatii') then 'bază lipsă în grilă' end);

  -- Vara: doar baza (bonusurile de vară sunt nedefinite).
  if not v_vara then
    v_sezon := _sezon_lunii(v_m);
    v_mod := _mod_ocupare('manager', v_m);
    if v_sezon is null then
      v_blocante := v_blocante || to_jsonb('Nu există sezon pentru luna asta.'::text);
    end if;

    for v_loc in select l.id, l.nume from locatii l where l.id = any(v_locs) order by l.nume loop
      -- ── Încasare ──
      v_r := kpi_rata_incasare(array[v_loc.id], p_anul, p_luna);
      v_rata := (v_r ->> 'valoare')::numeric;
      v_proc := 0;
      if v_rata is null then
        v_tr_inc := 'na';
        v_avert := v_avert || to_jsonb(format('%s: nicio rată scadentă în lună — bonusul pe încasări e 0.', v_loc.nume));
      elsif v_rata >= (v_par #>> '{incasare,peste,de_la}')::numeric then
        v_tr_inc := 'peste'; v_proc := (v_par #>> '{incasare,peste,procent}')::numeric;
      elsif v_rata >= (v_par #>> '{incasare,standard,de_la}')::numeric then
        v_tr_inc := 'standard'; v_proc := (v_par #>> '{incasare,standard,procent}')::numeric;
      elsif v_rata >= (v_par #>> '{incasare,sub,de_la}')::numeric then
        v_tr_inc := 'sub'; v_proc := (v_par #>> '{incasare,sub,procent}')::numeric;
      else
        v_tr_inc := 'insuficient';
      end if;
      v_bonus_inc := round((v_r ->> 'incasari_luna')::numeric * v_proc / 100, 2);
      v_prov_inc := coalesce((v_r ->> 'provizoriu')::boolean, false);
      v_prov := v_prov or v_prov_inc;

      -- ── Ocupare ──
      -- Locuri: grupele sezonului de la locație, lansate și nesuspendate în M
      -- (trupe, facultative și Open intră; one-time nu). Capacitatea: pool-ul fixat.
      select array_agg(c.id) into v_ids
      from cursuri c
      join sezoane z on z.id = c.sezon
      left join sali s on s.id = c.sala
      where c.sezon = v_sezon
        and not coalesce(c.one_time, false)
        and coalesce(c.locatie, s.locatie) = v_loc.id
        and greatest(date_trunc('month', z.data_incepere), date_trunc('month', c.created))::date <= v_m
        and curs_activ_in_luna(c.id, v_m);
      v_ids := coalesce(v_ids, '{}'::uuid[]);

      select coalesce(sum(lo.ocupate), 0)::int into v_locuri from locuri_ocupate_luna(v_m, v_ids) lo;
      select coalesce(sum(p.capacitate), 0)::int, count(*)::int into v_cap, v_nr_pool
      from capacitate_pool p
      where p.sezon_id = v_sezon and p.locatie_id = v_loc.id and p.din_luna <= v_m and not p.exclus;

      select coalesce(jsonb_agg(c.numele order by c.numele), '[]'::jsonb) into v_lipsa
      from cursuri c
      where c.id = any(v_ids)
        and not exists (select 1 from capacitate_pool p where p.sezon_id = v_sezon and p.curs_id = c.id);

      v_bl_oc := null;
      if jsonb_array_length(v_lipsa) > 0 then
        v_bl_oc := format('grupe active care lipsesc din pool-ul de capacitate: %s',
                          (select string_agg(x, ', ') from jsonb_array_elements_text(v_lipsa) x));
      elsif v_cap = 0 then
        v_bl_oc := 'pool-ul de capacitate e gol';
      end if;

      v_pct := case when v_cap > 0 then round(100.0 * v_locuri / v_cap, 2) end;
      v_tr_mas := case
        when v_pct is null then 'na'
        when v_pct >= (v_par #>> '{ocupare,peste,de_la}')::numeric then 'peste'
        when v_pct >= (v_par #>> '{ocupare,standard,de_la}')::numeric then 'standard'
        when v_pct >= (v_par #>> '{ocupare,sub,de_la}')::numeric then 'sub'
        else 'insuficient' end;
      v_tr_oc := case
        when v_mod = 'standard_fix' then 'standard'
        when v_mod = 'standard_podea' and v_tr_mas in ('na', 'insuficient', 'sub') then 'standard'
        else v_tr_mas end;
      v_lei := case v_tr_oc
        when 'peste' then (v_par #>> '{ocupare,peste,lei}')::numeric
        when 'standard' then (v_par #>> '{ocupare,standard,lei}')::numeric
        when 'sub' then (v_par #>> '{ocupare,sub,lei}')::numeric
        else 0 end;
      v_bonus_oc := case when v_bl_oc is null then v_locuri * v_lei else 0 end;
      if v_bl_oc is not null then
        v_blocante := v_blocante || to_jsonb(format('%s: %s.', v_loc.nume, v_bl_oc));
      end if;

      v_total := v_total + v_bonus_inc + v_bonus_oc;

      v_locatii := v_locatii || jsonb_build_object(
        'locatie_id', v_loc.id,
        'locatie_nume', v_loc.nume,
        'incasare', jsonb_build_object(
          'scadent', (v_r ->> 'numitor')::numeric,
          'platit', (v_r ->> 'numarator')::numeric,
          'nr_rate', (v_r ->> 'nr_inrolari')::int,
          'rata', v_rata,
          'treapta', v_tr_inc,
          'procent', v_proc,
          'incasari_luna', (v_r ->> 'incasari_luna')::numeric,
          'bonus', v_bonus_inc,
          'provizoriu', v_prov_inc,
          'final_la', v_r ->> 'final_la'),
        'ocupare', jsonb_build_object(
          'locuri', v_locuri,
          'capacitate', v_cap,
          'grupe_active', coalesce(array_length(v_ids, 1), 0),
          'grupe_in_pool', v_nr_pool,
          'procent', v_pct,
          'treapta_masurata', v_tr_mas,
          'treapta', v_tr_oc,
          'mod', v_mod,
          'lei_pe_loc', v_lei,
          'bonus', v_bonus_oc,
          'grupe_lipsa_din_pool', v_lipsa));

      v_comp := v_comp
        || jsonb_build_object('cheie', 'bonus_incasari:' || v_loc.id,
             'eticheta', 'Bonus încasări · ' || v_loc.nume, 'suma', v_bonus_inc,
             'provizoriu', v_prov_inc, 'final_la', v_r ->> 'final_la', 'blocant', null)
        || jsonb_build_object('cheie', 'bonus_ocupare:' || v_loc.id,
             'eticheta', 'Bonus ocupare · ' || v_loc.nume, 'suma', v_bonus_oc,
             -- Locurile se numără pe toată luna: definitiv după ce luna s-a încheiat.
             'provizoriu', v_azi < v_m1, 'final_la', (v_m1 - 1)::text, 'blocant', v_bl_oc);
    end loop;
  end if;

  return jsonb_build_object(
    'user_id', p_user,
    'titular_nume', v_nume,
    'manager', true,
    'anul', p_anul,
    'luna', p_luna,
    'perioada', case when v_vara then 'vara' else 'sezon' end,
    'reguli', jsonb_build_object('parametri', v_par, 'mod_ocupare', v_mod, 'sezon_id', v_sezon),
    'baza', jsonb_build_object('nr_locatii', v_n, 'suma', v_baza),
    'locatii', v_locatii,
    'componente', v_comp,
    'total', v_total,
    'provizoriu', v_prov or (not v_vara and v_azi < v_m1),
    'blocante', v_blocante,
    'avertismente', v_avert);
end;
$$;


-- ── 2. Componentele confirmate ────────────────────────────────────────────────
create table public.salarii_staff_componente (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users(id) on delete set null,
  titular_nume   text not null,
  post           text not null check (post in ('manager', 'receptie')),
  anul           int not null check (anul between 2020 and 2100),
  luna           int not null check (luna between 1 and 12),
  componenta     text not null,
  eticheta       text not null,
  suma           numeric not null,
  detalii        jsonb not null default '{}'::jsonb,
  reguli         jsonb not null default '{}'::jsonb,
  stare          text not null default 'confirmat' check (stare in ('confirmat', 'corectat')),
  confirmat_de   uuid references auth.users(id) on delete set null,
  confirmat_la   timestamptz not null default now(),
  platit_in_luna date check (platit_in_luna is null or extract(day from platit_in_luna) = 1),
  nota           text,
  unique (user_id, post, anul, luna, componenta)
);

create index idx_salarii_staff_luna on public.salarii_staff_componente (anul, luna);

alter table public.salarii_staff_componente enable row level security;
create policy salarii_staff_admin_select on public.salarii_staff_componente for select to authenticated
  using ((select auth_role()) in ('owner', 'admin'));
create policy deny_parinte_direct on public.salarii_staff_componente as restrictive for all to authenticated
  using (auth_role() <> 'parinte') with check (auth_role() <> 'parinte');
create policy deny_marketing_direct on public.salarii_staff_componente as restrictive for all to authenticated
  using (auth_role() <> 'marketing') with check (auth_role() <> 'marketing');
-- Scrierea doar prin RPC-urile de mai jos: fără INSERT/UPDATE/DELETE direct.
revoke all on public.salarii_staff_componente from anon, authenticated;
grant select on public.salarii_staff_componente to authenticated;
grant all on public.salarii_staff_componente to service_role;

-- ── 3. Calculul, pe post ──────────────────────────────────────────────────────
create or replace function public._calcul_salariu_staff(p_user uuid, p_post text, p_anul int, p_luna int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_post = 'manager' then return calculeaza_salariu_manager(p_user, p_anul, p_luna);
  elsif p_post = 'receptie' then return calculeaza_salariu_receptie(p_user, p_anul, p_luna);
  end if;
  raise exception 'Post necunoscut: %', p_post using errcode = '22023';
end;
$$;

revoke execute on function public._calcul_salariu_staff(uuid, text, int, int) from anon, public, authenticated;
grant execute on function public._calcul_salariu_staff(uuid, text, int, int) to service_role;

-- ── 4. Confirmarea: tot ce e definitiv și neblocat, încă neconfirmat ───────────
create or replace function public.confirma_salariu_staff(
  p_user           uuid,
  p_post           text,
  p_anul           int,
  p_luna           int,
  p_platit_in_luna date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_calc      jsonb;
  v_c         jsonb;
  v_conf      jsonb := '[]'::jsonb;
  v_ramase    jsonb := '[]'::jsonb;
  v_blocate   jsonb := '[]'::jsonb;
  v_deja      jsonb := '[]'::jsonb;
begin
  if not is_admin() then
    raise exception 'Acces refuzat.' using errcode = '42501';
  end if;

  v_calc := _calcul_salariu_staff(p_user, p_post, p_anul, p_luna);
  if jsonb_array_length(coalesce(v_calc -> 'componente', '[]'::jsonb)) = 0 then
    raise exception 'Omul nu are salariu de % în luna asta.', p_post using errcode = '22023';
  end if;

  for v_c in select * from jsonb_array_elements(v_calc -> 'componente') loop
    if exists (select 1 from salarii_staff_componente s
                where s.user_id = p_user and s.post = p_post and s.anul = p_anul
                  and s.luna = p_luna and s.componenta = v_c ->> 'cheie') then
      v_deja := v_deja || to_jsonb(v_c ->> 'eticheta');
    elsif (v_c ->> 'blocant') is not null then
      v_blocate := v_blocate || jsonb_build_object('eticheta', v_c ->> 'eticheta', 'motiv', v_c ->> 'blocant');
    elsif coalesce((v_c ->> 'provizoriu')::boolean, false) then
      v_ramase := v_ramase || jsonb_build_object('eticheta', v_c ->> 'eticheta', 'final_la', v_c ->> 'final_la');
    else
      insert into salarii_staff_componente (
        user_id, titular_nume, post, anul, luna, componenta, eticheta, suma,
        detalii, reguli, confirmat_de, platit_in_luna)
      values (
        p_user, coalesce(v_calc ->> 'titular_nume', '—'), p_post, p_anul, p_luna,
        v_c ->> 'cheie', v_c ->> 'eticheta', (v_c ->> 'suma')::numeric,
        v_c || jsonb_build_object('calcul', v_calc - 'reguli'),
        coalesce(v_calc -> 'reguli', '{}'::jsonb), auth.uid(), p_platit_in_luna);
      v_conf := v_conf || jsonb_build_object('eticheta', v_c ->> 'eticheta', 'suma', (v_c ->> 'suma')::numeric);
    end if;
  end loop;

  if jsonb_array_length(v_conf) > 0 then
    insert into audit_log (actor_id, actor_role, entity_type, entity_id, action, new_value)
    values (auth.uid(), auth_role(), 'salariu_staff', p_user, 'confirm',
            jsonb_build_object('post', p_post, 'anul', p_anul, 'luna', p_luna,
                               'titular', v_calc ->> 'titular_nume', 'confirmate', v_conf));
  end if;

  return jsonb_build_object('confirmate', v_conf, 'ramase', v_ramase,
                            'blocate', v_blocate, 'deja_confirmate', v_deja);
end;
$$;

revoke execute on function public.confirma_salariu_staff(uuid, text, int, int, date) from anon, public;
grant execute on function public.confirma_salariu_staff(uuid, text, int, int, date) to authenticated;

-- ── 5. Corecția: doar owner, cu motiv, cu urmă ────────────────────────────────
-- Recalculează componenta pe datele de azi și o suprascrie; valoarea veche rămâne
-- în audit_log. Nu corectează o componentă încă provizorie sau blocată.
create or replace function public.corecteaza_componenta_salariu(p_id uuid, p_motiv text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old  salarii_staff_componente;
  v_calc jsonb;
  v_c    jsonb;
begin
  if not is_owner() then
    raise exception 'Doar owner-ul poate corecta un salariu confirmat.' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_motiv, '')), '') is null then
    raise exception 'Motivul corecției e obligatoriu.' using errcode = '22023';
  end if;

  select * into v_old from salarii_staff_componente where id = p_id;
  if not found then
    raise exception 'Componenta nu există.' using errcode = 'P0002';
  end if;

  v_calc := _calcul_salariu_staff(v_old.user_id, v_old.post, v_old.anul, v_old.luna);
  select c into v_c from jsonb_array_elements(v_calc -> 'componente') c
   where c ->> 'cheie' = v_old.componenta;
  if v_c is null then
    raise exception 'Componenta „%" nu mai apare în calculul lunii.', v_old.eticheta using errcode = '22023';
  end if;
  if (v_c ->> 'blocant') is not null or coalesce((v_c ->> 'provizoriu')::boolean, false) then
    raise exception 'Componenta „%" e blocată sau provizorie acum; rezolv-o întâi.', v_old.eticheta
      using errcode = '22023';
  end if;

  insert into audit_log (actor_id, actor_role, entity_type, entity_id, action, old_value, new_value, reason)
  values (auth.uid(), auth_role(), 'salariu_staff', p_id, 'update',
          jsonb_build_object('suma', v_old.suma, 'detalii', v_old.detalii, 'reguli', v_old.reguli),
          jsonb_build_object('suma', (v_c ->> 'suma')::numeric), p_motiv);

  update salarii_staff_componente
     set suma = (v_c ->> 'suma')::numeric,
         detalii = v_c || jsonb_build_object('calcul', v_calc - 'reguli'),
         reguli = coalesce(v_calc -> 'reguli', '{}'::jsonb),
         stare = 'corectat',
         nota = concat_ws(' · ', nota, p_motiv)
   where id = p_id;

  return jsonb_build_object('suma_veche', v_old.suma, 'suma_noua', (v_c ->> 'suma')::numeric);
end;
$$;

revoke execute on function public.corecteaza_componenta_salariu(uuid, text) from anon, public;
grant execute on function public.corecteaza_componenta_salariu(uuid, text) to authenticated;
