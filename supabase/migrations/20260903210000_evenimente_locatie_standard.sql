-- Locația unui eveniment devine standard: `locatie_id` (FK către `locatii`) e
-- sursa de adevăr, iar `locatia` (text) e doar oglinda numelui canonic. Textul
-- liber din formular producea variante care nu se leagă de nimic:
--   „Stefan Cel Mare" (5), „Nicolina Q4K" (2) — locație inexistentă.
--
-- Maparea celor 2 rânduri „Nicolina Q4K" a fost confirmată de Alex (2026-09-03):
-- audițiile Q Strike și Acro Q/Acrobatics se țin la Quasar 4 Kids, deși grupele
-- se antrenează la Nicolina. Nu e deductibilă din date — de aceea e explicită.

update evenimente
   set locatie_id = (select id from locatii where nume = 'Quasar 4 Kids')
 where locatie_id is null
   and locatia = 'Nicolina Q4K';

-- Restul: potrivire pe numele normalizat (fără diacritice), doar când e unică.
-- `unaccent` nu e instalat pe proiect — de aici translate().
create or replace function _norm_locatie(txt text)
returns text
language sql immutable
as $$
  select lower(trim(translate(coalesce(txt, ''),
    'ăâîșşțţĂÂÎȘŞȚŢ', 'aaisstt' || 'AAISSTT')));
$$;

do $$
declare r record; v_id uuid; v_n int;
begin
  for r in
    select id, locatia from evenimente
     where locatie_id is null and btrim(coalesce(locatia, '')) <> ''
  loop
    select count(*), (array_agg(l.id))[1] into v_n, v_id
      from locatii l
     where _norm_locatie(l.nume) like '%' || _norm_locatie(r.locatia) || '%'
        or _norm_locatie(r.locatia) like '%' || _norm_locatie(l.nume) || '%';
    if v_n = 1 then
      update evenimente set locatie_id = v_id where id = r.id;
    else
      -- Rămâne text liber (parc, teatru) — formularul îl arată ca „Altă locație".
      raise notice 'locatie nepotrivita (% potriviri): eveniment % -> "%"', v_n, r.id, r.locatia;
    end if;
  end loop;
end $$;

drop function _norm_locatie(text);

-- Oglinda: numele canonic peste orice variantă tastată („Stefan cel Mare").
update evenimente e
   set locatia = l.nume
  from locatii l
 where e.locatie_id = l.id
   and e.locatia is distinct from l.nume;

-- De acum oglindirea o face DB-ul, nu formularul: `locatia` nu mai poate rămâne
-- în urmă indiferent cine scrie (app staff, portal, script). Când `locatie_id` e
-- null, textul e liber — e cazul evenimentelor din afara studiourilor.
create or replace function evenimente_normalize_locatie()
returns trigger
language plpgsql
as $$
begin
  if new.sala is not null then
    select locatie into new.locatie_id from sali where id = new.sala;
  end if;
  if new.locatie_id is not null then
    select nume into new.locatia from locatii where id = new.locatie_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_evenimente_normalize_locatie on evenimente;
create trigger trg_evenimente_normalize_locatie
  before insert or update of sala, locatie_id, locatia on evenimente
  for each row execute function evenimente_normalize_locatie();
