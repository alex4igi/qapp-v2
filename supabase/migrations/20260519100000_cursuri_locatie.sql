-- Adaugă locație directă pe cursuri.
--
-- Înainte: locația unui curs era derivată indirect prin sala (curs → sala →
-- locatie). Cursurile fără sală pierdeau locația, iar în UI nu exista o
-- coloană dedicată — operatorul nu putea seta/edita locația explicit.
--
-- Acum stocăm locația direct pe rândul de curs. La cursurile existente facem
-- backfill din sala asociată (acolo unde sala are locatie).

alter table public.cursuri add column if not exists locatie uuid;
alter table public.cursuri
  drop constraint if exists fk_cursuri_locatie;
alter table public.cursuri
  add constraint fk_cursuri_locatie
  foreign key (locatie) references public.locatii(id) on delete set null;

-- Backfill: la cursurile cu sala completată, copiem locatia din sala.
update public.cursuri c
set locatie = s.locatie
from public.sali s
where c.sala = s.id
  and c.locatie is null
  and s.locatie is not null;

create index if not exists cursuri_locatie_idx on public.cursuri (locatie);

-- Recreăm view-ul lista_cursuri ca să folosească locatia directă a cursului,
-- cu fallback pe locatia sălii (pentru cursurile vechi fără locatie explicită
-- și fără sală cu locatie).
drop view if exists lista_cursuri;

create view lista_cursuri as
select
  c.id,
  c.numele as numele_cursului,
  c.sezon,
  c.zile,
  c.nivelul,
  count(e.id) as inscrisi,
  c.capacitate_maxima,
  i.id as id_teacher,
  i.nume,
  i.prenume,
  i.telefon,
  i.nivelul as nivel_teacher,
  s.nume as sala,
  coalesce(l_direct.nume, l_sala.nume) as locatie,
  coalesce(c.locatie, s.locatie) as id_locatie,
  0 as balance
from cursuri c
left join teacheri i on c.teacher = i.id
left join sali s on s.id = c.sala
left join locatii l_sala on l_sala.id = s.locatie
left join locatii l_direct on l_direct.id = c.locatie
left join enrollments e on e.cursul = c.id
group by c.id, i.id, s.id, l_sala.id, l_direct.id;

alter view lista_cursuri set (security_invoker = true);
