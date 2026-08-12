-- Evaluări cursanți: runde („sesiuni") cu flux ciornă → verificare manager → trimitere.
--
-- Problema pe care o închide: `get_evaluari_client` publica evaluarea în portalul de
-- membri în secunda în care teacherul apăsa Salvează. Nimeni nu vedea textul înainte
-- de părinte. De acum evaluarea pleacă doar prin `stare = 'trimisa'`, iar acolo ajunge
-- exclusiv prin aprobarea managerului.
--
-- Cronologia unei runde (datele sunt per rundă, nu globale):
--   data_limita_teacher − zile_avans → se deschide, teacherii văd contorul
--   data_limita_teacher              → teacherii au terminat, începe verificarea
--   data_trimitere                   → pleacă spre părinți CE E APROBAT
--   data_inchidere                   → ce n-a fost aprobat expiră, runda moare
--
-- De ce `data_inchidere`: fără ea, o evaluare pe care managerul n-o aprobă niciodată
-- ține runda vie la infinit, iar cronul o revizitează zilnic pe veci.

-- ============================================================
-- 1) Runda
-- ============================================================
create table sesiuni_evaluare (
  id                  uuid primary key default gen_random_uuid(),
  sezon_id            uuid references sezoane(id) on delete set null,
  nume                text not null,
  data_limita_teacher date not null,
  data_trimitere      date not null,
  data_inchidere      date not null,
  -- Cu cât timp înainte de deadline-ul teacherilor pornește contorul lor.
  zile_avans          integer not null default 28 check (zile_avans > 0),
  stare               text not null default 'ciorna'
                      check (stare in ('ciorna','deschisa','verificare','trimisa','inchisa','anulata')),
  trimisa_la          timestamptz,
  inchisa_la          timestamptz,
  created             timestamptz not null default now(),
  updated             timestamptz not null default now(),
  check (data_trimitere >= data_limita_teacher),
  check (data_inchidere >= data_trimitere)
);
create index idx_sesiuni_evaluare_sezon on sesiuni_evaluare(sezon_id);
create index idx_sesiuni_evaluare_stare on sesiuni_evaluare(stare)
  where stare in ('ciorna','deschisa','verificare');

-- Grupele care intră în rundă = denominatorul contorului („X din Y evaluați").
create table sesiune_evaluare_grupe (
  sesiune_id uuid not null references sesiuni_evaluare(id) on delete cascade,
  curs_id    uuid not null references cursuri(id) on delete cascade,
  primary key (sesiune_id, curs_id)
);
create index idx_sesiune_grupe_curs on sesiune_evaluare_grupe(curs_id);

-- „Nu se aplică": teacherul scoate un cursant din denominator, cu motiv obligatoriu
-- (ex. înscris săptămâna trecută, n-are ce evalua).
create table evaluari_exceptii (
  id         uuid primary key default gen_random_uuid(),
  sesiune_id uuid not null references sesiuni_evaluare(id) on delete cascade,
  curs_id    uuid not null references cursuri(id) on delete cascade,
  client_id  uuid not null references clienti(id) on delete cascade,
  motiv      text not null check (btrim(motiv) <> ''),
  teacher_id uuid references teacheri(id) on delete set null,
  created    timestamptz not null default now(),
  unique (sesiune_id, curs_id, client_id)
);
create index idx_evaluari_exceptii_sesiune on evaluari_exceptii(sesiune_id);

-- ============================================================
-- 2) Starea pe evaluare
-- ============================================================
alter table evaluari
  add column if not exists sesiune_id       uuid references sesiuni_evaluare(id) on delete set null,
  add column if not exists stare            text not null default 'ciorna',
  add column if not exists motiv_respingere text,
  add column if not exists verificat_de     uuid references auth.users(id) on delete set null,
  add column if not exists verificat_la     timestamptz,
  add column if not exists trimis_la        timestamptz;

alter table evaluari drop constraint if exists evaluari_stare_check;
alter table evaluari add constraint evaluari_stare_check
  check (stare in ('ciorna','de_verificat','aprobata','respinsa','trimisa','expirata'));

create index if not exists idx_evaluari_sesiune_stare on evaluari(sesiune_id, stare);
-- Cronul caută exact asta: ce e aprobat și încă netrimis.
create index if not exists idx_evaluari_de_trimis on evaluari(sesiune_id)
  where stare = 'aprobata';

-- ============================================================
-- 3) Backfill — CRITIC
-- ============================================================
-- Evaluările existente sunt deja vizibile în portalul părinților. Dacă rămân pe
-- 'ciorna' (defaultul coloanei), poarta din migrația C le-ar face să dispară din
-- portal peste noapte. Le declarăm trimise, cu data lor reală.
do $$
declare v_sesiune uuid;
begin
  if exists (select 1 from evaluari where sesiune_id is null) then
    insert into sesiuni_evaluare (
      nume, data_limita_teacher, data_trimitere, data_inchidere,
      stare, trimisa_la, inchisa_la
    )
    values (
      format('Istoric (până la %s)', current_date),
      current_date, current_date, current_date,
      'inchisa', now(), now()
    )
    returning id into v_sesiune;

    update evaluari
    set sesiune_id = v_sesiune,
        stare      = 'trimisa',
        trimis_la  = coalesce(created, now())
    where sesiune_id is null;
  end if;
end $$;

-- ============================================================
-- 4) RLS
-- ============================================================
alter table sesiuni_evaluare      enable row level security;
alter table sesiune_evaluare_grupe enable row level security;
alter table evaluari_exceptii     enable row level security;

-- Runda și grupele ei: tot staff-ul le citește (teacherul are nevoie de date pentru
-- contor); scrierea e manager+.
create policy sesiuni_evaluare_select on sesiuni_evaluare
  for select to authenticated using (auth_role() <> 'parinte');
create policy sesiuni_evaluare_write on sesiuni_evaluare
  for all to authenticated
  using (is_admin() or is_manager()) with check (is_admin() or is_manager());

create policy sesiune_grupe_select on sesiune_evaluare_grupe
  for select to authenticated using (auth_role() <> 'parinte');
create policy sesiune_grupe_write on sesiune_evaluare_grupe
  for all to authenticated
  using (is_admin() or is_manager()) with check (is_admin() or is_manager());

-- Excepțiile: teacherul le scrie pentru grupele lui, managerul pentru locația lui.
create policy evaluari_exceptii_select on evaluari_exceptii
  for select to authenticated using (auth_role() <> 'parinte');
create policy evaluari_exceptii_admin on evaluari_exceptii
  for all to authenticated using (is_admin()) with check (is_admin());
create policy evaluari_exceptii_manager on evaluari_exceptii
  for all to authenticated
  using (is_manager() and evaluare_in_locatia_mea(curs_id))
  with check (is_manager() and evaluare_in_locatia_mea(curs_id));
create policy evaluari_exceptii_teacher on evaluari_exceptii
  for all to authenticated
  using (is_teacher() and exists (
    select 1 from cursuri c
    where c.id = evaluari_exceptii.curs_id
      and (c.teacher = current_teacher_id()
           or exists (select 1 from cursuri_teacheri ct
                      where ct.curs_id = c.id and ct.teacher_id = current_teacher_id()))
  ))
  with check (is_teacher() and exists (
    select 1 from cursuri c
    where c.id = evaluari_exceptii.curs_id
      and (c.teacher = current_teacher_id()
           or exists (select 1 from cursuri_teacheri ct
                      where ct.curs_id = c.id and ct.teacher_id = current_teacher_id()))
  ));

-- Gardul restrictiv pentru conturile de portal (regula din CLAUDE.md).
do $$
declare t text;
begin
  foreach t in array array['sesiuni_evaluare','sesiune_evaluare_grupe','evaluari_exceptii'] loop
    execute format('drop policy if exists deny_parinte_direct on public.%I', t);
    execute format(
      'create policy deny_parinte_direct on public.%I as restrictive for all to authenticated '
      || 'using (auth_role() <> %L) with check (auth_role() <> %L)',
      t, 'parinte', 'parinte'
    );
  end loop;
end $$;
