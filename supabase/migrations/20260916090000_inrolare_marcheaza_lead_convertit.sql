-- Qapp v2 — înrolarea marchează leadul convertit, din orice ecran.
--
-- Context (2026-09-16): conversia e în doi pași — ConversieModal creează fișa și
-- o leagă de lead (id_client), iar leadul devine `convertit` abia când reușește
-- înrolarea din formularul deschis imediat după (markLeadConvertit, în app).
-- Dacă recepția iese între pași și îl înrolează pe om din fișa clientului sau
-- de pe cardul grupei, nimeni nu mai atinge leadul: 9 cursanți activi ai
-- sezonului 2026-2027 aveau leadul rămas pe „a venit"/„nurture" (unul mutat
-- manual în nurture după înrolare, altul de cron), fără urmă în lead_history,
-- iar în kanban cardul nu semnala nimic („Finalizează înscrierea" apare doar
-- cât timp clientul N-are înrolare).
--
-- Fix: trigger pe inserarea înrolării. Marchează convertit leadul legat de
-- client, DOAR dacă leadul e mai vechi decât fișa — adică omul a intrat ca lead
-- și fișa s-a născut din el. Gardul exclude umbrele de ex-client (rând nurture
-- creat de cron pe un client vechi — vezi 20260901235600) și leadurile „deja
-- client" (formular Meta de la un client existent): ambele au fișa dinaintea
-- leadului, iar o înrolare nouă nu e conversia lor. Leadul legat de un client
-- existent prin „Leagă și continuă" rămâne pe seama app-ului (markLeadConvertit).
--
-- SMS-ul de review NU se mai trimite (decizie 2026-09-16): triggerul nu îl
-- pune în coadă, iar app-ul nu îl mai declanșează nici pe fluxul de conversie.

create or replace function trg_enrollment_marcheaza_lead_convertit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.data_reziliere is not null or coalesce(new.reziliat, false) then
    return new;
  end if;
  update leads l
  set status = 'convertit',
      data_conversie = coalesce(new.created, now()),
      sub_status = null,
      flag_reminder = false,
      flag_reminder_at = null,
      flag_streak = 0
  from clienti c
  where l.id_client = new.client
    and c.id = new.client
    and l.status <> 'convertit'
    and l.created < c.created;
  return new;
end;
$$;

revoke execute on function trg_enrollment_marcheaza_lead_convertit() from anon, public;

drop trigger if exists enrollment_marcheaza_lead_convertit on enrollments;
create trigger enrollment_marcheaza_lead_convertit
after insert on enrollments
for each row execute function trg_enrollment_marcheaza_lead_convertit();

-- Backfill: aceeași regulă aplicată înrolărilor deja existente din sezonul activ.
-- data_conversie = prima înrolare nereziliată, ca să cadă pe luna corectă în pâlnie.
update leads l
set status = 'convertit',
    data_conversie = x.prima,
    sub_status = null,
    flag_reminder = false,
    flag_reminder_at = null,
    flag_streak = 0
from (
  select l2.id, min(e.created) as prima
  from leads l2
  join clienti c on c.id = l2.id_client
  join enrollments e on e.client = c.id
  where l2.status <> 'convertit'
    and l2.created < c.created
    and e.data_reziliere is null
    and e.data_incepere >= (select max(s.data_incepere) from sezoane s where s.activ)
  group by l2.id
) x
where l.id = x.id;
