-- Invariant: o singură prezență per (client, curs, zi), indiferent de înrolare.
--
-- Context: `prezente` se deduplica doar pe (enrollment, data) — vezi
-- uq_prezente_enrollment_data. Când un client are 2+ înrolări pe ACELAȘI curs care
-- acoperă aceeași zi (date v1 legacy cu data_final=null suprapuse, sau conversia
-- ședință→abonament), bifările succesive nimeresc înrolări diferite și creează
-- rânduri separate → același client/curs/zi cu mai multe prezențe (1.328 grupuri
-- istorice constatate 2017-2026). Cheia (enrollment,data) nu poate prinde asta
-- fiindcă `prezente` nu are coloană `curs` (cursul vine prin enrollment).
--
-- Fix de fond: trigger BEFORE INSERT/UPDATE care derivă cursul din enrollment și
-- șterge orice altă prezență a aceluiași client, pe același curs, în aceeași zi,
-- legată de altă înrolare. Last-write-wins: rândul curent devine cel canonic.
-- (DELETE nu declanșează triggerul → fără recursie.)

create index if not exists idx_prezente_client_data on prezente (client, data);

create or replace function prezente_dedup_client_curs_data()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_curs uuid;
begin
  -- fără înrolare nu putem deriva cursul → lăsăm rândul (orfan) neatins
  if new.enrollment is null or new.client is null then
    return new;
  end if;

  select cursul into v_curs from enrollments where id = new.enrollment;
  if v_curs is null then
    return new;
  end if;

  delete from prezente p
  using enrollments e
  where p.enrollment = e.id
    and e.cursul = v_curs
    and p.client = new.client
    and p.data = new.data
    and p.id is distinct from new.id;

  return new;
end;
$$;

drop trigger if exists trg_prezente_dedup on prezente;
create trigger trg_prezente_dedup
  before insert or update on prezente
  for each row execute function prezente_dedup_client_curs_data();
