-- Qapp v2 — clientul care revine iese și din pool-ul de reactivare.
--
-- Bug: `auto_mark_inactiv_si_exclient` are drum într-un singur sens. Când un
-- client trece 45 de zile fără prezență îl marchează EXclient și îi creează un
-- rând de nurture (pool de reactivare). Când același om se întoarce — pasul 3 îl
-- pune înapoi pe 'Activ' — umbra rămâne în nurture pentru totdeauna.
-- Rezultat la 2026-09-01: 61 de lead-uri în nurture al căror client NU mai e
-- EXclient (45 Activ, 16 Inactiv). Pool-ul de reactivare conținea oameni care
-- vin deja la ore, iar în tabul Nurture rândurile apar cu `created` = data
-- rulării cronului, deci arată exact ca niște lead-uri proaspete.
--
-- Fix, în două părți:
--   1. Curățare la fiecare rulare, nu doar la reactivarea din pasul 3: orice
--      umbră al cărei client nu mai e EXclient dispare, indiferent cine i-a
--      schimbat statusul (înrolarea îl pune pe 'Activ' direct — vezi
--      20260629130000). Se șterg DOAR rândurile pur generate: fără sursă,
--      contacte, programări, SMS, intake sau atingere de om. Ștergerea e
--      reversibilă prin natura ei — dacă omul pleacă din nou, aceeași funcție
--      recreează rândul.
--   2. Lead-urile REALE ajunse acolo se întorc în etapa din care au fost luate
--      (aceeași logică ca 20260901235500, dar cu gardul corect: „clientul e
--      EXclient", nu „lead-ul n-are client" — gardul vechi a sărit peste doi
--      oameni veniți la demo pe 26 august).
--
-- Garda care împiedică reintrarea stă în cronuri (cron-evening + cron-morning):
-- un lead al cărui client e Activ/Inactiv nu mai poate fi auto-nurturat.

drop function if exists auto_mark_inactiv_si_exclient();

create function auto_mark_inactiv_si_exclient()
returns table (
  marcati_inactiv  int,
  marcati_exclient int,
  inrolari_reziliate int,
  leads_create     int,
  reactivati       int,
  umbre_curatate   int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inactiv int := 0;
  v_exclient int := 0;
  v_inrolari int := 0;
  v_fut int := 0;
  v_paid int := 0;
  v_leads int := 0;
  v_reactivati int := 0;
  v_umbre int := 0;
  v_cutoff_inactiv  date := current_date - interval '21 days';
  v_cutoff_exclient date := current_date - interval '45 days';
  v_eom date := (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date;
  v_season_start date := coalesce((select max(data_incepere) from sezoane where activ), '9999-12-31'::date);
begin
  create temporary table _last_prezent on commit drop as
  select
    c.id as client_id,
    c.status as status_actual,
    (
      select max(p.data)
      from prezente p
      join enrollments e on e.id = p.enrollment
      where e.client = c.id and p.status = 'Prezent'
    ) as ultima_prezenta,
    exists (
      select 1 from enrollments e
      where e.client = c.id
        and e.reziliat = false
        and e.data_incepere >= v_season_start
    ) as are_inrolare_curenta
  from clienti c;

  -- 1. EXclient: fără prezență în 45d (sau niciodată) ȘI fără înrolare în sezonul activ.
  create temporary table _ex_candidati on commit drop as
  select client_id from _last_prezent
  where coalesce(status_actual, 'Activ') <> 'EXclient'
    and are_inrolare_curenta = false
    and (ultima_prezenta is null or ultima_prezenta < v_cutoff_exclient);

  update clienti
  set status = 'EXclient'
  where id in (select client_id from _ex_candidati);
  get diagnostics v_exclient = row_count;

  -- (a) Lunile VIITOARE (neconsumate): reziliază + zerează (nu facturăm o lună neefectuată).
  update enrollments e
  set reziliat = true, activ = false, suma = 0, suma_baza = 0, updated = now()
  where e.client in (select client_id from _ex_candidati)
    and e.reziliat = false
    and e.data_incepere > v_eom;
  get diagnostics v_fut = row_count;

  -- (b) Lunile consumate FĂRĂ datorie (rest ≤ 0): reziliază curat.
  update enrollments e
  set reziliat = true, activ = false, updated = now()
  where e.client in (select client_id from _ex_candidati)
    and e.reziliat = false
    and coalesce(e.suma, 0)
        - coalesce((select sum(i.suma) from incasari i where i.inregistrare = e.id), 0) <= 0.005;
  get diagnostics v_paid = row_count;
  v_inrolari := v_fut + v_paid;

  -- (c) Lunile consumate CU datorie (rest > 0): NU reziliem (contract). Doar inactivăm.
  update enrollments e
  set activ = false, updated = now()
  where e.client in (select client_id from _ex_candidati)
    and e.reziliat = false
    and e.activ = true
    and coalesce(e.suma, 0)
        - coalesce((select sum(i.suma) from incasari i where i.inregistrare = e.id), 0) > 0.005;

  -- Reintegrează ca lead nurture. 'convertit' e exclus: e istoric de pâlnie, nu
  -- stare curentă — pentru el se creează mai jos un rând nou.
  update leads l
  set status = 'nurture',
      sub_status = null,
      flag_reminder = false,
      flag_reminder_at = null,
      flag_streak = 0,
      motiv_pierdut = null
  where l.id_client in (select client_id from _ex_candidati)
    and l.status not in ('nurture', 'convertit');

  -- Rând nou de nurture pentru orice ex-client care nu are deja unul: fie n-a
  -- avut niciodată lead (import v1), fie singurul lui lead e conversia păstrată.
  insert into leads (nume, prenume, telefon, email, data_nasterii, status, id_client)
  select c.nume, c.prenume, c.telefon, c.email, c.data_nasterii, 'nurture', c.id
  from clienti c
  where c.id in (select client_id from _ex_candidati)
    and not exists (
      select 1 from leads l
      where l.id_client = c.id and l.status = 'nurture'
    );
  get diagnostics v_leads = row_count;

  -- 2. Inactiv: fără prezență în fereastra strictă (> azi-21), status era Activ,
  --    ȘI fără înrolare în sezonul activ. Aliniat la clienti_activi_la (> D-21).
  update clienti
  set status = 'Inactiv'
  where id in (
    select client_id from _last_prezent
    where coalesce(status_actual, 'Activ') = 'Activ'
      and are_inrolare_curenta = false
      and ultima_prezenta is not null
      and ultima_prezenta <= v_cutoff_inactiv
      and ultima_prezenta >= v_cutoff_exclient
  );
  get diagnostics v_inactiv = row_count;

  -- 3. Reactivare → Activ: revenire la cursuri (Prezent, fereastra strictă > azi-21)
  --    SAU înrolare în sezonul activ.
  update clienti
  set status = 'Activ'
  where id in (
    select client_id from _last_prezent
    where (
            status_actual = 'Inactiv'
            and ultima_prezenta is not null
            and ultima_prezenta > v_cutoff_inactiv
          )
       or (
            status_actual in ('Inactiv', 'EXclient')
            and are_inrolare_curenta = true
          )
  );
  get diagnostics v_reactivati = row_count;

  -- 4. Umbrele fără obiect: clientul nu mai e EXclient, deci nu e țintă de
  --    reactivare. Se rulează pe TOT tabelul, nu doar pe cei reactivați la pasul
  --    3, fiindcă statusul se poate schimba și din afara acestei funcții
  --    (`inrolare_marcheaza_activ`). Condițiile de „rând pur generat" sunt
  --    exact inversul unui lead lucrat: dacă cineva l-a sunat, i-a scris, l-a
  --    programat sau l-a atins manual, rândul rămâne.
  delete from leads l
  using clienti c
  where c.id = l.id_client
    and l.status = 'nurture'
    and c.status <> 'EXclient'
    and l.sursa is null
    and l.data_conversie is null
    and l.nr_contactari = 0
    and l.ultima_contactare_la is null
    and l.observatii is null
    and not exists (select 1 from lead_contacte lc where lc.lead_id = l.id)
    and not exists (select 1 from programari_leads pl where pl.lead = l.id)
    and not exists (select 1 from sms_logs s where s.lead_id = l.id)
    and not exists (select 1 from leads_intake_log il where il.lead_id = l.id)
    and not exists (
      select 1 from lead_history h where h.lead_id = l.id and h.user_id is not null
    );
  get diagnostics v_umbre = row_count;

  return query select v_inactiv, v_exclient, v_inrolari, v_leads, v_reactivati, v_umbre;
end;
$$;

grant execute on function auto_mark_inactiv_si_exclient() to authenticated;
revoke execute on function auto_mark_inactiv_si_exclient() from anon, public;

-- ------------------------------------------------------------------
-- Backfill 1 — lead-urile REALE blocate în nurture deși clientul e activ.
-- Gardul din 20260901235500 era `id_client is null`; el proteja ex-clienții,
-- dar excludea și clienții activi, deci a sărit peste Samson Ariana și Antoche
-- Andra (venite la demo pe 26 august, mutate de cron pe 29). Aici gardul e cel
-- corect: contează statusul clientului, nu existența lui.
-- Doar mutările de cron (`user_id is null`) — deciziile de om rămân.
-- ------------------------------------------------------------------
with ultima_mutare as (
  select distinct on (h.lead_id)
    h.lead_id, h.old_value, h.user_id
  from lead_history h
  where h.action_type = 'status_change'
    and h.new_value = 'nurture'
  order by h.lead_id, h.created_at desc
),
tinta as (
  select
    u.lead_id,
    case
      when u.old_value = 'programat'
       and not exists (
             select 1 from programari_leads pl
             where pl.lead = u.lead_id and pl.data_programarii >= current_date
           )
      then 'nu_a_venit'
      else u.old_value
    end::status_lead as status_nou
  from ultima_mutare u
  join leads l on l.id = u.lead_id
  join clienti c on c.id = l.id_client
  where u.user_id is null
    and l.status = 'nurture'
    and c.status <> 'EXclient'
    and u.old_value is not null
    and u.old_value <> 'convertit'
)
update leads l
set status           = t.status_nou,
    sub_status       = null,
    nr_contactari    = 0,
    flag_reminder    = false,
    flag_streak      = 0,
    flag_reminder_at = null
from tinta t
where l.id = t.lead_id;

-- ------------------------------------------------------------------
-- Backfill 2 — umbrele pur generate ale clienților reveniți (55 la 2026-09-01).
-- Aceleași condiții ca pasul 4 din funcție; rulat o dată acum, ca pool-ul să fie
-- curat înainte de următoarea rulare a cronului.
-- ------------------------------------------------------------------
delete from leads l
using clienti c
where c.id = l.id_client
  and l.status = 'nurture'
  and c.status <> 'EXclient'
  and l.sursa is null
  and l.data_conversie is null
  and l.nr_contactari = 0
  and l.ultima_contactare_la is null
  and l.observatii is null
  and not exists (select 1 from lead_contacte lc where lc.lead_id = l.id)
  and not exists (select 1 from programari_leads pl where pl.lead = l.id)
  and not exists (select 1 from sms_logs s where s.lead_id = l.id)
  and not exists (select 1 from leads_intake_log il where il.lead_id = l.id)
  and not exists (
    select 1 from lead_history h where h.lead_id = l.id and h.user_id is not null
  );
