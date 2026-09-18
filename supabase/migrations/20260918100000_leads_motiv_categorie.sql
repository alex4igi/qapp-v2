-- Motivul plecării unui lead devine o categorie închisă, nu text liber.
--
-- Azi `motiv_pierdut` e text liber și se completează doar la „Pierdut": nu se
-- poate număra nimic (24 de rânduri, 24 de formulări) și nu se poate ordona
-- bazinul de recuperare. Iar mutările în Nurture n-au niciun motiv — nici
-- măcar unul liber.
--
-- Categoriile trec granița decisă pe 2026-09-17:
--   PIERDUT  = nu mai contactăm niciodată
--   NURTURE  = „nu acum", îl prindem la campanii / reînscrieri
-- Textul liber rămâne în `motiv_pierdut`, ca detaliu opțional peste categorie.
--
-- CHECK, nu enum: dintr-un enum nu poți scoate o valoare care s-a dovedit
-- proastă. Fără tabel nou, deci fără garduri RLS noi de adăugat.

alter table leads add column if not exists motiv_categorie text;

alter table leads drop constraint if exists leads_motiv_categorie_check;
alter table leads add constraint leads_motiv_categorie_check check (
  motiv_categorie is null or motiv_categorie in (
    -- pierdut: nu mai contactăm
    'numar_gresit', 'opt_out', 'refuz_explicit', 'in_afara_tintei', 'deja_client',
    -- nurture, alese de om: „nu acum"
    'program', 'alta_activitate', 'pret', 'distanta', 'alt_studio', 'sare_anul', 'altul',
    -- nurture, puse de aplicație
    'nu_a_raspuns', 'nu_a_venit', 'a_venit_neinscris',
    'waiting_list_final_sezon', 'ex_client', 'import', 'istoric'
  )
);

comment on column leads.motiv_categorie is
  'De ce a plecat leadul din pipeline. Categorie închisă (vezi CHECK), completează motiv_pierdut. Sursa de adevăr a semnificațiilor: docs/procedura-leads-kanban.md';

create index if not exists leads_motiv_categorie_idx
  on leads (motiv_categorie) where motiv_categorie is not null;

-- ── Opt-out automat: se mută de pe textul liber pe categorie ────────────────
-- ATENȚIE: fără pasul ăsta în ACEEAȘI migrație, opt-out-ul automat ar muri în
-- tăcere în clipa în care UI-ul începe să trimită categorii în loc de textul
-- „Nu mai dorește să fie contactat (opt-out)". Potrivirea pe text rămâne ca
-- plasă pentru rândurile vechi și pentru orice cale care mai scrie text liber.

create or replace function trg_leads_auto_opt_out()
returns trigger
language plpgsql
as $$
begin
  if NEW.status = 'pierdut'
     and (NEW.motiv_categorie = 'opt_out' or NEW.motiv_pierdut ilike '%opt-out%')
     and NEW.opt_out_marketing = false then
    NEW.opt_out_marketing := true;
    NEW.opt_out_motiv := coalesce(nullif(trim(NEW.motiv_pierdut), ''), 'Nu mai dorește să fie contactat');
    NEW.opt_out_la := now();
  end if;
  return NEW;
end;
$$;

drop trigger if exists leads_auto_opt_out on leads;
create trigger leads_auto_opt_out
  before insert or update of status, motiv_pierdut, motiv_categorie on leads
  for each row
  execute function trg_leads_auto_opt_out();
