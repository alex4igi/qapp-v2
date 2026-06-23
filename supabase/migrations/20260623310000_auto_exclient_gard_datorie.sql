-- Qapp v2 — Gard pe auto-EXclient: nu mai șterge datoria recuperabilă.
--
-- PROBLEMĂ: auto_mark_inactiv_si_exclient (cron zilnic 02:00) reziliază TOATE înrolările
-- active ale unui client devenit EXclient (45+ zile fără prezență), FĂRĂ să verifice datoria.
-- Reziliatul iese din worklist/SMS (toate suprafețele exclud reziliate) → datoria reală a
-- celor plecați cu restanță dispărea tăcut din recuperare (~40k RON, 234 înrolări <2 ani).
-- Încalcă regula de contract: nu se poate rezilia cu datorie.
--
-- FIX (doar pasul de reziliere se schimbă; restul funcției identic):
--   (a) lunile VIITOARE (neconsumate)         → reziliază + suma/suma_baza = 0 (nu se facturează)
--   (b) lunile consumate FĂRĂ datorie (rest≤0) → reziliază curat
--   (c) lunile consumate CU datorie (rest>0)   → NU reziliem; doar activ=false (ies din rostere),
--       reziliat rămâne false → datoria rămâne vizibilă în recuperare până la încasare.

create or replace function auto_mark_inactiv_si_exclient()
returns table (
  marcati_inactiv  int,
  marcati_exclient int,
  inrolari_reziliate int,
  leads_create     int,
  reactivati       int
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
  v_cutoff_inactiv  date := current_date - interval '21 days';
  v_cutoff_exclient date := current_date - interval '45 days';
  v_eom date := (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date;
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
    ) as ultima_prezenta
  from clienti c;

  -- 1. EXclient: ultima_prezenta este NULL sau < today - 45d, status != EXclient
  create temporary table _ex_candidati on commit drop as
  select client_id from _last_prezent
  where coalesce(status_actual, 'Activ') <> 'EXclient'
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

  -- (c) Lunile consumate CU datorie (rest > 0): NU reziliem (contract). Doar inactivăm:
  --     ies din rostere/headcount, dar datoria rămâne în worklist/SMS (reziliat = false).
  update enrollments e
  set activ = false, updated = now()
  where e.client in (select client_id from _ex_candidati)
    and e.reziliat = false
    and e.activ = true
    and coalesce(e.suma, 0)
        - coalesce((select sum(i.suma) from incasari i where i.inregistrare = e.id), 0) > 0.005;

  -- Reintegrează ca lead nurture
  update leads l
  set status = 'nurture',
      sub_status = null,
      flag_reminder = false,
      flag_reminder_at = null,
      flag_streak = 0,
      motiv_pierdut = null
  where l.id_client in (select client_id from _ex_candidati)
    and l.status <> 'nurture';

  insert into leads (nume, prenume, telefon, email, data_nasterii, status, id_client)
  select c.nume, c.prenume, c.telefon, c.email, c.data_nasterii, 'nurture', c.id
  from clienti c
  where c.id in (select client_id from _ex_candidati)
    and not exists (select 1 from leads l where l.id_client = c.id);
  get diagnostics v_leads = row_count;

  -- 2. Inactiv: ultima_prezenta < today - 21d ȘI >= today - 45d, status era Activ
  update clienti
  set status = 'Inactiv'
  where id in (
    select client_id from _last_prezent
    where coalesce(status_actual, 'Activ') = 'Activ'
      and ultima_prezenta is not null
      and ultima_prezenta < v_cutoff_inactiv
      and ultima_prezenta >= v_cutoff_exclient
  );
  get diagnostics v_inactiv = row_count;

  -- 3. Reactivare auto Inactiv → Activ când clientul revine (Prezent în 21d)
  update clienti
  set status = 'Activ'
  where id in (
    select client_id from _last_prezent
    where status_actual = 'Inactiv'
      and ultima_prezenta is not null
      and ultima_prezenta >= v_cutoff_inactiv
  );
  get diagnostics v_reactivati = row_count;

  return query select v_inactiv, v_exclient, v_inrolari, v_leads, v_reactivati;
end;
$$;

grant execute on function auto_mark_inactiv_si_exclient() to authenticated;
