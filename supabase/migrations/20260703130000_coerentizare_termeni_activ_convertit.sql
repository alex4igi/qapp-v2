-- Coerentizare termeni „activ" / „convertit" (audit user 2026-07-03).
--
-- Verificare pe date reale (6107 clienți, 40220 înrolări) a arătat:
--   1. get_mrr_trend (azi, 20260703120000) filtra pe e.activ=true ÎN PLUS față de
--      overlap-ul pe interval — 3777 înrolări nereziliate Per lună/Per an au
--      activ=false (flagul nu se curăță după luna curentă) și erau EXCLUSE din
--      MRR-ul lunii lor proprii, concentrat masiv în ultimele 9 luni.
--   2. auto_mark_inactiv_si_exclient folosea fereastra de prezență cu graniță
--      inclusivă (>= azi-21) față de fereastra STRICTĂ (> azi-21) standardizată
--      în 20260702120000 pentru clienti_activi_la — 2 clienți reali divergeau
--      chiar azi (ultima prezență exact acum 21 zile).
--   3. get_grupe_client (portal) folosea e.activ (același flag nesigur) și nu
--      verifica data_incepere <= azi — 1 înrolare viitoare cu activ=true ar fi
--      apărut ca grupă curentă în portal.
--   4. get_lead_funnel calcula s_convertit din id_client IS NOT NULL, dar
--      attachClientToLead leagă intenționat clientul ÎNAINTE de conversie (vezi
--      comentariul din api.ts) — un lead cu client atașat dar neconvertit era
--      numărat convertit în funnel, nu în get_conversie_leads/LeadReports.
--      Decis cu user: status='convertit' e sursa unică de adevăr.

-- ============================================================
-- 1) get_mrr_trend — nu mai depinde de enrollments.activ, doar overlap pe interval.
-- ============================================================
create or replace function get_mrr_trend(
  p_from    date,
  p_to      date,
  p_locatie uuid default null
)
returns table (
  luna                text,
  mrr_recurent        numeric,
  mrr_facultativ      numeric,
  enrolari_recurent   int,
  enrolari_facultativ int
)
language sql
stable
security invoker
set search_path = public
as $$
  with months as (
    select to_char(gs, 'YYYY-MM') as luna,
           gs::date as m_start,
           (gs + interval '1 month' - interval '1 day')::date as m_end
    from generate_series(
      date_trunc('month', p_from),
      date_trunc('month', p_to),
      interval '1 month'
    ) gs
  ),
  rec as (
    select e.id, e.tip_plata, e.suma, e.data_incepere, e.data_final,
           coalesce(c.facultativ, false) as facultativ
    from enrollments e
    join cursuri c on c.id = e.cursul
    where e.reziliat = false
      and e.tip_plata in ('Per luna', 'Per an')
      and (p_locatie is null or c.locatie = p_locatie)
  )
  select m.luna,
         coalesce(sum(case when not r.facultativ
             then (case r.tip_plata when 'Per an' then coalesce(r.suma, 0) / 12.0 else coalesce(r.suma, 0) end)
             else 0 end), 0) as mrr_recurent,
         coalesce(sum(case when r.facultativ
             then (case r.tip_plata when 'Per an' then coalesce(r.suma, 0) / 12.0 else coalesce(r.suma, 0) end)
             else 0 end), 0) as mrr_facultativ,
         count(case when not r.facultativ then r.id end)::int as enrolari_recurent,
         count(case when r.facultativ then r.id end)::int as enrolari_facultativ
  from months m
  left join rec r on r.data_incepere <= m.m_end
                 and (r.data_final is null or r.data_final >= m.m_start)
  where is_admin()
  group by m.luna
  order by m.luna;
$$;

-- ============================================================
-- 2) auto_mark_inactiv_si_exclient — fereastra de prezență 21z aliniată la
--    strict (> azi-21), ca la clienti_activi_la. Pragul de 45z (EXclient) și
--    are_inrolare_curenta rămân neschimbate (concept administrativ separat).
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

-- ============================================================
-- 3) get_grupe_client (portal) — nu mai depinde de enrollments.activ; verifică
--    explicit data_incepere <= azi (nu doar data_final >= azi).
-- ============================================================
create or replace function get_grupe_client(p_client uuid)
returns table (
  enrollment_id uuid,
  curs_id uuid,
  curs_nume text,
  nivel nivel_curs,
  varsta varsta_curs,
  stil text,
  locatie_nume text,
  sala text,
  zile zi_saptamana[],
  ora text,
  tip_plata tip_plata,
  data_incepere date,
  data_final date,
  instructori text[]
)
language sql stable security definer set search_path = public as $$
  select
    e.id, c.id, c.numele, c.nivelul, c.varsta, c.stil, l.nume, c.sala,
    c.zile, c.ora, e.tip_plata, e.data_incepere::date, e.data_final::date,
    coalesce(
      (select array_agg(distinct t.nume order by t.nume)
       from (
         select teacher_id as tid from cursuri_teacheri where curs_id = c.id
         union
         select c.teacher where c.teacher is not null
       ) src
       join teacheri t on t.id = src.tid),
      '{}'::text[]
    )
  from enrollments e
  join cursuri c on c.id = e.cursul
  left join locatii l on l.id = c.locatie
  where e.client = p_client
    and p_client in (select client_member_ids())
    and e.reziliat = false
    and e.data_incepere::date <= current_date
    and (e.data_final is null or e.data_final::date >= current_date)
  order by c.numele;
$$;

-- ============================================================
-- 4) get_lead_funnel — „convertit" e status='convertit', nu id_client IS NOT NULL
--    (attachClientToLead leagă clientul înainte de conversie, intenționat).
-- ============================================================
create or replace function get_lead_funnel(
  p_from    date,
  p_to      date,
  p_locatie text default null
)
returns table (
  sursa_id           uuid,
  sursa_nume         text,
  leads_total        integer,
  contactati         integer,
  proba              integer,
  prezenti           integer,
  convertiti         integer,
  retentie_eligibili integer,
  retentie_90z       integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with baza as (
    select
      l.sursa,
      (l.nr_contactari > 0 or l.ultima_contactare_la is not null
        or l.status <> 'nou')                                     as s_contact,
      (l.data_programare is not null
        or exists (select 1 from programari_leads pl
                   where pl.lead = l.id))                          as s_proba,
      (l.status = 'a_venit'
        or exists (select 1 from programari_leads pl
                   where pl.lead = l.id and pl.prezenta = 'prezent')) as s_prezent,
      (l.status = 'convertit')                                    as s_convertit,
      (l.status = 'convertit' and l.data_conversie is not null
        and l.data_conversie::date <= current_date - 90)          as s_matur,
      (l.status = 'convertit' and l.data_conversie is not null
        and l.data_conversie::date <= current_date - 90
        and exists (
          select 1
          from enrollments e
          join prezente p on p.enrollment = e.id
          where e.client = l.id_client
            and e.reziliat = false
            and p.status = 'Prezent'
            and p.data >= l.data_conversie::date + 90
        ))                                                        as s_retinut
    from leads l
    where l.created::date between p_from and p_to
      and l.status <> 'nurture'
      and (p_locatie is null or l.locatia = p_locatie)
  )
  select
    b.sursa                                            as sursa_id,
    coalesce(c.nume, 'Necunoscută')                    as sursa_nume,
    count(*)::int                                      as leads_total,
    count(*) filter (where b.s_contact or b.s_proba or b.s_prezent
                        or b.s_convertit)::int          as contactati,
    count(*) filter (where b.s_proba or b.s_prezent
                        or b.s_convertit)::int          as proba,
    count(*) filter (where b.s_prezent or b.s_convertit)::int as prezenti,
    count(*) filter (where b.s_convertit)::int          as convertiti,
    count(*) filter (where b.s_matur)::int              as retentie_eligibili,
    count(*) filter (where b.s_retinut)::int            as retentie_90z
  from baza b
  left join campanii_promovare c on c.id = b.sursa
  group by b.sursa, c.nume
  order by leads_total desc;
$$;
