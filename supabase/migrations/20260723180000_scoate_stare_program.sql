-- Scoate conceptul draft/activ: orice program metodologic e utilizabil direct și
-- se poate asocia grupelor. Renunțăm la triggerele de gating, la RPC-urile care
-- setau/citeau starea și la coloana `stare`.
--
-- Calendarul rămâne fundația funcțională: RPC-urile de banner/progres întorc 0
-- rânduri când sezonul n-are module cu date (degradare grațioasă), fără să mai fie
-- nevoie de un gard hard.

-- 1) Gardurile bazate pe stare dispar.
drop trigger if exists trg_curs_program_trebuie_activ on cursuri;
drop function if exists _curs_program_trebuie_activ();
drop trigger if exists trg_program_activ_cere_calendar on programe_metodologice;
drop function if exists _program_activ_cere_calendar();

-- 2) RPC-urile care referă `stare` — recreate fără ea, ÎNAINTE de drop column.

-- overview management: fără coloana stare (return type schimbat => drop + create)
drop function if exists get_program_progres_admin(text, uuid);
create function get_program_progres_admin(
  p_sezon_eticheta text default null,
  p_locatie uuid default null
)
returns table (
  program_id     uuid,
  program_nume   text,
  sezon_eticheta text,
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

-- duplica_program: fără stare (copia e direct utilizabilă)
create or replace function duplica_program(p_program uuid, p_nume text default null)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_sursa programe_metodologice%rowtype;
  v_nou   uuid;
begin
  if not (auth_role() in ('admin', 'owner', 'manager')) then
    raise exception 'Doar managementul poate duplica programe'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_sursa from programe_metodologice where id = p_program;
  if not found then
    raise exception 'Programul sursă nu există';
  end if;

  insert into programe_metodologice
    (nume, sezon_eticheta, sezon_id, nivel_eticheta, sedinte_pe_saptamana, descriere, surse)
  values
    (coalesce(nullif(btrim(p_nume), ''), v_sursa.nume || ' (copie)'),
     v_sursa.sezon_eticheta, v_sursa.sezon_id, v_sursa.nivel_eticheta,
     v_sursa.sedinte_pe_saptamana, v_sursa.descriere, '[]'::jsonb)
  returning id into v_nou;

  insert into program_module (program_id, numar, tema, subtitlu)
  select v_nou, numar, tema, subtitlu
  from program_module
  where program_id = p_program;

  insert into program_lectii (program_id, modul_id, nr_sedinta, titlu, note, tip)
  select v_nou, pmn.id, pl.nr_sedinta, pl.titlu, pl.note, pl.tip
  from program_lectii pl
  join program_module pmo on pmo.id = pl.modul_id
  join program_module pmn on pmn.program_id = v_nou and pmn.numar = pmo.numar
  where pl.program_id = p_program;

  return v_nou;
end;
$$;
revoke execute on function duplica_program(uuid, text) from anon, public;
grant execute on function duplica_program(uuid, text) to authenticated;

-- duplica_structura_sezon: fără stare
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
      (nume, sezon_eticheta, nivel_eticheta, sedinte_pe_saptamana, descriere, surse)
    values
      (r_prog.nume, p_tinta, r_prog.nivel_eticheta, r_prog.sedinte_pe_saptamana,
       r_prog.descriere, r_prog.surse)
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

-- 3) Coloana dispare.
alter table programe_metodologice drop column stare;
