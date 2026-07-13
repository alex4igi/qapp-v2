-- Încasările create de app (iunie→) au sezon = null: calea de plată nu setează
-- niciodată `sezon`, iar în DB nu exista trigger. Rândurile vechi aveau sezon doar
-- fiindcă veneau din importul v1. Efect: plățile „dispăreau" din rapoartele filtrate
-- pe sezon. Aici: (1) backfill determinist pe rândurile existente, (2) trigger care
-- stampilează sezonul la INSERT pentru app + flux bancă + orice RPC viitor.

-- 1) Backfill din înrolarea legată (sursa de adevăr pentru abonamente)
update incasari i
set sezon = e.sezon_id
from enrollments e
where i.sezon is null
  and i.inregistrare = e.id
  and e.sezon_id is not null;

-- 2) Backfill restul (workshop/închiriere fără înrolare) pe data plății.
--    Suprapunere de sezoane (ex. 24 iun cade și în 2025-2026 și în Vara 2026):
--    preferă sezonul activ, apoi cel mai recent început.
update incasari i
set sezon = sub.sezon_id
from (
  select distinct on (x.id) x.id as inc_id, s.id as sezon_id
  from incasari x
  join sezoane s on x.data >= s.data_incepere and x.data <= s.data_final
  where x.sezon is null
  order by x.id, s.activ desc, s.data_incepere desc
) sub
where i.id = sub.inc_id
  and i.sezon is null;

-- 3) Trigger: stampilează sezonul la INSERT dacă vine null.
create or replace function set_incasare_sezon()
returns trigger
language plpgsql
as $$
begin
  if new.sezon is not null then
    return new;
  end if;

  -- prioritar: sezonul înrolării plătite
  if new.inregistrare is not null then
    select sezon_id into new.sezon
    from enrollments
    where id = new.inregistrare;
  end if;

  -- fallback: pe data plății (sezon activ, apoi cel mai recent)
  if new.sezon is null and new.data is not null then
    select id into new.sezon
    from sezoane
    where new.data >= data_incepere and new.data <= data_final
    order by activ desc, data_incepere desc
    limit 1;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_set_incasare_sezon on incasari;
create trigger trg_set_incasare_sezon
before insert on incasari
for each row execute function set_incasare_sezon();
