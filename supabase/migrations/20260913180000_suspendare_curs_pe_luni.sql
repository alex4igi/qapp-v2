-- Suspendarea unui curs capătă o LUNĂ de la care se aplică.
--
-- Până acum suspendarea era un singur boolean, `cursuri.suspendat`, citit „acum".
-- `calculeaza_salariu_teacher` filtra `c.suspendat = false` fără nicio legătură cu
-- luna calculată — deci o suspendare dată azi scotea grupa și din salariile lunilor
-- deja lucrate și plătite, retroactiv și tăcut. Aceeași capcană ca la mutarea unei
-- grupe între sezoane (20260828210000).
--
-- Regula cerută de owner: ce s-a lucrat și s-a plătit rămâne; luna DIN CARE se
-- suspendă și cele de după nu se plătesc, indiferent câte ședințe au apucat să fie
-- ținute în ea (fără prorata — decizie explicită).
--
-- Model: intervale [din_luna, pana_luna), granularitate LUNĂ. Un tabel, nu două
-- coloane pe `cursuri`, pentru că o grupă poate fi oprită și repornită de mai multe
-- ori, iar fiecare pauză trebuie să rămână în istorie ca să nu se rescrie lunile
-- vechi la a doua suspendare.
--
-- `cursuri.suspendat` RĂMÂNE, dar devine cache pentru „e suspendat în luna curentă":
-- ~15 consumatori care întreabă despre ACUM (agenda zilei, dropdown de programare
-- lead, ofertă publică, fișe incomplete) rămân neatinși. Cache-ul e întreținut de
-- RPC la fiecare schimbare și de un cron nocturn, pentru suspendările/re-activările
-- programate în luni viitoare.

-- ============================================================
-- 1. Intervalele de suspendare
-- ============================================================
create table if not exists cursuri_suspendari (
  id               uuid primary key default gen_random_uuid(),
  curs             uuid not null references cursuri(id) on delete cascade,
  din_luna         date not null,
  pana_luna        date,
  motiv            text not null,
  motiv_reactivare text,
  suspendat_de     uuid references auth.users(id) on delete set null,
  suspendat_la     timestamptz not null default now(),
  reactivat_de     uuid references auth.users(id) on delete set null,
  reactivat_la     timestamptz,
  constraint cursuri_suspendari_din_ziua1
    check (din_luna = date_trunc('month', din_luna)::date),
  constraint cursuri_suspendari_pana_ziua1
    check (pana_luna is null or pana_luna = date_trunc('month', pana_luna)::date),
  constraint cursuri_suspendari_interval
    check (pana_luna is null or pana_luna > din_luna)
);

comment on column cursuri_suspendari.din_luna is
  'Ziua 1 a primei luni NEPLĂTITE. Inclusiv.';
comment on column cursuri_suspendari.pana_luna is
  'Ziua 1 a lunii în care grupa repornește. EXCLUSIV. NULL = suspendare fără termen.';

-- O singură suspendare deschisă per curs: a doua ar face ambigue și flagul, și
-- răspunsul lui curs_activ_in_luna.
create unique index if not exists cursuri_suspendari_deschisa_unica
  on cursuri_suspendari (curs) where pana_luna is null;

create index if not exists cursuri_suspendari_curs_idx
  on cursuri_suspendari (curs, din_luna desc);

alter table cursuri_suspendari enable row level security;

-- Gardurile evaluează `(select auth_role())`, nu `auth_role()`: altfel rolul se
-- recalculează pe fiecare rând (vezi 20260912200000).
create policy cursuri_suspendari_select on cursuri_suspendari
  for select to authenticated using (true);

create policy cursuri_suspendari_write on cursuri_suspendari
  for all to authenticated
  using ((select auth_role()) in ('owner', 'admin', 'manager'))
  with check ((select auth_role()) in ('owner', 'admin', 'manager'));

-- Gard `parinte` (CLAUDE.md: obligatoriu la orice tabel nou).
create policy deny_parinte_direct on cursuri_suspendari
  as restrictive for all to authenticated
  using ((select auth_role()) <> 'parinte')
  with check ((select auth_role()) <> 'parinte');

-- Gard `marketing` — decizie explicită: deny total. Agenția de ads n-are nevoie
-- să știe ce grupe sunt oprite și de ce.
create policy deny_marketing_direct on cursuri_suspendari
  as restrictive for all to authenticated
  using ((select auth_role()) <> 'marketing')
  with check ((select auth_role()) <> 'marketing');

-- ============================================================
-- 2. Întrebarea canonică: grupa era activă în luna X?
-- ============================================================
create or replace function curs_activ_in_luna(p_curs uuid, p_luna date)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select not exists (
    select 1
    from cursuri_suspendari s
    where s.curs = p_curs
      and date_trunc('month', p_luna)::date >= s.din_luna
      and (s.pana_luna is null or date_trunc('month', p_luna)::date < s.pana_luna)
  );
$$;

comment on function curs_activ_in_luna(uuid, date) is
  'Sursa de adevăr pentru „grupa se plătește în luna asta?". Salariul o întreabă pe ea, nu flagul cursuri.suspendat.';

revoke execute on function curs_activ_in_luna(uuid, date) from anon, public;
grant execute on function curs_activ_in_luna(uuid, date) to authenticated;

-- ============================================================
-- 3. Cache-ul „suspendat ACUM" + cronul care-l ține la zi
-- ============================================================
create or replace function sync_cursuri_suspendat()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_luna date := date_trunc('month', current_date)::date;
  v_n int;
begin
  with recalc as (
    update cursuri c
       set suspendat = not curs_activ_in_luna(c.id, v_luna),
           updated = now()
     where c.suspendat is distinct from (not curs_activ_in_luna(c.id, v_luna))
    returning 1
  )
  select count(*) into v_n from recalc;
  return v_n;
end;
$$;

revoke execute on function sync_cursuri_suspendat() from anon, public;

-- Nocturn: mută flagul când intrăm în luna unei suspendări/re-activări programate.
select cron.unschedule('sync-cursuri-suspendat')
where exists (select 1 from cron.job where jobname = 'sync-cursuri-suspendat');

select cron.schedule(
  'sync-cursuri-suspendat',
  '10 0 * * *',
  $$select sync_cursuri_suspendat();$$
);

-- ============================================================
-- 4. RPC-ul de suspendare / re-activare
-- ============================================================
-- Intervalul, flagul și audit_log-ul se scriu într-o singură tranzacție: altfel
-- o cădere între ele lasă grupa suspendată fără urmă de ce și din ce lună.
create or replace function set_curs_suspendare(
  p_curs     uuid,
  p_suspenda boolean,
  p_din_luna date,
  p_motiv    text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_luna     date := date_trunc('month', p_din_luna)::date;
  v_acum     date := date_trunc('month', current_date)::date;
  v_deschisa cursuri_suspendari;
  v_curs     cursuri;
  v_locatie  uuid;
  v_motiv    text := nullif(btrim(coalesce(p_motiv, '')), '');
begin
  if (select auth_role()) not in ('owner', 'admin', 'manager') then
    raise exception 'Doar managerii pot suspenda sau re-activa cursuri.'
      using errcode = '42501';
  end if;

  select * into v_curs from cursuri where id = p_curs;
  if not found then
    raise exception 'Cursul nu există.' using errcode = 'QD404';
  end if;

  select * into v_deschisa
  from cursuri_suspendari
  where curs = p_curs and pana_luna is null;

  if p_suspenda then
    if v_motiv is null then
      raise exception 'Motivul e obligatoriu la suspendare.' using errcode = 'QD400';
    end if;
    if found then
      raise exception 'Cursul e deja suspendat din %.',
        to_char(v_deschisa.din_luna, 'YYYY-MM') using errcode = 'QD409';
    end if;
    insert into cursuri_suspendari (curs, din_luna, motiv, suspendat_de)
    values (p_curs, v_luna, v_motiv, auth.uid());
  else
    if not found then
      raise exception 'Cursul nu e suspendat.' using errcode = 'QD409';
    end if;
    -- Re-activarea din luna suspendării (sau dinainte) ar anula suspendarea, nu ar
    -- încheia-o: intervalul ar fi gol sau negativ.
    if v_luna <= v_deschisa.din_luna then
      raise exception 'Re-activarea trebuie să fie dintr-o lună de după suspendare (%).',
        to_char(v_deschisa.din_luna, 'YYYY-MM') using errcode = 'QD400';
    end if;
    update cursuri_suspendari
       set pana_luna = v_luna,
           motiv_reactivare = v_motiv,
           reactivat_de = auth.uid(),
           reactivat_la = now()
     where id = v_deschisa.id;
  end if;

  -- Flagul urmărește LUNA CURENTĂ, nu luna aleasă: o suspendare programată din
  -- noiembrie lasă grupa activă până atunci (cronul o preia la 1 noiembrie).
  update cursuri
     set suspendat = not curs_activ_in_luna(p_curs, v_acum),
         updated = now()
   where id = p_curs;

  if v_curs.sala is not null then
    select locatie into v_locatie from sali where id = v_curs.sala;
  end if;
  v_locatie := coalesce(v_curs.locatie, v_locatie);

  perform audit_log_record(
    'curs_archived',
    'curs',
    p_curs,
    jsonb_build_object('suspendat', v_curs.suspendat),
    jsonb_build_object(
      'suspendat', p_suspenda,
      'din_luna', to_char(v_luna, 'YYYY-MM')
    ),
    coalesce(v_motiv, case when p_suspenda then null else 'Re-activat' end),
    v_locatie
  );
end;
$$;

revoke execute on function set_curs_suspendare(uuid, boolean, date, text) from anon, public;
grant execute on function set_curs_suspendare(uuid, boolean, date, text) to authenticated;

-- ============================================================
-- 5. Backfill pentru cele suspendate deja
-- ============================================================
-- Cele 3 grupe suspendate azi n-au lună de suspendare nicăieri: două au fost oprite
-- din bifa brută (fără audit), a treia are o urmă în audit_log din iulie. Backfill
-- CONSERVATOR — luna creării cursului — ca să nu se miște nimic în lunile trecute:
-- ele sunt excluse din salarii de când sunt suspendate și rămân excluse. Dacă luna
-- reală contează, se corectează din UI (re-activare + suspendare din luna bună).
insert into cursuri_suspendari (curs, din_luna, motiv, suspendat_la)
select c.id,
       date_trunc('month', coalesce(c.created, now()))::date,
       'Backfill 2026-09-13: suspendat înainte ca suspendarea să aibă lună.',
       coalesce(c.created, now())
from cursuri c
where c.suspendat = true
  and not exists (
    select 1 from cursuri_suspendari s where s.curs = c.id and s.pana_luna is null
  );

-- ============================================================
-- 6. Salariul întreabă luna, nu flagul
-- ============================================================
-- Singura schimbare față de 20260828211000: filtrul pe grupe. `c.suspendat = false`
-- (starea de ACUM) devine `curs_activ_in_luna(c.id, v_data_inc)` (starea din LUNA
-- calculată). Restul funcției — garda de acces, praguri, regula 90%, modelul per
-- teacher, plasa de siguranță pentru cursurile etichetate pe alt sezon — e neatins.
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
  v_sezon uuid;
  v_model text;
  v_grupe jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_total_prezente int := 0;
  v_curs record;
  v_sedinte int;
  v_nr_cursanti int;
  v_nr_prezente int;
  v_suma_client numeric;
  v_prag_client int;
  v_suma_prezente numeric;
  v_prag_prezente int;
  v_suma numeric;
  v_nr_unitati int;
  v_prag_min int;
  v_tip text;
  v_manual boolean;
begin
  -- Gard de acces: salariul se poate calcula fie de admin/owner (tabul din profilul
  -- instructorului), fie de instructorul insusi (pagina „Salariul meu"). Fara asta
  -- orice cont `authenticated` — front_desk sau alt teacher — putea cere salariul
  -- oricui, doar cu id-ul din `teacheri`: UI-ul garda tabul, DB-ul nu garda nimic.
  -- `service_role` ramane permis: cheia de serviciu e oricum god-mode (citeste direct
  -- `salarii_teacher`), iar scripturile de verificare din scripts/ o folosesc.
  if not (
    is_admin()
    -- coalesce obligatoriu: `my_teacher_id()` e NULL pentru conturile fara profil
    -- (front_desk, staff nelegat), iar `p_teacher = NULL` da NULL, nu false. Fara
    -- coalesce intreaga conditie devine NULL, `if not NULL` nu se aprinde si garda
    -- se deschide exact pentru cine n-are profil. Prins de testul din 2026-07-22.
    or coalesce(p_teacher = my_teacher_id(), false)
    or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
  ) then
    raise exception 'Nu ai acces la salariul acestui instructor'
      using errcode = '42501';
  end if;
  select model_salariu into v_model from teacheri where id = p_teacher;

  -- Sezonul care deține luna (prima zi a lunii cade în fereastra lui)
  select id into v_sezon
  from sezoane
  where v_data_inc between data_incepere and data_final
  order by data_incepere desc
  limit 1;

  -- Luna cade în pauza dintre sezoane (ex. 1–11 sept. 2026): ia sezonul care se
  -- suprapune cu luna, cel mai recent început. Fără asta luna iese fără nicio grupă.
  if v_sezon is null then
    select id into v_sezon
    from sezoane
    where data_incepere <= v_data_fin
      and data_final >= v_data_inc
    order by data_incepere desc
    limit 1;
  end if;

  for v_curs in
    select c.id, c.numele, c.facultativ, c.nivelul, c.zile
    from cursuri c
    where c.teacher = p_teacher
      and curs_activ_in_luna(c.id, v_data_inc)
      and (
        c.sezon = v_sezon
        or (
          -- Plasă de siguranță pentru cursurile mutate din greșeală între sezoane:
          -- predate efectiv în luna asta, dar etichetate pe un sezon care nici măcar
          -- nu atinge luna. Vezi antetul migrației.
          c.sezon is not null
          and exists (
            select 1
            from prezente p
            join enrollments e on e.id = p.enrollment
            where e.cursul = c.id
              and p.status = 'Prezent'
              and p.data between v_data_inc and v_data_fin
          )
          and not exists (
            select 1
            from sezoane s
            where s.id = c.sezon
              and s.data_incepere <= v_data_fin
              and s.data_final >= v_data_inc
          )
        )
      )
    order by c.numele
  loop
    v_sedinte := coalesce(array_length(v_curs.zile, 1), 0);

    select count(*)::int into v_nr_prezente
    from prezente p
    join enrollments e on e.id = p.enrollment
    where e.cursul = v_curs.id
      and p.status = 'Prezent'
      and p.data between v_data_inc and v_data_fin;
    v_nr_prezente := coalesce(v_nr_prezente, 0);

    with eligibili as (
      select distinct e.client
      from enrollments e
      where e.cursul = v_curs.id
        and e.reziliat = false
        and coalesce(e.data_incepere, '1900-01-01'::date) <= v_data_fin
        and (e.data_final is null or e.data_final >= v_data_inc)
        and (
          (
            e.data_incepere is not null
            and e.data_incepere < v_data_inc
            and coalesce(e.suma, 0) > 0
            and (
              select coalesce(sum(i.suma), 0)
              from incasari i
              where i.inregistrare = e.id
                and i.data between v_data_inc and v_data_fin
            ) >= 0.9 * (
              coalesce(e.suma, 0) / greatest(1,
                (extract(year from coalesce(e.data_final, e.data_incepere))::int * 12
                   + extract(month from coalesce(e.data_final, e.data_incepere))::int)
                - (extract(year from e.data_incepere)::int * 12
                   + extract(month from e.data_incepere)::int) + 1
              )
            )
          )
          or
          (
            select count(*) from prezente p
            where p.enrollment = e.id
              and p.status = 'Prezent'
              and p.data between v_data_inc and v_data_fin
          ) > 2
        )
    )
    select count(*)::int into v_nr_cursanti from eligibili;
    v_nr_cursanti := coalesce(v_nr_cursanti, 0);

    if v_nr_cursanti = 0 then v_suma_client := 0; v_prag_client := 0;
    elsif v_nr_cursanti >= 25 then v_suma_client := 2000; v_prag_client := 25;
    elsif v_nr_cursanti >= 23 then v_suma_client := 1500; v_prag_client := 23;
    elsif v_nr_cursanti >= 20 then v_suma_client := 1280; v_prag_client := 20;
    elsif v_nr_cursanti >= 17 then v_suma_client := 1000; v_prag_client := 17;
    elsif v_nr_cursanti >= 15 then v_suma_client := 840;  v_prag_client := 15;
    elsif v_nr_cursanti >= 12 then v_suma_client := 600;  v_prag_client := 12;
    elsif v_nr_cursanti >= 10 then v_suma_client := 400;  v_prag_client := 10;
    else v_suma_client := 400; v_prag_client := 1;
    end if;
    if v_sedinte = 1 then
      v_suma_client := v_suma_client / 2;
    end if;

    if v_nr_prezente >= 275 then v_suma_prezente := 2250; v_prag_prezente := 275;
    elsif v_nr_prezente >= 250 then v_suma_prezente := 2000; v_prag_prezente := 250;
    elsif v_nr_prezente >= 200 then v_suma_prezente := 1500; v_prag_prezente := 200;
    elsif v_nr_prezente >= 160 then v_suma_prezente := 1280; v_prag_prezente := 160;
    elsif v_nr_prezente >= 140 then v_suma_prezente := 1000; v_prag_prezente := 140;
    elsif v_nr_prezente >= 120 then v_suma_prezente := 840;  v_prag_prezente := 120;
    elsif v_nr_prezente >= 100 then v_suma_prezente := 600;  v_prag_prezente := 100;
    elsif v_nr_prezente >= 80  then v_suma_prezente := 400;  v_prag_prezente := 80;
    else v_suma_prezente := 0; v_prag_prezente := 0;
    end if;

    v_manual := false;
    if v_curs.nivelul = 'Trupa' then
      v_tip := 'trupa'; v_manual := true; v_suma := 0;
      v_nr_unitati := null; v_prag_min := null;
    elsif v_model = 'per_client'
       or (v_model is null and v_curs.facultativ = false) then
      v_tip := 'recurent'; v_suma := v_suma_client;
      v_nr_unitati := v_nr_cursanti; v_prag_min := v_prag_client;
    else
      v_tip := 'facultativ'; v_suma := v_suma_prezente;
      v_nr_unitati := v_nr_prezente; v_prag_min := v_prag_prezente;
    end if;

    v_grupe := v_grupe || jsonb_build_object(
      'curs_id', v_curs.id,
      'curs_nume', v_curs.numele,
      'tip', v_tip,
      'sedinte_per_sapt', v_sedinte,
      'nr_unitati', v_nr_unitati,
      'prag_unitati_min', v_prag_min,
      'suma', v_suma,
      'manual', v_manual,
      'nr_cursanti', v_nr_cursanti,
      'nr_prezente', v_nr_prezente,
      'suma_per_client', v_suma_client,
      'prag_client_min', v_prag_client,
      'suma_per_prezente', v_suma_prezente,
      'prag_prezente_min', v_prag_prezente
    );

    v_total := v_total + coalesce(v_suma, 0);
    v_total_prezente := v_total_prezente + v_nr_prezente;
  end loop;

  return jsonb_build_object(
    'teacher_id', p_teacher,
    'anul', p_anul,
    'luna', p_luna,
    'total', v_total,
    'total_prezente', v_total_prezente,
    'model_salariu', v_model,
    'sezon_id', v_sezon,
    'grupe', v_grupe
  );
end;
$$;

grant execute on function calculeaza_salariu_teacher(uuid, int, int) to authenticated;

revoke execute on function calculeaza_salariu_teacher(uuid, int, int) from anon, public;
