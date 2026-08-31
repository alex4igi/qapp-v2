-- Profil de eveniment: coloanele care lipseau ca o „DEMO Class" sa fie tratabila
-- ca un curs (sala, durata, grupa de varsta, stil, grupa reala tinta, campanie).
--
-- Numele sunt GENERICE, nu `demo_*`: si un Workshop are sala si durata. Singura
-- coloana cu inteles specific e `curs_tinta`.
--
-- `curs_tinta` NU refoloseste `evenimente.curs`: acela inseamna deja „eveniment
-- doar pentru grupa X", are `on delete cascade` si il expune in calendarul
-- portalului prin `get_evenimente_client`. Un demo e pentru NON-clienti — n-are
-- ce cauta acolo, si nu vrem sa dispara daca se sterge grupa tinta.
alter table evenimente
  add column if not exists locatie_id uuid references locatii(id)            on delete set null,
  add column if not exists sala       uuid references sali(id)               on delete set null,
  add column if not exists durata_min integer,
  add column if not exists varsta     varsta_curs,
  add column if not exists stil       text,
  add column if not exists curs_tinta uuid references cursuri(id)            on delete set null,
  add column if not exists campanie   uuid references campanii_promovare(id) on delete set null;

comment on column evenimente.locatie_id is
  'Locatia ca FK. `locatia` (text liber) ramane pentru compatibilitate: e citita de get_evenimente_client (portalul membri, alt deploy), de view-ul bilete_publice (grantat anon) si de cautarea din listEvenimente. Formularul scrie AMBELE.';
comment on column evenimente.curs_tinta is
  'Grupa reala in care converg participantii unei clase demo. Diferita de `curs` (= eveniment exclusiv al unei grupe, vizibil in portal).';

-- Sala implica locatia: un CHECK nu poate face subselect, deci normalizam.
create or replace function evenimente_normalize_locatie()
returns trigger
language plpgsql
as $$
begin
  if new.sala is not null then
    select locatie into new.locatie_id from sali where id = new.sala;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_evenimente_normalize_locatie on evenimente;
create trigger trg_evenimente_normalize_locatie
  before insert or update of sala, locatie_id on evenimente
  for each row execute function evenimente_normalize_locatie();

-- O clasa demo e gratuita, nu se vinde pe portal si nu e eveniment de grupa.
-- `curs is null` e partea importanta: altfel demoul ar ajunge in calendarul
-- membrilor si ar primi `on delete cascade` de la grupa.
-- Audit 2026-08-31: toate cele 16 randuri existente respecta deja conditia.
alter table evenimente
  drop constraint if exists evenimente_demo_coerenta;
alter table evenimente
  add constraint evenimente_demo_coerenta check (
    tip <> 'DEMO Class'
    or (coalesce(pret_bilet, 0) = 0 and public = false and curs is null and data is not null)
  );

create index if not exists idx_evenimente_sala_data on evenimente (sala, data) where sala is not null;
create index if not exists idx_evenimente_demo      on evenimente (data)        where tip = 'DEMO Class';
create index if not exists idx_evenimente_campanie  on evenimente (campanie)    where campanie is not null;

-- Aparare in adancime: demourile sunt deja `public = false` (constrangerea de mai
-- sus o impune), dar view-ul public nu filtra pe tip.
drop view if exists bilete_publice;
create view bilete_publice as
select
  e.id,
  e.nume_eveniment as nume,
  e.descriere,
  e.data,
  e.locatia        as locatie,
  e.pret_bilet,
  e.capacitate
from evenimente e
where e.public
  and e.tip <> 'DEMO Class'
  and coalesce(e.data::date, current_date) >= current_date
  and (e.status is null or e.status <> 'Anulat')
order by e.data asc nulls last;

-- ⚠️ NU `security_invoker`: ruleaza cu privilegiile owner-ului si expune lui
-- `anon` doar coloanele de mai sus, ocolind RLS pe `evenimente`.
grant select on bilete_publice to anon, authenticated;
