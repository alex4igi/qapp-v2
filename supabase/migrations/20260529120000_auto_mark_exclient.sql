-- Qapp v2 — Auto-marcare Inactiv (21d global) + EXclient (45d global).
--
-- Definiție business (confirmat 2026-05-29):
-- Pragurile sunt globale (peste toate înrolările clientului). Doar `Prezent` contează.
--   * Inactiv  = ultima prezență Prezent < today - 21 zile (dar >= today - 45 zile)
--   * EXclient = ultima prezență Prezent < today - 45 zile (sau niciodată Prezent)
--   * Activ    = există Prezent în ultimele 21 zile
--
-- IMPORTANT: „Inactiv" per-grupă (din dashboard, doar Prezent în 21d la grupa X)
-- e DIFERIT — acela rămâne calcul on-demand pentru UI, nu se persistă.
-- Statusul DB e dimensiunea GLOBALĂ (peste toate grupele).
--
-- Side effects pe tranziție → EXclient:
--   1. opt_out_marketing = true (trigger existent setează asta)
--   2. Reziliază înrolările active
--   3. Reintegrează ca lead Nurture (pool reactivare; opt-out blochează doar campanii
--      bulk în 2027+, nu SMS tranzacționale)
--
-- Tranziția Inactiv → Activ se face AUTOMAT dacă clientul revine la cursuri.
-- Tranziția EXclient → Activ NU se face automat — recepția decide manual (reactivare).

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
  v_leads int := 0;
  v_reactivati int := 0;
  v_cutoff_inactiv  date := current_date - interval '21 days';
  v_cutoff_exclient date := current_date - interval '45 days';
begin
  -- Snapshot: pentru fiecare client (cu status diferit de EXclient sau Activ care vine
  -- la curs), calculează ultima prezență Prezent peste toate înrolările lui.
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

  -- Reziliază înrolările active ale noilor EXclient
  update enrollments
  set reziliat = true,
      activ = false,
      updated = now()
  where client in (select client_id from _ex_candidati)
    and reziliat = false;
  get diagnostics v_inrolari = row_count;

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
  -- NU se aplică pe EXclient — recepția decide manual reactivarea.
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

-- ============================================================
-- pg_cron — zilnic la 02:00 UTC
-- ============================================================
select cron.unschedule(jobid)
  from cron.job where jobname = 'auto-mark-exclient';

select cron.unschedule(jobid)
  from cron.job where jobname = 'auto-mark-inactiv-si-exclient';

select cron.schedule(
  'auto-mark-inactiv-si-exclient',
  '0 2 * * *',
  $$select auto_mark_inactiv_si_exclient();$$
);
