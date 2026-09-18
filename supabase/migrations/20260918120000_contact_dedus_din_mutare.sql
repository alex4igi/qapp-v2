-- Mutarea unui card ÎNSEAMNĂ că s-a vorbit cu omul — aplicația o scrie singură.
--
-- Constatare Alex, 2026-09-18: „dacă din Nou este mutat într-un fel sau altul,
-- asta se face DOAR prin contact". Datele confirmă: din 409 leaduri în pipeline,
-- doar 4 n-au nicio urmă de om, dar butonul „Loghează contact" a fost apăsat pe
-- ~16%. Tot ce depinde de „ultimul contact" — stegulețele de seară, pragurile
-- spre Nurture, scorecardul call-centerului — lucra deci pe date false.
--
-- Rezolvarea stă în DB, nu în UI: statusul se schimbă din drag & drop, din fișa
-- leadului, din stepper, din rosterul grupei și din RPC-uri (`inscrie_la_demo`).
-- Un trigger le prinde pe toate odată.
--
-- Contactul dedus e marcat ca atare (`dedus = true`): scorecardul îl numără la
-- muncă, dar poate arăta separat cât s-a logat explicit — disciplina de logare
-- rămâne vizibilă, fără să pedepsească pe cineva pentru un buton neapăsat.

alter table lead_contacte
  add column if not exists dedus boolean not null default false;

comment on column lead_contacte.dedus is
  'true = contact dedus din mutarea cardului (nu l-a logat nimeni explicit). Vezi docs/procedura-leads-kanban.md';

create or replace function trg_lead_contact_dedus()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Doar om, niciodată cron: joburile rulează pe service_role, unde auth.uid()
  -- e null. Fără gardul ăsta, trecerile automate de noapte ar arăta ca apeluri.
  if auth.uid() is null then
    return null;
  end if;

  -- Statusurile care nu se pot atinge fără să fi vorbit cu omul. Lipsesc
  -- intenționat: `nu_a_venit` (o absență nu e un contact), `nurture` și `nou`.
  if new.status not in ('contactat','programat','waiting_list','a_venit','convertit','pierdut') then
    return null;
  end if;

  -- Dacă recepția a logat deja contactul (butonul 📞, ContactareModal), nu-l
  -- dublăm: fluxul explicit scrie rândul și abia apoi schimbă statusul.
  if exists (
    select 1 from lead_contacte c
     where c.lead_id = new.id
       and c.created > now() - interval '5 minutes'
  ) then
    return null;
  end if;

  insert into lead_contacte (lead_id, user_id, canal, rezultat, observatii, dedus)
  values (
    new.id,
    auth.uid(),
    'necunoscut',
    -- O mutare deliberată înseamnă că omul a răspuns; `pierdut` își păstrează
    -- semantica lui din enum.
    case when new.status = 'pierdut' then 'pierdut'::rezultat_contact
         else 'reusit'::rezultat_contact end,
    'Dedus din mutarea in „' || new.status::text || '"',
    true
  );
  return null;
end;
$$;

revoke execute on function trg_lead_contact_dedus() from anon, public;

-- AFTER: rândul de lead e deja scris, iar inserarea în `lead_contacte` declanșează
-- `bump_lead_ultima_contactare`, care actualizează `ultima_contactare_la` și
-- stinge stegulețul. Fără recursie: bump-ul nu atinge coloana `status`.
drop trigger if exists lead_contact_dedus on leads;
create trigger lead_contact_dedus
  after update of status on leads
  for each row
  when (old.status is distinct from new.status)
  execute function trg_lead_contact_dedus();
