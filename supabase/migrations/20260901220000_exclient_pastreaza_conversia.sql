-- Qapp v2 — ex-clientul nu mai șterge conversia din care a venit.
--
-- Bug: când un client devenea EXclient, `auto_mark_inactiv_si_exclient` rescria
-- statusul lead-ului lui în 'nurture', inclusiv pe cele 'convertit'. Conversia
-- e un fapt istoric — rescrisă, dispărea din pâlnie: `get_lead_funnel` &co.
-- filtrează `status <> 'nurture'`, deci leadul ieșea și din `leads_total`, și
-- din `convertiti`. Efect: rata de conversie a unei campanii din iulie se
-- schimba retroactiv în septembrie, când copilul nu mai venea peste vară.
-- 11 conversii erau deja rescrise (din 67 existente = 14% din istoric).
--
-- Fix: leadul convertit rămâne convertit, iar reintegrarea în pool-ul de
-- reactivare se face printr-un RÂND NOU de nurture pentru client. Cele două
-- fapte („s-a convertit în iulie" și „e recuperabil din septembrie") sunt
-- despre momente diferite și nu mai încap într-un singur `status`.
-- `insertLead` (intake) deduplică pe telefon cu `.limit(1).maybeSingle()`, deci
-- al doilea rând nu rupe importul Meta/site.

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

  return query select v_inactiv, v_exclient, v_inrolari, v_leads, v_reactivati;
end;
$$;

revoke execute on function auto_mark_inactiv_si_exclient() from anon, public;

-- ------------------------------------------------------------------
-- Backfill: cele 11 conversii deja rescrise se întorc în 'convertit'.
-- `data_conversie is not null` e dovada că trecerea prin 'convertit' a avut loc;
-- niciuna n-a fost mutată de un om (verificat în lead_history: 5 de cron, 6 fără
-- intrare de istoric, 0 manuale).
-- ------------------------------------------------------------------
update leads
set status = 'convertit',
    sub_status = null
where status = 'nurture'
  and data_conversie is not null
  and id_client is not null;

-- Ex-clienții rămași fără rând de nurture după restaurare îl primesc acum.
insert into leads (nume, prenume, telefon, email, data_nasterii, status, id_client)
select c.nume, c.prenume, c.telefon, c.email, c.data_nasterii, 'nurture', c.id
from clienti c
where c.status = 'EXclient'
  and exists (select 1 from leads l where l.id_client = c.id)
  and not exists (
    select 1 from leads l where l.id_client = c.id and l.status = 'nurture'
  );
