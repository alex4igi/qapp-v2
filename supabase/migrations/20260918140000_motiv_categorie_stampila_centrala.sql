-- Categoria motivului se ștampilează CENTRAL, într-un trigger, nu la fiecare apelant.
--
-- 13 locuri din aplicație scriu `status = 'nurture'` (vezi tabelul din
-- docs/procedura-leads-kanban.md): trei cron-uri, patru funcții SQL, șase căi de
-- UI. Faza 1 a pus categoria pe căile prin care trece un OM; restul scriau în
-- continuare status fără motiv. O regulă repetată în 13 locuri e o regulă care
-- se va rupe într-unul din ele fără să anunțe pe nimeni — iar aici consecința e
-- un lead care ajunge în bazinul de recuperare fără să se știe de ce a căzut,
-- adică exact ce face lista din Faza 4 imposibil de ordonat.
--
-- Trigger-ul NU atinge niciodată o categorie deja pusă: omul care alege „Prea
-- scump" bate orice deducție. Umple doar golul.
--
-- `pierdut` rămâne în afara deducției, intenționat: din „a plecat din pipeline"
-- nu se poate deduce DE CE nu-l mai contactăm niciodată. Categoria aia o pune
-- doar un om, din MotivModal.

-- ── 1. O categorie nouă: „neatins" ──────────────────────────────────────────
-- Cele 29 de leaduri care au căzut din coloana „Nou" direct în Nurture n-au
-- nicio categorie potrivită în lista existentă: nu „n-a răspuns" (nimeni nu l-a
-- sunat), nu „n-a venit" (n-a fost programat), nu „istoric" (știm exact ce s-a
-- întâmplat). Distincția contează la ordonarea listei de recuperare din Faza 4:
-- un om neatins e altceva decât un om care ne-a refuzat.
--
-- Rămâne în numitorul K5 și al pâlniei — spre deosebire de `ex_client`,
-- `import` și `istoric`. Un lead pe care nu l-a sunat nimeni e o conversie
-- ratată, nu un rând care n-a fost niciodată al nostru.

alter table leads drop constraint if exists leads_motiv_categorie_check;
alter table leads add constraint leads_motiv_categorie_check check (
  motiv_categorie is null or motiv_categorie in (
    -- pierdut: nu mai contactăm
    'numar_gresit', 'opt_out', 'refuz_explicit', 'in_afara_tintei', 'deja_client',
    -- nurture, alese de om: „nu acum"
    'program', 'alta_activitate', 'pret', 'distanta', 'alt_studio', 'sare_anul', 'altul',
    -- nurture, puse de aplicație
    'nu_a_raspuns', 'nu_a_venit', 'a_venit_neinscris', 'neatins',
    'waiting_list_final_sezon', 'ex_client', 'import', 'istoric'
  )
);

-- ── 2. Deducția, într-un singur loc ─────────────────────────────────────────
-- Sursa primară e statusul DIN CARE a plecat leadul. Când apelantul nu-l poate
-- da (rând vechi, backfill, trigger care repară un gol), se citește din
-- `lead_history`. Ultima plasă e forma leadului: are client atașat ⇒ e umbra
-- unui fost cursant; n-are nici client, nici istoric ⇒ a fost turnat direct în
-- Nurture de un import.

create or replace function deduce_motiv_categorie(p_lead uuid, p_status_vechi text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_din text := p_status_vechi;
  v_are_client boolean;
begin
  -- „nurture → nurture" nu spune nimic: caută adevăratul status de plecare.
  if v_din is null or v_din in ('nurture', 'pierdut') then
    select h.old_value into v_din
    from lead_history h
    where h.lead_id = p_lead
      and h.action_type = 'status_change'
      and h.new_value = 'nurture'
      and h.old_value is distinct from 'nurture'
    order by h.created_at desc
    limit 1;
  end if;

  if v_din = 'a_venit'      then return 'a_venit_neinscris'; end if;
  if v_din = 'contactat'    then return 'nu_a_raspuns';      end if;
  if v_din = 'nu_a_venit'   then return 'nu_a_venit';        end if;
  -- „programat" ajunge în Nurture doar prin a 2-a neprezentare.
  if v_din = 'programat'    then return 'nu_a_venit';        end if;
  if v_din = 'waiting_list' then return 'waiting_list_final_sezon'; end if;
  if v_din = 'nou'          then return 'neatins';           end if;
  -- Mutare deliberată din „Pierdut": omul a decis că mai merită încercat, dar
  -- n-a spus de ce. Textul lui rămâne în motiv_pierdut.
  if v_din = 'pierdut'      then return 'altul';             end if;

  select p_lead is not null and l.id_client is not null into v_are_client
  from leads l where l.id = p_lead;
  if coalesce(v_are_client, false) then return 'ex_client'; end if;

  return 'import';
end;
$$;

revoke execute on function deduce_motiv_categorie(uuid, text) from anon, public;
grant execute on function deduce_motiv_categorie(uuid, text) to authenticated;

-- ── 3. Ștampila ─────────────────────────────────────────────────────────────

create or replace function trg_leads_motiv_categorie() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vechi text := case when tg_op = 'INSERT' then null else old.status end;
begin
  -- Ieșirea din pool (reactivare, re-aplicare, conversie târzie): categoria nu
  -- mai are obiect. Curățată aici o dată, nu în fiecare apelant.
  if new.status not in ('nurture', 'pierdut') then
    if v_vechi in ('nurture', 'pierdut') then
      new.motiv_categorie := null;
    end if;
    return new;
  end if;

  -- Categoria pusă de om sau de apelant câștigă întotdeauna.
  if new.status = 'nurture' and new.motiv_categorie is null then
    new.motiv_categorie := deduce_motiv_categorie(new.id, v_vechi);
  end if;

  return new;
end;
$$;

revoke execute on function trg_leads_motiv_categorie() from anon, public;

drop trigger if exists leads_motiv_categorie on leads;
-- Ordinea față de `leads_auto_opt_out` (alfabetică pe nume, deci el e primul) nu
-- contează: deducția nu produce niciodată `opt_out` — categoria aia o alege doar
-- un om, din MotivModal, și vine gata scrisă în UPDATE.
create trigger leads_motiv_categorie
  before insert or update of status, motiv_categorie on leads
  for each row
  execute function trg_leads_motiv_categorie();

-- ── 4. Backfill ─────────────────────────────────────────────────────────────
-- Verificat pe date, 18 sept. 2026 (6.203 rânduri în Nurture):
--   5.604  au client atașat și zero istoric  → umbre de foști cursanți
--     373  fără client, fără istoric, toate „Meta Ads", zero contactări
--          → turnate direct în Nurture de importul din Sheet
--     223  au în `lead_history` statusul din care au plecat
-- Deducția din istoric e obligatorie: „tot ce nu e ex-client devine istoric" ar
-- fi șters exact distincția care ordonează lista de recuperare (cine a fost
-- fizic la o clasă vs. cine n-a fost atins niciodată).

update leads l
   set motiv_categorie = deduce_motiv_categorie(l.id, null)
 where l.status = 'nurture'
   and l.motiv_categorie is null;

comment on function deduce_motiv_categorie(uuid, text) is
  'De ce a căzut leadul în Nurture, dedus din statusul de plecare → lead_history → forma leadului. Semnificațiile: docs/procedura-leads-kanban.md';
