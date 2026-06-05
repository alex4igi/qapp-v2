-- Qapp v2 — Salarizare teacheri
-- 1. sezoane.activ (flag global, max 1 activ)
-- 2. Tabela snapshot salarii_teacher (lunar, imutabil după confirmare)
-- 3. RPC calculeaza_salariu_teacher (preview live, nu persistă)
-- 4. RPC confirma_salariu_teacher (admin: persistă snapshot)
-- 5. RLS: admin vede tot; teacher vede doar salariul lui; manager/frontdesk – nimic

-- ============================================================================
-- 1. SEZON ACTIV
-- ============================================================================

alter table sezoane add column if not exists activ boolean not null default false;

-- Max un sezon activ la un moment dat
create unique index if not exists sezoane_unique_activ
  on sezoane(activ) where activ = true;

-- ============================================================================
-- 2. TABELĂ SNAPSHOT SALARII
-- ============================================================================

create table if not exists salarii_teacher (
  id          uuid primary key default gen_random_uuid(),
  teacher     uuid not null references teacheri(id) on delete cascade,
  anul        smallint not null,
  luna        smallint not null check (luna between 1 and 12),
  total       numeric not null default 0,
  breakdown   jsonb not null default '[]'::jsonb,
  status      text not null default 'platit' check (status in ('platit')),
  data_plata  date,
  created     timestamptz not null default now(),
  updated     timestamptz not null default now(),
  unique (teacher, anul, luna)
);

create index if not exists idx_salarii_teacher_teacher on salarii_teacher(teacher);
create index if not exists idx_salarii_teacher_perioada on salarii_teacher(anul, luna);

-- ============================================================================
-- 3. RPC: CALCULEAZĂ SALARIU (preview live, nu persistă)
-- ============================================================================
--
-- Întoarce JSONB cu structura:
-- {
--   "teacher_id": "...",
--   "anul": 2026, "luna": 5,
--   "total": 3240,
--   "grupe": [
--     {
--       "curs_id": "...",
--       "curs_nume": "Hip Hop Tiny",
--       "tip": "recurent" | "facultativ" | "trupa",
--       "sedinte_per_sapt": 2,
--       "nr_unitati": 14,                -- cursanți (recurent) sau prezențe (facultativ)
--       "prag_unitati_min": 13,
--       "suma": 840,
--       "manual": false                  -- true pentru trupe (nu se calculează auto)
--     },
--     ...
--   ]
-- }
--
-- Reguli „cursant numărat" la curs RECURENT (cursuri.facultativ=false, nivelul != 'Trupa')
-- în luna X la grupa Y. Enrollment trebuie să fie activ=true, reziliat=false, și valid în luna X.
-- Apoi cursantul intră dacă oricare:
--   (A) cursant existent (enrollment.data_incepere < prima zi a lunii X) ȘI există incasări
--       pe enrollment cu data în luna X — adică „a plătit luna asta"
--   (B) >2 prezențe „Prezent" la enrollment în luna X
-- Cursant nou cu enrollment.data_incepere în luna X (prorata) NU intră prin (A); ar putea
-- intra prin (B) doar dacă efectiv vine >2 ori în luna asta — acceptabil.
--
-- Pentru curs FACULTATIV (facultativ=true): nr_unitati = total prezențe „Prezent"
-- ale tuturor cursanților în luna X la curs.
--
-- Pentru TRUPĂ (nivelul='Trupa'): manual=true, suma=0, nr_unitati=null. Calcul manual.

create or replace function calculeaza_salariu_teacher(
  p_teacher uuid,
  p_anul int,
  p_luna int
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_data_inc date := make_date(p_anul, p_luna, 1);
  v_data_fin date := (make_date(p_anul, p_luna, 1) + interval '1 month - 1 day')::date;
  v_grupe jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_curs record;
  v_sedinte int;
  v_nr_unitati int;
  v_prag_min int;
  v_suma numeric;
  v_tip text;
  v_manual boolean;
begin
  for v_curs in
    select c.id, c.numele, c.facultativ, c.nivelul, c.zile
    from cursuri c
    where c.teacher = p_teacher
      and c.suspendat = false
    order by c.numele
  loop
    v_sedinte := coalesce(array_length(v_curs.zile, 1), 0);
    v_manual := false;
    v_suma := 0;
    v_nr_unitati := null;
    v_prag_min := null;

    if v_curs.nivelul = 'Trupa' then
      -- Trupele: calcul manual, doar marcăm linia
      v_tip := 'trupa';
      v_manual := true;

    elsif v_curs.facultativ = true then
      -- FACULTATIV: număr de prezențe Prezent în luna X
      v_tip := 'facultativ';
      select count(*)::int into v_nr_unitati
      from prezente p
      join enrollments e on e.id = p.enrollment
      where e.cursul = v_curs.id
        and p.status = 'Prezent'
        and p.data between v_data_inc and v_data_fin;

      v_nr_unitati := coalesce(v_nr_unitati, 0);

      -- Praguri facultative
      if v_nr_unitati >= 250 then
        v_suma := 2000; v_prag_min := 250;
      elsif v_nr_unitati >= 160 then
        v_suma := 1280; v_prag_min := 160;
      elsif v_nr_unitati >= 120 then
        v_suma := 840; v_prag_min := 120;
      elsif v_nr_unitati >= 100 then
        v_suma := 600; v_prag_min := 100;
      elsif v_nr_unitati >= 80 then
        v_suma := 400; v_prag_min := 80;
      else
        v_suma := 0; v_prag_min := 0;
      end if;

    else
      -- RECURENT (non-trupă): număr cursanți după reguli (A) sau (B)
      v_tip := 'recurent';

      with eligibili as (
        select distinct e.client
        from enrollments e
        where e.cursul = v_curs.id
          and e.activ = true
          and e.reziliat = false
          and coalesce(e.data_incepere, '1900-01-01'::date) <= v_data_fin
          and (e.data_final is null or e.data_final >= v_data_inc)
          and (
            -- (A) cursant existent + a plătit în luna X
            (
              e.data_incepere is not null
              and e.data_incepere < v_data_inc
              and exists (
                select 1 from incasari i
                where i.inregistrare = e.id
                  and i.data between v_data_inc and v_data_fin
              )
            )
            or
            -- (B) >2 prezențe Prezent în luna X pe acest enrollment
            (
              select count(*) from prezente p
              where p.enrollment = e.id
                and p.status = 'Prezent'
                and p.data between v_data_inc and v_data_fin
            ) > 2
          )
      )
      select count(*)::int into v_nr_unitati from eligibili;
      v_nr_unitati := coalesce(v_nr_unitati, 0);

      -- Praguri recurente (2 ședințe/săpt); jumătate pentru 1 ședință/săpt
      if v_nr_unitati > 25 then
        v_suma := 2500; v_prag_min := 26;
      elsif v_nr_unitati >= 24 then
        v_suma := 2000; v_prag_min := 24;
      elsif v_nr_unitati >= 21 then
        v_suma := 1500; v_prag_min := 21;
      elsif v_nr_unitati >= 18 then
        v_suma := 1280; v_prag_min := 18;
      elsif v_nr_unitati >= 16 then
        v_suma := 1000; v_prag_min := 16;
      elsif v_nr_unitati >= 13 then
        v_suma := 840; v_prag_min := 13;
      elsif v_nr_unitati >= 10 then
        v_suma := 600; v_prag_min := 10;
      else
        v_suma := 400; v_prag_min := 0;
      end if;

      -- Ajustare 1 ședință/săpt → jumătate
      if v_sedinte = 1 then
        v_suma := v_suma / 2;
      end if;
    end if;

    v_grupe := v_grupe || jsonb_build_object(
      'curs_id', v_curs.id,
      'curs_nume', v_curs.numele,
      'tip', v_tip,
      'sedinte_per_sapt', v_sedinte,
      'nr_unitati', v_nr_unitati,
      'prag_unitati_min', v_prag_min,
      'suma', v_suma,
      'manual', v_manual
    );

    v_total := v_total + coalesce(v_suma, 0);
  end loop;

  return jsonb_build_object(
    'teacher_id', p_teacher,
    'anul', p_anul,
    'luna', p_luna,
    'total', v_total,
    'grupe', v_grupe
  );
end;
$$;

-- ============================================================================
-- 4. RPC: CONFIRMĂ SALARIU (admin, persistă snapshot)
-- ============================================================================

create or replace function confirma_salariu_teacher(
  p_teacher uuid,
  p_anul int,
  p_luna int,
  p_data_plata date default current_date
) returns salarii_teacher
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(auth.jwt() ->> 'role', auth.jwt() -> 'app_metadata' ->> 'role', '');
  v_calc jsonb;
  v_row salarii_teacher;
begin
  if v_role <> 'admin' then
    raise exception 'Doar adminul poate confirma salarii' using errcode = '42501';
  end if;

  v_calc := calculeaza_salariu_teacher(p_teacher, p_anul, p_luna);

  insert into salarii_teacher (teacher, anul, luna, total, breakdown, status, data_plata)
  values (
    p_teacher, p_anul, p_luna,
    (v_calc ->> 'total')::numeric,
    v_calc -> 'grupe',
    'platit',
    p_data_plata
  )
  on conflict (teacher, anul, luna) do update
    set total = excluded.total,
        breakdown = excluded.breakdown,
        data_plata = excluded.data_plata,
        updated = now()
  returning * into v_row;

  return v_row;
end;
$$;

-- ============================================================================
-- 5. RLS pe salarii_teacher
-- ============================================================================

alter table salarii_teacher enable row level security;

-- Helper: e admin?
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    auth.jwt() ->> 'role' = 'admin',
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin',
    false
  );
$$;

-- Helper: e teacher (cu cont)? întoarce teacher_id sau null
create or replace function my_teacher_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from teacheri where auth_user_id = auth.uid() limit 1;
$$;

-- Admin: full access
drop policy if exists salarii_teacher_admin_all on salarii_teacher;
create policy salarii_teacher_admin_all on salarii_teacher
  for all
  using (is_admin())
  with check (is_admin());

-- Teacher: SELECT doar pentru propriile salarii
drop policy if exists salarii_teacher_self_select on salarii_teacher;
create policy salarii_teacher_self_select on salarii_teacher
  for select
  using (teacher = my_teacher_id());

-- Permisiuni RPC
grant execute on function calculeaza_salariu_teacher(uuid, int, int) to authenticated;
grant execute on function confirma_salariu_teacher(uuid, int, int, date) to authenticated;
grant execute on function is_admin() to authenticated;
grant execute on function my_teacher_id() to authenticated;
