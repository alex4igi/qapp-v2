-- Ștergerea unui program metodologic (greșeli / curățenie de draft-uri).
--
-- Flux în 2 pași ca la ștergerea de curs/teacher: dacă programul e asociat unor
-- grupe, prima încercare aruncă QD409 (UI-ul arată consecința + butonul „Șterge
-- oricum"). La forțare, grupele rămân fără program (cursuri.program_metodologic
-- devine NULL prin on delete set null). Modulele + lecțiile pică prin cascade.

create or replace function sterge_program(p_program uuid, p_force boolean default false)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_grupe int;
begin
  if not (auth_role() in ('admin', 'owner', 'manager')) then
    raise exception 'Doar managementul poate șterge programe'
      using errcode = 'insufficient_privilege';
  end if;

  select count(*) into v_grupe from cursuri where program_metodologic = p_program;

  if v_grupe > 0 and not p_force then
    raise exception '% grupă(e) folosesc acest program — se dezasociază la ștergere', v_grupe
      using errcode = 'QD409';
  end if;

  delete from programe_metodologice where id = p_program;
end;
$$;

revoke execute on function sterge_program(uuid, boolean) from anon, public;
grant execute on function sterge_program(uuid, boolean) to authenticated;
