-- Qapp v2 — O înrolare în sezonul activ marchează clientul Activ.
--
-- Context (2026-06-29): după trecerea în sezonul nou + vacanță, clienți care
-- se înrolează din nou (ex. promo iulie, ședințe facultative) dovedesc că sunt
-- activi — dar statusul `clienti.status` era condus EXCLUSIV de prezențe
-- (auto_mark_inactiv_si_exclient, doar `Prezent` în 21/45 zile). Deci un
-- re-înrolat fără prezență încă rămânea Inactiv/EXclient până venea efectiv la curs,
-- iar cronul de noapte l-ar fi retrogradat la loc.
--
-- Soluție (două mecanisme complementare):
--   1. TRIGGER instant: la inserarea unei înrolări NEreziliate cu data_incepere în
--      sezonul ACTIV → clienti.status = 'Activ'. Gardul pe sezonul activ exclude
--      rândurile istorice din import (data_incepere în sezoane vechi) ⇒ un re-import
--      NU reactivează în masă; doar înrolările sezonului curent contează.
--   2. CRON durabil: semnal nou `are_inrolare_curenta` (înrolare nereziliată în
--      sezonul activ) → clientul NU se retrogradează și se REACTIVEAZĂ (Inactiv SAU
--      EXclient → Activ). Schimbare deliberată de regulă: înrolarea suprascrie și EXclient.
--
-- NOTĂ: nu atingem opt_out_marketing / leadul nurture la reactivare (out of scope; opt-out
-- e doar audit pentru email marketing 2027, nu blochează SMS tranzacționale). De revizuit
-- separat dacă se activează campanii bulk.

-- ============================================================
-- 1) Trigger instant pe inserare înrolare
-- ============================================================
create or replace function trg_enrollment_marcheaza_activ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season_start date;
begin
  if coalesce(new.reziliat, false) then
    return new;
  end if;
  select max(data_incepere) into v_season_start from sezoane where activ;
  -- fără sezon activ definit → comportament neutru (nu reactivăm)
  if v_season_start is not null and new.data_incepere >= v_season_start then
    update clienti
    set status = 'Activ'
    where id = new.client
      and status is distinct from 'Activ';
  end if;
  return new;
end;
$$;

drop trigger if exists enrollment_marcheaza_activ on enrollments;
create trigger enrollment_marcheaza_activ
after insert on enrollments
for each row execute function trg_enrollment_marcheaza_activ();

-- ============================================================
-- 2) Cron: înrolarea în sezonul activ = semnal de activitate
-- ============================================================
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
  -- sezonul activ; fără sezon → prag în viitor îndepărtat (nimeni nu e protejat de înrolare)
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

  -- 2. Inactiv: prezență între 21d și 45d, status era Activ, ȘI fără înrolare în sezonul activ.
  update clienti
  set status = 'Inactiv'
  where id in (
    select client_id from _last_prezent
    where coalesce(status_actual, 'Activ') = 'Activ'
      and are_inrolare_curenta = false
      and ultima_prezenta is not null
      and ultima_prezenta < v_cutoff_inactiv
      and ultima_prezenta >= v_cutoff_exclient
  );
  get diagnostics v_inactiv = row_count;

  -- 3. Reactivare → Activ: revenire la cursuri (Prezent în 21d) SAU înrolare în sezonul
  --    activ. Înrolarea reactivează și EXclient (regulă nouă 2026-06-29).
  update clienti
  set status = 'Activ'
  where id in (
    select client_id from _last_prezent
    where (
            status_actual = 'Inactiv'
            and ultima_prezenta is not null
            and ultima_prezenta >= v_cutoff_inactiv
          )
       or (
            status_actual in ('Inactiv', 'EXclient')
            and are_inrolare_curenta = true
          )
  );
  get diagnostics v_reactivati = row_count;

  return query select v_inactiv, v_exclient, v_inrolari, v_leads, v_reactivati;
end;
$$;

grant execute on function auto_mark_inactiv_si_exclient() to authenticated;

-- ============================================================
-- 3) Backfill unic: reactivează clienții care au deja o înrolare în sezonul activ.
-- ============================================================
update clienti c
set status = 'Activ'
where c.status in ('Inactiv', 'EXclient')
  and exists (
    select 1 from enrollments e
    where e.client = c.id
      and e.reziliat = false
      and e.data_incepere >= coalesce((select max(data_incepere) from sezoane where activ), '9999-12-31'::date)
  );
