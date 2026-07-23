-- Duplică un program metodologic într-o copie nouă (ciornă, același sezon).
--
-- Enabler pentru workflow-ul „pornesc dintr-un draft și fac variații": managerul
-- ia un program existent (ex. «Începători copii · săptămână»), îl duplică,
-- îl redenumește («Începători Tiny 2×») și îl adaptează. Copia intră în ciornă,
-- deci nu se poate lega de cursuri până nu e finisată și activată.

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

  -- Copia nu mai poartă proveniența de import (e o variație manuală) => surse gol.
  insert into programe_metodologice
    (nume, sezon_eticheta, sezon_id, nivel_eticheta, sedinte_pe_saptamana, descriere, stare, surse)
  values
    (coalesce(nullif(btrim(p_nume), ''), v_sursa.nume || ' (copie)'),
     v_sursa.sezon_eticheta, v_sursa.sezon_id, v_sursa.nivel_eticheta,
     v_sursa.sedinte_pe_saptamana, v_sursa.descriere, 'ciorna', '[]'::jsonb)
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
