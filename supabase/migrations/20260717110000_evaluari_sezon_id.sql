-- Evaluări legate de sezon (soft): denormalizăm sezon_id derivat din cursuri.sezon.
-- Motiv: evaluările se dau de ~3× pe sezon (dec/apr/iun); trendul „pe sezon" e mai
-- robust cu o coloană explicită decât cu match pe interval de date (sezoanele
-- principal/extra se pot suprapune). Oglindește pattern-ul de la enrollments
-- (_enrollment_derive_sezon din 20260527130000_sezoane_lifecycle.sql).

alter table evaluari add column if not exists sezon_id uuid;

alter table evaluari drop constraint if exists fk_evaluari_sezon;
alter table evaluari add constraint fk_evaluari_sezon
  foreign key (sezon_id) references sezoane(id) on delete set null;

create index if not exists idx_evaluari_sezon on evaluari(sezon_id);

-- Backfill: sezonul vine din cursul evaluat (sursă autoritară).
update evaluari ev
set sezon_id = c.sezon
from cursuri c
where ev.cursul = c.id
  and ev.sezon_id is null
  and c.sezon is not null;

-- Trigger: la INSERT, dacă sezon_id e null îl derivă din cursuri.sezon.
create or replace function _evaluare_derive_sezon()
returns trigger
language plpgsql
as $$
begin
  if new.sezon_id is null and new.cursul is not null then
    select sezon into new.sezon_id from cursuri where id = new.cursul;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_evaluare_derive_sezon on evaluari;
create trigger trg_evaluare_derive_sezon
  before insert on evaluari
  for each row execute function _evaluare_derive_sezon();
