-- Prețul unui eveniment îl decide TIPUL, nu legătura cu cursul.
--
-- Regula veche („legat de curs ⇒ intern și gratuit") s-a născut din evenimentele
-- de grupă ale teacherului (spectacol, antrenament în parc) și e corectă acolo.
-- La audiții se rupe: audiția e legată de trupa țintă ca să fie vizibilă în
-- portal doar membrilor ei, dar se plătește (60 lei). `curs` rămâne doar scope
-- de vizibilitate.
--
-- Vânzarea online nu se deschide: `evenimente_grupa_nu_public` interzice
-- `public` pe evenimentele legate de curs, iar list_bilete_evenimente() cere
-- `public = true`.
--
-- Garanția „teacherul nu atinge banii" se mută din politică în trigger: în
-- WITH CHECK nu se poate compara cu rândul vechi, deci `pret_bilet is null`
-- ar fi blocat teacherul să mai editeze ORA unei audiții cu preț, nu doar
-- prețul. Triggerul distinge insertul de modificare.

create or replace function evenimente_teacher_pret_guard()
returns trigger
language plpgsql
as $$
begin
  if not is_teacher() then
    return new;
  end if;
  if tg_op = 'INSERT' and new.pret_bilet is not null then
    raise exception 'Un teacher nu poate pune preț pe un eveniment.';
  end if;
  if tg_op = 'UPDATE' and new.pret_bilet is distinct from old.pret_bilet then
    raise exception 'Prețul evenimentului se schimbă doar de manager.';
  end if;
  return new;
end;
$$;

revoke execute on function evenimente_teacher_pret_guard() from anon, public;

drop trigger if exists trg_evenimente_teacher_pret on evenimente;
create trigger trg_evenimente_teacher_pret
  before insert or update on evenimente
  for each row execute function evenimente_teacher_pret_guard();

drop policy if exists evenimente_teacher_grupa on evenimente;
create policy evenimente_teacher_grupa on evenimente
  for all to authenticated
  using (is_teacher() and curs is not null and teacher_can_access_curs(curs))
  with check (
    is_teacher() and curs is not null and teacher_can_access_curs(curs)
    and public = false
  );
