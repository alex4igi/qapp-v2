-- Programe metodologice: standardul de predare al sezonului, asociat cursurilor.
--
-- Model în 3 straturi, în ordinea dependenței:
--   1) sezon_calendar        — modulele + vacanțele sezonului CU DATE (fundația)
--   2) programe_metodologice — biblioteca de programe standard (nivel × vârstă × ritm),
--      cu program_module (tema per modul) + program_lectii (ședințele numerotate continuu)
--   3) cursuri.program_metodologic — asocierea; mai multe grupe partajează un program
--
-- Adaptarea teacherului NU atinge standardul: curs_lectii_override suprascrie
-- titlul/notele unei lecții doar pentru grupa lui. Jurnalul (program_jurnal)
-- înregistrează per ședință dacă s-a predat conform planului.
--
-- Numerotarea ședințelor e CONTINUĂ pe sezon și se mapează pe „a N-a ședință ținută"
-- (distinct (cursul, data) din prezente), nu pe dată calendaristică — grupele care
-- pierd o ședință rămân aliniate cu programul.
--
-- Ancorarea sezonului e pe `sezon_eticheta` text ('2026-2027'), nu pe sezoane.id:
-- structura se pregătește ÎNAINTE ca sezonul să existe în DB (rândul apare abia la
-- clonarea de sezon). `sezon_id` se completează ulterior, când există.

-- ============================================================
-- 1) Calendarul sezonului — fundația
-- ============================================================
-- Modulele și vacanțele sunt comune tuturor programelor unui sezon (verificat pe
-- xlsx-urile 2026-2027: intervale identice în toate cele 26 de grupe). Datele sunt
-- nullable ca duplicarea pe un sezon nou să producă o ciornă de completat.
create table sezon_calendar (
  id             uuid primary key default gen_random_uuid(),
  sezon_eticheta text not null,
  sezon_id       uuid references sezoane(id) on delete set null,
  tip            text not null check (tip in ('modul', 'vacanta')),
  numar          integer not null check (numar > 0),
  nume           text,
  nota           text,
  data_incepere  date,
  data_final     date,
  created        timestamptz not null default now(),
  updated        timestamptz not null default now(),
  unique (sezon_eticheta, tip, numar),
  check (data_final is null or data_incepere is null or data_final >= data_incepere)
);
create index idx_sezon_calendar_eticheta on sezon_calendar(sezon_eticheta);

-- ============================================================
-- 2) Programele standard
-- ============================================================
-- `stare`: 'ciorna' = în lucru (nu se poate asocia la cursuri), 'activ' = utilizabil.
-- `surse` = proveniența la import (fișier/sheet/etichetă grupă), pur informativ.
create table programe_metodologice (
  id                   uuid primary key default gen_random_uuid(),
  nume                 text not null,
  sezon_eticheta       text not null,
  sezon_id             uuid references sezoane(id) on delete set null,
  nivel_eticheta       text,
  sedinte_pe_saptamana integer not null default 2 check (sedinte_pe_saptamana > 0),
  descriere            text,
  stare                text not null default 'ciorna' check (stare in ('ciorna', 'activ')),
  surse                jsonb not null default '[]'::jsonb,
  created              timestamptz not null default now(),
  updated              timestamptz not null default now()
);
create index idx_programe_sezon on programe_metodologice(sezon_eticheta);

-- Tema modulului, per program. `numar` face legătura cu sezon_calendar(tip='modul').
create table program_module (
  id         uuid primary key default gen_random_uuid(),
  program_id uuid not null references programe_metodologice(id) on delete cascade,
  numar      integer not null check (numar > 0),
  tema       text,
  subtitlu   text,
  unique (program_id, numar)
);
create index idx_program_module_program on program_module(program_id);

-- Ședințele. Totalul = numărul de rânduri (nimic hardcodat: alt sezon poate avea
-- alt număr de ședințe).
create table program_lectii (
  id         uuid primary key default gen_random_uuid(),
  program_id uuid not null references programe_metodologice(id) on delete cascade,
  modul_id   uuid not null references program_module(id) on delete cascade,
  nr_sedinta integer not null check (nr_sedinta > 0),
  titlu      text not null,
  note       text,
  tip        text not null default 'lectie' check (tip in ('lectie', 'spectacol', 'concurs')),
  created    timestamptz not null default now(),
  updated    timestamptz not null default now(),
  unique (program_id, nr_sedinta)
);
create index idx_program_lectii_program on program_lectii(program_id, nr_sedinta);

-- ============================================================
-- 3) Asocierea la curs
-- ============================================================
-- Numele coloanei evită confuzia cu `program.ts` din frontend (= orarul săptămânal).
alter table cursuri
  add column program_metodologic uuid references programe_metodologice(id) on delete set null;
create index idx_cursuri_program_metodologic
  on cursuri(program_metodologic) where program_metodologic is not null;

-- ============================================================
-- 4) Adaptarea per grupă (teacherul „modifică liber", standardul rămâne intact)
-- ============================================================
-- titlu/note NULL = moștenește din standard pentru câmpul respectiv.
create table curs_lectii_override (
  id         uuid primary key default gen_random_uuid(),
  curs_id    uuid not null references cursuri(id) on delete cascade,
  nr_sedinta integer not null check (nr_sedinta > 0),
  titlu      text,
  note       text,
  updated_by uuid references teacheri(id) on delete set null,
  updated    timestamptz not null default now(),
  unique (curs_id, nr_sedinta),
  check (titlu is not null or note is not null)
);
create index idx_curs_lectii_override_curs on curs_lectii_override(curs_id);

-- ============================================================
-- 5) Jurnalul de predare (auditul)
-- ============================================================
-- O confirmare per (grupă, zi). `nr_sedinta` e snapshot: dacă se corectează prezențe
-- retroactiv și N-ul se mută, jurnalul păstrează ce a raportat teacherul atunci.
create table program_jurnal (
  id         uuid primary key default gen_random_uuid(),
  curs_id    uuid not null references cursuri(id) on delete cascade,
  data       date not null,
  nr_sedinta integer not null check (nr_sedinta > 0),
  lectie_id  uuid references program_lectii(id) on delete set null,
  status     text not null check (status in ('conform', 'diferit')),
  nota       text,
  teacher_id uuid references teacheri(id) on delete set null,
  created    timestamptz not null default now(),
  updated    timestamptz not null default now(),
  unique (curs_id, data),
  check (status = 'conform' or nota is not null)
);
create index idx_program_jurnal_curs on program_jurnal(curs_id, data);

-- ============================================================
-- 6) Condiționări server-side: calendarul e fundația
-- ============================================================
-- Un program nu poate deveni 'activ' fără calendarul sezonului completat, iar
-- modulele lui trebuie să existe în calendar. UI-ul explică; DB-ul garantează.
create or replace function _program_activ_cere_calendar()
returns trigger
language plpgsql
as $$
declare
  v_module_cu_date integer;
  v_modul_lipsa    integer;
begin
  if new.stare <> 'activ' then
    return new;
  end if;

  select count(*) into v_module_cu_date
  from sezon_calendar sc
  where sc.sezon_eticheta = new.sezon_eticheta
    and sc.tip = 'modul'
    and sc.data_incepere is not null
    and sc.data_final is not null;

  if v_module_cu_date = 0 then
    raise exception 'Stabilește întâi calendarul sezonului % (module cu date de început și sfârșit)', new.sezon_eticheta
      using errcode = 'check_violation';
  end if;

  select count(*) into v_modul_lipsa
  from program_module pm
  where pm.program_id = new.id
    and not exists (
      select 1 from sezon_calendar sc
      where sc.sezon_eticheta = new.sezon_eticheta
        and sc.tip = 'modul'
        and sc.numar = pm.numar
        and sc.data_incepere is not null
        and sc.data_final is not null
    );

  if v_modul_lipsa > 0 then
    raise exception '% modul(e) din program nu au corespondent cu date în calendarul sezonului %', v_modul_lipsa, new.sezon_eticheta
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger trg_program_activ_cere_calendar
  before insert or update of stare on programe_metodologice
  for each row execute function _program_activ_cere_calendar();

-- Un curs nu poate fi legat de un program-ciornă.
create or replace function _curs_program_trebuie_activ()
returns trigger
language plpgsql
as $$
declare v_stare text;
begin
  if new.program_metodologic is null then
    return new;
  end if;

  select stare into v_stare
  from programe_metodologice
  where id = new.program_metodologic;

  if v_stare is distinct from 'activ' then
    raise exception 'Programul metodologic este în ciornă — activează-l înainte de a-l asocia unui curs'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger trg_curs_program_trebuie_activ
  before insert or update of program_metodologic on cursuri
  for each row execute function _curs_program_trebuie_activ();

-- ============================================================
-- 7) RLS
-- ============================================================
alter table sezon_calendar        enable row level security;
alter table programe_metodologice enable row level security;
alter table program_module        enable row level security;
alter table program_lectii        enable row level security;
alter table curs_lectii_override  enable row level security;
alter table program_jurnal        enable row level security;

-- READ: tot staff-ul autentificat (teacherii au nevoie de program).
create policy sezon_calendar_select on sezon_calendar
  for select to authenticated using (true);
create policy programe_select on programe_metodologice
  for select to authenticated using (true);
create policy program_module_select on program_module
  for select to authenticated using (true);
create policy program_lectii_select on program_lectii
  for select to authenticated using (true);
create policy curs_lectii_override_select on curs_lectii_override
  for select to authenticated using (true);
create policy program_jurnal_select on program_jurnal
  for select to authenticated using (true);

-- WRITE pe standard: doar management. Teacherul adaptează, nu rescrie standardul.
create policy sezon_calendar_write on sezon_calendar
  for all to authenticated
  using (auth_role() in ('admin', 'owner', 'manager'))
  with check (auth_role() in ('admin', 'owner', 'manager'));
create policy programe_write on programe_metodologice
  for all to authenticated
  using (auth_role() in ('admin', 'owner', 'manager'))
  with check (auth_role() in ('admin', 'owner', 'manager'));
create policy program_module_write on program_module
  for all to authenticated
  using (auth_role() in ('admin', 'owner', 'manager'))
  with check (auth_role() in ('admin', 'owner', 'manager'));
create policy program_lectii_write on program_lectii
  for all to authenticated
  using (auth_role() in ('admin', 'owner', 'manager'))
  with check (auth_role() in ('admin', 'owner', 'manager'));

-- Adaptări + jurnal: management peste tot, teacherul DOAR pe grupele lui.
create policy curs_lectii_override_management on curs_lectii_override
  for all to authenticated
  using (auth_role() in ('admin', 'owner', 'manager'))
  with check (auth_role() in ('admin', 'owner', 'manager'));
create policy curs_lectii_override_teacher on curs_lectii_override
  for all to authenticated
  using (is_teacher() and teacher_can_access_curs(curs_id))
  with check (is_teacher() and teacher_can_access_curs(curs_id));

create policy program_jurnal_management on program_jurnal
  for all to authenticated
  using (auth_role() in ('admin', 'owner', 'manager'))
  with check (auth_role() in ('admin', 'owner', 'manager'));
-- Teacherul scrie și corectează jurnalul grupelor lui, dar nu-l poate șterge
-- (DELETE nu e acoperit: policy separată pe insert/update).
create policy program_jurnal_teacher_insert on program_jurnal
  for insert to authenticated
  with check (is_teacher() and teacher_can_access_curs(curs_id));
create policy program_jurnal_teacher_update on program_jurnal
  for update to authenticated
  using (is_teacher() and teacher_can_access_curs(curs_id))
  with check (is_teacher() and teacher_can_access_curs(curs_id));

-- Gardul portal (conturile `parinte` accesează exclusiv prin RPC definer).
do $$
declare t text;
begin
  foreach t in array array[
    'sezon_calendar', 'programe_metodologice', 'program_module',
    'program_lectii', 'curs_lectii_override', 'program_jurnal'
  ] loop
    execute format(
      'create policy deny_parinte_direct on public.%I as restrictive for all to authenticated '
      || 'using (auth_role() <> %L) with check (auth_role() <> %L)',
      t, 'parinte', 'parinte'
    );
  end loop;
end $$;

-- ============================================================
-- 8) RPC-uri
-- ============================================================
-- Nucleul comun: a câta ședință ținută e `p_data` pentru grupă.
-- Ședință ținută = zi distinctă cu cel puțin o prezență pe grupă (același criteriu
-- ca get_absente_consecutive), numărată de la începutul primului modul cu date al
-- sezonului programului. N = (zile distincte STRICT înainte de p_data) + 1, ca
-- numărul să nu se schimbe în timp ce se pontează prezența zilei curente.
create or replace function _nr_sedinta_pentru(p_curs uuid, p_data date)
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  with prog as (
    select pm.sezon_eticheta
    from cursuri c
    join programe_metodologice pm on pm.id = c.program_metodologic
    where c.id = p_curs
  ),
  start_sezon as (
    select min(sc.data_incepere) as data
    from sezon_calendar sc
    join prog on prog.sezon_eticheta = sc.sezon_eticheta
    where sc.tip = 'modul' and sc.data_incepere is not null
  )
  select case
    when (select data from start_sezon) is null then null
    else (
      select count(distinct p.data)::int + 1
      from prezente p
      join enrollments e on e.id = p.enrollment
      where e.cursul = p_curs
        and p.data >= (select data from start_sezon)
        and p.data < p_data
    )
  end;
$$;

revoke execute on function _nr_sedinta_pentru(uuid, date) from anon, public;
grant execute on function _nr_sedinta_pentru(uuid, date) to authenticated;

-- Bannerul zilei: lecția de predat azi pentru grupă, cu adaptarea grupei aplicată.
-- 0 rânduri dacă grupa nu are program asociat sau sezonul n-are calendar.
create or replace function get_program_lectie_azi(p_curs uuid, p_data date default current_date)
returns table (
  program_id     uuid,
  program_nume   text,
  nr_sedinta     integer,
  total_sedinte  integer,
  depasit        boolean,
  lectie_id      uuid,
  titlu          text,
  note           text,
  tip            text,
  adaptat        boolean,
  modul_numar    integer,
  modul_tema     text,
  jurnal_status  text,
  jurnal_nota    text
)
language sql
stable
security invoker
set search_path = public
as $$
  with prog as (
    select pm.id, pm.nume
    from cursuri c
    join programe_metodologice pm on pm.id = c.program_metodologic
    where c.id = p_curs
  ),
  total as (
    select count(*)::int as n from program_lectii pl join prog on prog.id = pl.program_id
  ),
  n as (
    select _nr_sedinta_pentru(p_curs, p_data) as nr
  ),
  tinta as (
    -- peste finalul programului rămânem pe ultima lecție, cu flag `depasit`
    select least(coalesce(n.nr, 0), total.n) as nr, (coalesce(n.nr, 0) > total.n) as depasit
    from n, total
    where n.nr is not null and total.n > 0
  )
  select
    prog.id,
    prog.nume,
    tinta.nr,
    total.n,
    tinta.depasit,
    pl.id,
    coalesce(ov.titlu, pl.titlu),
    coalesce(ov.note, pl.note),
    pl.tip,
    (ov.id is not null),
    pmod.numar,
    pmod.tema,
    j.status,
    j.nota
  from prog
  cross join total
  cross join tinta
  join program_lectii pl on pl.program_id = prog.id and pl.nr_sedinta = tinta.nr
  join program_module pmod on pmod.id = pl.modul_id
  left join curs_lectii_override ov on ov.curs_id = p_curs and ov.nr_sedinta = pl.nr_sedinta
  left join program_jurnal j on j.curs_id = p_curs and j.data = p_data;
$$;

revoke execute on function get_program_lectie_azi(uuid, date) from anon, public;
grant execute on function get_program_lectie_azi(uuid, date) to authenticated;

-- Hub „Grupele mele": progresul grupelor teacherului curent față de program.
create or replace function get_program_progres_teacher()
returns table (
  curs_id            uuid,
  curs_nume          text,
  program_id         uuid,
  program_nume       text,
  total_sedinte      integer,
  nr_sedinta_curenta integer,
  urmatoarea_lectie  text,
  modul_numar        integer,
  modul_tema         text,
  conform_count      integer,
  diferit_count      integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with grupe as (
    select c.id, c.numele, pm.id as program_id, pm.nume as program_nume
    from cursuri c
    join programe_metodologice pm on pm.id = c.program_metodologic
    where coalesce(c.facultativ, false) = false
      and coalesce(c.suspendat, false) = false
      and teacher_can_access_curs(c.id)
  ),
  calc as (
    select g.*,
           (select count(*)::int from program_lectii pl where pl.program_id = g.program_id) as total,
           _nr_sedinta_pentru(g.id, current_date) as nr
    from grupe g
  )
  select
    calc.id,
    calc.numele,
    calc.program_id,
    calc.program_nume,
    calc.total,
    calc.nr,
    coalesce(ov.titlu, pl.titlu),
    pmod.numar,
    pmod.tema,
    (select count(*)::int from program_jurnal j where j.curs_id = calc.id and j.status = 'conform'),
    (select count(*)::int from program_jurnal j where j.curs_id = calc.id and j.status = 'diferit')
  from calc
  left join program_lectii pl
    on pl.program_id = calc.program_id
   and pl.nr_sedinta = least(coalesce(calc.nr, 0), calc.total)
  left join program_module pmod on pmod.id = pl.modul_id
  left join curs_lectii_override ov on ov.curs_id = calc.id and ov.nr_sedinta = pl.nr_sedinta
  order by calc.numele;
$$;

revoke execute on function get_program_progres_teacher() from anon, public;
grant execute on function get_program_progres_teacher() to authenticated;

-- Overview management: toate programele sezonului + grupele asociate și progresul lor.
-- Programele fără cursuri asociate apar cu curs_id null (left join).
create or replace function get_program_progres_admin(
  p_sezon_eticheta text default null,
  p_locatie uuid default null
)
returns table (
  program_id     uuid,
  program_nume   text,
  sezon_eticheta text,
  stare          text,
  total_sedinte  integer,
  curs_id        uuid,
  curs_nume      text,
  locatie_id     uuid,
  sedinte_tinute integer,
  conform_count  integer,
  diferit_count  integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    pm.id,
    pm.nume,
    pm.sezon_eticheta,
    pm.stare,
    (select count(*)::int from program_lectii pl where pl.program_id = pm.id),
    c.id,
    c.numele,
    c.locatie,
    case when c.id is null then null
         else greatest(coalesce(_nr_sedinta_pentru(c.id, current_date), 1) - 1, 0) end,
    case when c.id is null then null
         else (select count(*)::int from program_jurnal j where j.curs_id = c.id and j.status = 'conform') end,
    case when c.id is null then null
         else (select count(*)::int from program_jurnal j where j.curs_id = c.id and j.status = 'diferit') end
  from programe_metodologice pm
  left join cursuri c
    on c.program_metodologic = pm.id
   and (p_locatie is null or c.locatie = p_locatie)
  where p_sezon_eticheta is null or pm.sezon_eticheta = p_sezon_eticheta
  order by pm.nume, c.numele;
$$;

revoke execute on function get_program_progres_admin(text, uuid) from anon, public;
grant execute on function get_program_progres_admin(text, uuid) to authenticated;

-- Duplicarea structurii pe un sezon nou: calendar cu date GOALE (de completat) +
-- programe în ciornă. Activarea rămâne blocată de trigger până se pun datele.
create or replace function duplica_structura_sezon(p_sursa text, p_tinta text)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_programe integer := 0;
  r_prog record;
  v_nou uuid;
begin
  if not (auth_role() in ('admin', 'owner', 'manager')) then
    raise exception 'Doar managementul poate duplica structura unui sezon'
      using errcode = 'insufficient_privilege';
  end if;

  if exists (select 1 from programe_metodologice where sezon_eticheta = p_tinta)
     or exists (select 1 from sezon_calendar where sezon_eticheta = p_tinta) then
    raise exception 'Sezonul % are deja structură — șterge-o sau editeaz-o direct', p_tinta
      using errcode = 'unique_violation';
  end if;

  insert into sezon_calendar (sezon_eticheta, tip, numar, nume, nota)
  select p_tinta, tip, numar, nume, nota
  from sezon_calendar
  where sezon_eticheta = p_sursa;

  for r_prog in
    select * from programe_metodologice where sezon_eticheta = p_sursa order by nume
  loop
    insert into programe_metodologice
      (nume, sezon_eticheta, nivel_eticheta, sedinte_pe_saptamana, descriere, stare, surse)
    values
      (r_prog.nume, p_tinta, r_prog.nivel_eticheta, r_prog.sedinte_pe_saptamana,
       r_prog.descriere, 'ciorna', r_prog.surse)
    returning id into v_nou;

    insert into program_module (program_id, numar, tema, subtitlu)
    select v_nou, numar, tema, subtitlu
    from program_module where program_id = r_prog.id;

    insert into program_lectii (program_id, modul_id, nr_sedinta, titlu, note, tip)
    select v_nou, pmn.id, pl.nr_sedinta, pl.titlu, pl.note, pl.tip
    from program_lectii pl
    join program_module pmo on pmo.id = pl.modul_id
    join program_module pmn on pmn.program_id = v_nou and pmn.numar = pmo.numar
    where pl.program_id = r_prog.id;

    v_programe := v_programe + 1;
  end loop;

  return v_programe;
end;
$$;

revoke execute on function duplica_structura_sezon(text, text) from anon, public;
grant execute on function duplica_structura_sezon(text, text) to authenticated;
