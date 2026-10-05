-- Statusul clientului rămâne pe două trepte: Activ / EXclient (Alex, 05.10.2026). „Inactiv" (21–45 de zile)
-- nu prindea pe nimeni în timpul sezonului, iar absențele le acoperă jurnalul „Absenți 21 zile" (recurente)
-- și „Au venit recent" din roster (facultative). Valoarea rămâne în enum (e comun cu portalul), dar nu se mai
-- poate scrie.
--
-- Condiția reparată: „are înrolare în sezonul activ" devine „are acces azi sau în viitor". Înainte, orice rând
-- din sezon — o singură ședință de facultativ din septembrie, sau luna de septembrie a unui reînscris care a
-- reziliat apoi — ținea clientul Activ până în iunie, deci nu ajungea niciodată în Nurture.

create or replace function public.auto_mark_exclient()
returns table(marcati_exclient integer, inrolari_reziliate integer, leads_create integer, reactivati integer, umbre_curatate integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_exclient int := 0;
  v_inrolari int := 0;
  v_fut int := 0;
  v_paid int := 0;
  v_leads int := 0;
  v_reactivati int := 0;
  v_umbre int := 0;
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
    ) as ultima_prezenta,
    -- Acces azi sau în viitor: abonament care acoperă ziua de azi sau o lună viitoare (inclusiv reînscrierea
    -- pe sezonul următor), ori o ședință rezervată de azi încolo.
    exists (
      select 1 from enrollments e
      where e.client = c.id
        and e.reziliat = false
        and (
          (e.tip_plata <> 'Per sedinta' and coalesce(e.data_final, 'infinity'::date) >= current_date)
          or (e.tip_plata = 'Per sedinta' and e.data_incepere >= current_date)
        )
    ) as are_acces
  from clienti c;

  -- 1. EXclient: fără prezență în 45 de zile (sau niciodată) ȘI fără acces.
  create temporary table _ex_candidati on commit drop as
  select client_id from _last_prezent
  where coalesce(status_actual, 'Activ') <> 'EXclient'
    and are_acces = false
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

  -- (c) Lunile consumate CU datorie (rest > 0): NU reziliem (contract). Doar inactivăm rândul.
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

  insert into leads (nume, prenume, telefon, email, data_nasterii, status, id_client)
  select c.nume, c.prenume, c.telefon, c.email, c.data_nasterii, 'nurture', c.id
  from clienti c
  where c.id in (select client_id from _ex_candidati)
    and not exists (
      select 1 from leads l
      where l.id_client = c.id and l.status = 'nurture'
    );
  get diagnostics v_leads = row_count;

  -- 2. Reactivare EXclient → Activ: are din nou acces.
  update clienti
  set status = 'Activ'
  where id in (
    select client_id from _last_prezent
    where status_actual = 'EXclient' and are_acces = true
  );
  get diagnostics v_reactivati = row_count;

  -- 3. Umbrele fără obiect: clientul nu mai e EXclient, deci nu e țintă de reactivare. Se rulează pe tot
  --    tabelul, fiindcă statusul se schimbă și din `inrolare_marcheaza_activ`. Un lead lucrat (sunat,
  --    programat, atins manual) rămâne.
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

  return query select v_exclient, v_inrolari, v_leads, v_reactivati, v_umbre;
end;
$function$;

revoke execute on function public.auto_mark_exclient() from public, anon, authenticated;
grant execute on function public.auto_mark_exclient() to service_role;

update clienti set status = 'Activ' where status = 'Inactiv';

alter table clienti
  add constraint clienti_status_fara_inactiv check (status is distinct from 'Inactiv');

select cron.unschedule('auto-mark-inactiv-si-exclient');
select cron.schedule('auto-mark-exclient', '0 2 * * *', 'select auto_mark_exclient();');

drop function public.auto_mark_inactiv_si_exclient();
