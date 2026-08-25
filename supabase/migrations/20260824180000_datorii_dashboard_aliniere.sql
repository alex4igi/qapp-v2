-- Qapp v2 — Dashboard Datorii (/datorii) + ALINIEREA tuturor suprafețelor de restanțe.
--
-- Problema: 5 căi de agregare divergente (prescrise incluse/excluse, reziliate
-- incluse/excluse, one-off lipsă peste tot) + o gaură de definiție: înrolările
-- facturate în VIITOR (ex. septembrie creat la reînscriere în august) apăreau cu
-- rest > 0 în /financiar și în totalul worklist/SMS. Regulă de business (user,
-- 2026-08-24): restanța = luni curente și trecute, NU cele facturate în viitor.
--
-- Definiția canonică (unică): rest > 0 AND reziliat = false AND NOT prescris
-- (data_incepere ≥ azi − 2 ani) AND NOT viitor (luna facturată ≤ luna curentă),
-- plus datoriile one-off din datorii_rest. Prescris = KPI separat. Viitor = nu e
-- datorie deloc („de plată în avans" — fluxurile de plată rămân neatinse).
--
-- Conținut:
--   1. plati_inrolari + flag `viitor` (sursa unică; view-ul rămâne NEfiltrat)
--   2. restante_*_luna + statistica_restante_totale derivate din plati_inrolari
--      (+ coloana total_restant_net); de_incasat/incasat_pe_luna exclud reziliat (bug)
--   3. client_contacte.promisiune_data (follow-up „promisiune de plată")
--   4. get_restante_worklist: fără viitor + expune ultima promisiune
--   5. get_sms_recipients: notificare_restante fără viitor (tandem cu worklist!)
--   6. get_restante_aging: gate staff (era is_admin) + fără viitor
--   7. get_kpis_financiar / get_client_restante / get_scorecard_restante /
--      get_sold_familie: fără viitor
--   8. get_datorii_dashboard (agregatul canonic, per locație) — înlocuiește
--      get_restante_totale (mort, DROP aici)
--   9. get_datorii_evolutie (sold restant la finalul fiecărei luni)

-- ============================================================
-- 1. plati_inrolari + flag `viitor` (coloană APPENDATĂ — create or replace e legal)
-- ============================================================
create or replace view plati_inrolari as
select
  row_number() over () as id,
  cl.id as id_cursant,
  cl.nume as nume_client,
  cl.prenume as prenume_client,
  cl.familia as id_familie,
  c.numele as nume_curs,
  c.id as id_curs,
  l.id as id_locatie,
  l.nume as nume_locatie,
  e.id as id_enrollment,
  e.data_incepere,
  e.tip_plata,
  e.suma_baza,
  e.politica_discount,
  e.voucher as id_voucher,
  v.cod_voucher,
  e.suma as total_de_plata,
  sum(i.suma) as platit,
  coalesce(e.suma, 0) - coalesce(sum(i.suma), 0) as rest,
  -- prescris: scadența ratei (≈ data_incepere) e mai veche de 2 ani
  (e.data_incepere < (current_date - interval '2 years')) as prescris,
  max(coalesce(i.data, i.created::date)) as data_platii,
  -- viitor: luna facturată e DUPĂ luna curentă → nu e restanță, e plată în avans
  (e.data_incepere >= (date_trunc('month', current_date) + interval '1 month')::date) as viitor
from enrollments e
left join incasari i on i.inregistrare = e.id
left join clienti cl on cl.id = e.client
left join cursuri c on c.id = e.cursul
left join sali s on s.id = c.sala
left join locatii l on l.id = s.locatie
left join vouchere v on v.id = e.voucher
where e.reziliat = false
group by e.id, cl.id, c.id, l.id, v.cod_voucher
order by e.data_incepere desc;

alter view plati_inrolari set (security_invoker = true);

-- ============================================================
-- 2. View-urile lunare — derivate din plati_inrolari (un singur loc pentru
--    rest/prescris/viitor; plati_inrolari e deja agregat per înrolare → fără fan-out).
--    Coloanele vechi rămân identice; se ADAUGĂ total_restant_net (definiția canonică).
-- ============================================================
drop view if exists restante_curs_luna;
drop view if exists restante_locatie_luna;
drop view if exists restante_sala_luna;
drop view if exists restante_teacher_luna;
drop view if exists statistica_restante_totale;

create view restante_curs_luna as
select
  row_number() over () as id,
  pi.id_curs,
  pi.nume_curs,
  to_char(pi.data_incepere, 'YYYY-MM') as luna,
  coalesce(sum(pi.platit), 0) as total_incasat,
  sum(coalesce(pi.total_de_plata, 0)) as total_de_incasat,
  coalesce(sum(pi.rest) filter (where pi.rest > 0 and not pi.prescris and not pi.viitor), 0) as total_restant_net
from plati_inrolari pi
group by pi.id_curs, pi.nume_curs, to_char(pi.data_incepere, 'YYYY-MM');

create view restante_locatie_luna as
select
  row_number() over () as id,
  pi.id_locatie,
  pi.nume_locatie,
  to_char(pi.data_incepere, 'YYYY-MM') as luna,
  coalesce(sum(pi.platit), 0) as total_incasat,
  sum(coalesce(pi.total_de_plata, 0)) as total_de_incasat,
  coalesce(sum(pi.rest) filter (where pi.rest > 0 and not pi.prescris and not pi.viitor), 0) as total_restant_net
from plati_inrolari pi
group by pi.id_locatie, pi.nume_locatie, to_char(pi.data_incepere, 'YYYY-MM');

create view restante_sala_luna as
select
  row_number() over () as id,
  s.id as id_sala,
  s.nume as nume_sala,
  to_char(pi.data_incepere, 'YYYY-MM') as luna,
  coalesce(sum(pi.platit), 0) as total_incasat,
  sum(coalesce(pi.total_de_plata, 0)) as total_de_incasat,
  coalesce(sum(pi.rest) filter (where pi.rest > 0 and not pi.prescris and not pi.viitor), 0) as total_restant_net
from plati_inrolari pi
left join cursuri c on c.id = pi.id_curs
left join sali s on s.id = c.sala
group by s.id, s.nume, to_char(pi.data_incepere, 'YYYY-MM');

create view restante_teacher_luna as
select
  row_number() over () as id,
  t.id as id_teacher,
  format('%s %s', t.prenume, t.nume) as nume_teacher,
  to_char(pi.data_incepere, 'YYYY-MM') as luna,
  coalesce(sum(pi.platit), 0) as total_incasat,
  sum(coalesce(pi.total_de_plata, 0)) as total_de_incasat,
  coalesce(sum(pi.rest) filter (where pi.rest > 0 and not pi.prescris and not pi.viitor), 0) as total_restant_net
from plati_inrolari pi
left join cursuri c on c.id = pi.id_curs
left join teacheri t on t.id = c.teacher
group by t.id, t.prenume, t.nume, to_char(pi.data_incepere, 'YYYY-MM');

create view statistica_restante_totale as
select
  to_char(pi.data_incepere, 'YYYY-MM') as id,
  sum(coalesce(pi.total_de_plata, 0)) as total,
  coalesce(sum(pi.platit), 0) as incasat,
  coalesce(sum(pi.rest) filter (where pi.rest > 0 and not pi.prescris and not pi.viitor), 0) as restant_net
from plati_inrolari pi
group by to_char(pi.data_incepere, 'YYYY-MM')
order by 1 asc;

alter view restante_curs_luna set (security_invoker = true);
alter view restante_locatie_luna set (security_invoker = true);
alter view restante_sala_luna set (security_invoker = true);
alter view restante_teacher_luna set (security_invoker = true);
alter view statistica_restante_totale set (security_invoker = true);

-- de_incasat/incasat_pe_luna: excludeau reziliatele doar în perechea restante_* —
-- aliniere (o înrolare reziliată nu mai e nici sold, nici încasare de urmărit pe lună).
create or replace view de_incasat_pe_luna as
select
  row_number() over () as id,
  to_char(e.data_incepere, 'YYYY-MM') as luna,
  e.cursul as curs,
  sum(e.suma) as de_incasat,
  c.teacher,
  c.sala,
  s.locatie
from enrollments e
join cursuri c on c.id = e.cursul
join sali s on s.id = c.sala
where e.reziliat = false
group by to_char(e.data_incepere, 'YYYY-MM'), e.cursul, c.teacher, c.sala, s.locatie;

create or replace view incasat_pe_luna as
select
  row_number() over () as id,
  to_char(e.data_incepere, 'YYYY-MM') as luna,
  e.cursul as curs,
  sum(i.suma) as incasat,
  c.teacher,
  c.sala,
  s.locatie
from incasari i
join enrollments e on e.id = i.inregistrare
join cursuri c on c.id = e.cursul
join sali s on s.id = c.sala
where e.reziliat = false
group by to_char(e.data_incepere, 'YYYY-MM'), e.cursul, c.teacher, c.sala, s.locatie;

alter view de_incasat_pe_luna set (security_invoker = true);
alter view incasat_pe_luna set (security_invoker = true);

-- ============================================================
-- 3. Promisiune de plată — pe contactul de recuperare (suma_promisa exista deja)
-- ============================================================
alter table client_contacte add column if not exists promisiune_data date;

create index if not exists client_contacte_promisiune_idx
  on client_contacte(client_id, promisiune_data desc)
  where promisiune_data is not null and scop = 'recuperare';

-- ============================================================
-- 4. get_restante_worklist — fără viitor + ultima promisiune
--    (return type se schimbă → drop obligatoriu)
-- ============================================================
drop function if exists get_restante_worklist(uuid, uuid, date);

create function get_restante_worklist(
  p_locatie uuid default null,
  p_sezon   uuid default null,
  p_luna    date default null
)
returns table (
  client_id uuid,
  nume text,
  prenume text,
  telefon text,
  nume_locatie text,
  rest_total numeric,
  nr_rate_neachitate int,
  zile_depasire int,
  ultima_prezenta date,
  ultim_apel_at timestamptz,
  ultim_apel_rezultat text,
  promisiune_data date,
  promisiune_suma numeric,
  promisiune_logata_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with baza as (
    select
      pi.id_cursant as client_id,
      pi.id_locatie,
      pi.nume_locatie,
      pi.rest,
      pi.data_incepere,
      case
        when sz.scadenta_prima_rata is not null
             and date_trunc('month', pi.data_incepere) = date_trunc('month', sz.data_incepere)
          then sz.scadenta_prima_rata
        when sz.scadenta_ultima_rata is not null
             and date_trunc('month', pi.data_incepere) = date_trunc('month', sz.data_final)
          then sz.scadenta_ultima_rata
        else (date_trunc('month', pi.data_incepere)::date + 14)
      end as scadenta
    from plati_inrolari pi
    join enrollments e on e.id = pi.id_enrollment
    left join sezoane sz on sz.id = e.sezon_id
    where pi.id_cursant is not null
      and pi.rest > 0
      and pi.prescris = false          -- datoriile prescrise nu se mai recuperează
      and pi.viitor = false            -- lunile facturate în viitor nu sunt restanță
      and e.reziliat = false
      and (p_locatie is null or pi.id_locatie = p_locatie)
      and (p_sezon is null or e.sezon_id = p_sezon)   -- aliniere cu get_sms_recipients
  ),
  agg as (
    select client_id,
      max(nume_locatie) as nume_locatie,
      sum(rest) as rest_total,
      count(*)::int as nr_rate_neachitate,
      max((current_date - scadenta)::int) as zile_depasire,
      bool_or(p_luna is not null and date_trunc('month', data_incepere) = date_trunc('month', p_luna)) as are_luna_ceruta
    from baza
    group by client_id
    having max((current_date - scadenta)::int) >= 1   -- cel puțin o rată chiar depășită
  )
  select
    a.client_id,
    cl.nume,
    cl.prenume,
    coalesce(nullif(trim(cl.telefon), ''), cl.telefonul_2) as telefon,
    a.nume_locatie,
    round(a.rest_total) as rest_total,
    a.nr_rate_neachitate,
    a.zile_depasire,
    (select max(p.data) from prezente p where p.client = a.client_id and p.status = 'Prezent') as ultima_prezenta,
    lc.ultim_apel_at,
    lc.ultim_apel_rezultat,
    lp.promisiune_data,
    lp.promisiune_suma,
    lp.promisiune_logata_at
  from agg a
  join clienti cl on cl.id = a.client_id
  left join lateral (
    select cc.created as ultim_apel_at, cc.rezultat::text as ultim_apel_rezultat
    from client_contacte cc
    where cc.client_id = a.client_id and cc.scop = 'recuperare'
    order by cc.created desc
    limit 1
  ) lc on true
  left join lateral (
    select cc.promisiune_data, cc.suma_promisa as promisiune_suma, cc.created as promisiune_logata_at
    from client_contacte cc
    where cc.client_id = a.client_id and cc.scop = 'recuperare' and cc.promisiune_data is not null
    order by cc.created desc
    limit 1
  ) lp on true
  where cl.status = 'Activ'
    and (p_luna is null or a.are_luna_ceruta)
  order by a.zile_depasire desc nulls last, a.rest_total desc;
$$;

-- ============================================================
-- 5. get_sms_recipients — notificare_restante fără viitor (TANDEM cu worklist:
--    sumele SMS trebuie să fie identice cu rest_total din worklist).
--    avertisment_loc (zile_dep > 50) și reminder_plata (luna curentă) exclud
--    viitorul implicit; mesaj_liber nu depinde de rest → doar ramura default se schimbă.
-- ============================================================
create or replace function get_sms_recipients(
  p_locatie uuid default null,
  p_sezon uuid default null,
  p_cod text default 'notificare_restante'
)
returns table (
  familia_id      uuid,
  telefon         text,
  nume_locatie    text,
  scadenta        date,
  membri          jsonb,
  total_restanta  numeric,
  zile_depasire   int,
  client_ids      uuid[]
)
language sql
stable
security invoker
set search_path = public
as $$
  with baza as (
    select
      pi.id_familie,
      pi.id_cursant,
      trim(pi.nume_client || ' ' || coalesce(pi.prenume_client, '')) as nume_complet,
      pi.nume_locatie,
      pi.rest,
      pi.viitor,
      pi.data_incepere,
      e.activ,
      e.data_final,
      case
        when sz.scadenta_prima_rata is not null
             and date_trunc('month', pi.data_incepere) = date_trunc('month', sz.data_incepere)
          then sz.scadenta_prima_rata
        when sz.scadenta_ultima_rata is not null
             and date_trunc('month', pi.data_incepere) = date_trunc('month', sz.data_final)
          then sz.scadenta_ultima_rata
        else (date_trunc('month', pi.data_incepere)::date + 14)
      end as scadenta
    from plati_inrolari pi
    join enrollments e on e.id = pi.id_enrollment
    left join sezoane sz on sz.id = e.sezon_id
    where pi.id_cursant is not null
      and pi.prescris = false          -- nu trimite remindere pentru datorii prescrise
      and (p_locatie is null or pi.id_locatie = p_locatie)
      and (p_sezon is null or e.sezon_id = p_sezon)
  ),
  baza2 as (
    select *, (current_date - scadenta)::int as zile_dep from baza
  ),
  filtrat as (
    select * from baza2
    where case
      when p_cod = 'avertisment_loc' then rest > 0 and zile_dep > 50
      when p_cod = 'reminder_plata' then
        rest > 0
        and date_trunc('month', data_incepere) = date_trunc('month', current_date)
        and current_date <= scadenta
      when p_cod = 'mesaj_liber' then
        activ = true and (data_final is null or data_final >= current_date)
      else rest > 0 and not viitor  -- notificare_restante: fără luni facturate în viitor
    end
  ),
  per_client as (
    select
      coalesce(f.id_familie, f.id_cursant) as grup_id,
      f.id_familie,
      f.id_cursant,
      max(f.nume_complet) as nume,
      max(f.nume_locatie) as nume_locatie,
      max(f.scadenta) as scadenta,
      sum(f.rest) as rest_membru,
      max(f.zile_dep) as zile_dep
    from filtrat f
    group by f.id_familie, f.id_cursant
    -- aliniere worklist (doar notificare_restante/default): min. o rată chiar depășită
    having p_cod in ('avertisment_loc', 'reminder_plata', 'mesaj_liber')
        or max(f.zile_dep) >= 1
  ),
  calificati as (
    select pc.*,
      coalesce(nullif(trim(cl.telefon), ''), nullif(trim(cl.telefonul_2), '')) as telefon_membru
    from per_client pc
    join clienti cl on cl.id = pc.id_cursant
    -- aliniere worklist (doar notificare_restante/default): doar clienți Activi
    where p_cod in ('avertisment_loc', 'reminder_plata', 'mesaj_liber')
       or cl.status = 'Activ'
  )
  select
    c.grup_id as familia_id,
    coalesce(
      nullif(trim(fam.telefon), ''),
      nullif(trim(fam.telefon_2), ''),
      max(c.telefon_membru)
    ) as telefon,
    max(c.nume_locatie) as nume_locatie,
    max(c.scadenta) as scadenta,
    jsonb_agg(
      jsonb_build_object('nume', c.nume, 'rest', round(c.rest_membru))
      order by c.nume
    ) as membri,
    round(sum(c.rest_membru)) as total_restanta,
    max(c.zile_dep) as zile_depasire,
    array_agg(c.id_cursant) as client_ids
  from calificati c
  left join familii fam on fam.id = c.id_familie
  group by c.grup_id, c.id_familie, fam.telefon, fam.telefon_2
  order by total_restanta desc nulls last;
$$;

-- ============================================================
-- 6. get_restante_aging — gate staff (era is_admin, acum îl folosește și /datorii
--    pentru manager/front_desk) + fără viitor (umfla bucketul „Nescadent")
-- ============================================================
create or replace function get_restante_aging(p_locatie uuid default null)
returns table (
  bucket text,
  total  numeric,
  nr     int
)
language sql
stable
security invoker
set search_path = public
as $$
  with per_enroll as (
    select
      coalesce(e.suma, 0)
        - coalesce((select sum(i.suma) from incasari i where i.inregistrare = e.id), 0) as rest,
      -- scadența canonică a ratei (paritate get_sms_recipients, 20260608150000)
      (current_date - case
        when sz.scadenta_prima_rata is not null
             and date_trunc('month', e.data_incepere) = date_trunc('month', sz.data_incepere)
          then sz.scadenta_prima_rata
        when sz.scadenta_ultima_rata is not null
             and date_trunc('month', e.data_incepere) = date_trunc('month', sz.data_final)
          then sz.scadenta_ultima_rata
        else (date_trunc('month', e.data_incepere)::date + 14)
      end) as varsta_zile,
      (e.data_incepere < (current_date - interval '2 years')) as prescris,
      (e.data_incepere >= (date_trunc('month', current_date) + interval '1 month')::date) as viitor
    from enrollments e
    left join sezoane sz on sz.id = e.sezon_id
    left join cursuri c on c.id = e.cursul
    left join sali s on s.id = c.sala
    where e.reziliat = false
      and e.data_incepere is not null
      and (p_locatie is null or s.locatie = p_locatie)
  ),
  flagged as (
    select rest,
      case
        when varsta_zile < 0 then 'Nescadent'
        when varsta_zile <= 30 then '0-30'
        when varsta_zile <= 60 then '31-60'
        when varsta_zile <= 90 then '61-90'
        else '90+'
      end as bucket
    from per_enroll
    where rest > 0 and not prescris and not viitor
  )
  select b.bucket,
         coalesce(sum(f.rest), 0) as total,
         count(f.rest)::int as nr
  from (values ('Nescadent'), ('0-30'), ('31-60'), ('61-90'), ('90+')) b(bucket)
  left join flagged f on f.bucket = b.bucket
  where auth_role() in ('owner', 'admin', 'manager', 'front_desk')
  group by b.bucket
  order by array_position(array['Nescadent','0-30','31-60','61-90','90+'], b.bucket);
$$;

-- ============================================================
-- 7a. get_kpis_financiar — termenul restante fără viitor
-- ============================================================
create or replace function get_kpis_financiar(
  p_from    date,
  p_to      date,
  p_locatie uuid default null
)
returns table (
  incasari   numeric,
  cheltuieli numeric,
  restante   numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce((
      select sum(i.suma) from incasari i
      where i.data between p_from and p_to
        and (p_locatie is null or i.locatie = p_locatie)
    ), 0) as incasari,
    coalesce((
      select sum(ch.valoare) from cheltuieli ch
      where ch.data between p_from and p_to
      -- cheltuieli fără dimensiune de locație → global (Profit = „tot clubul")
    ), 0) as cheltuieli,
    coalesce((
      select sum(pi.rest) from plati_inrolari pi
      where pi.rest > 0
        and pi.prescris = false
        and pi.viitor = false
        and pi.data_incepere between p_from and p_to
        and (p_locatie is null or pi.id_locatie = p_locatie)
    ), 0) as restante;
$$;

-- ============================================================
-- 7b. get_client_restante — fără viitor (flag-ul de datorii la înrolare
--     nu trebuie să acuze clientul pentru luni facturate în avans)
-- ============================================================
create or replace function get_client_restante(p_client uuid)
returns table (
  sezon_id   uuid,
  sezon_nume text,
  sursa      text,        -- 'abonament' | 'oneoff'
  rest       numeric
)
language sql
stable
security definer
set search_path = public
as $$
  -- Abonamente: rest ne-prescris, ne-viitor per înrolare, grupat pe sezon.
  select
    e.sezon_id,
    s.numele_sezonului,
    'abonament'::text,
    sum(coalesce(e.suma, 0) - coalesce(p.platit, 0))::numeric
  from enrollments e
  left join sezoane s on s.id = e.sezon_id
  left join lateral (
    select sum(i.suma) as platit from incasari i where i.inregistrare = e.id
  ) p on true
  where e.client = p_client
    and e.reziliat = false
    and e.data_incepere >= (current_date - interval '2 years')
    and e.data_incepere < (date_trunc('month', current_date) + interval '1 month')::date
  group by e.sezon_id, s.numele_sezonului
  having sum(coalesce(e.suma, 0) - coalesce(p.platit, 0)) > 0

  union all

  -- One-off (Bilet/Merch/Taxă): rest din datorii_rest, grupat pe sezon.
  select
    dr.sezon,
    s.numele_sezonului,
    'oneoff'::text,
    sum(dr.rest)::numeric
  from datorii_rest dr
  left join sezoane s on s.id = dr.sezon
  where dr.client = p_client
    and dr.rest > 0
  group by dr.sezon, s.numele_sezonului;
$$;

-- ============================================================
-- 7c. get_scorecard_restante — rest_ramas fără viitor (atribuirea recuperării
--     pe apel rămâne neschimbată; doar bazele de/inc exclud lunile viitoare)
-- ============================================================
create or replace function get_scorecard_restante(
  p_from    date,
  p_to      date,
  p_locatie uuid default null
)
returns table (
  user_id             uuid,
  contacte_recuperare integer,
  clienti_contactati  integer,
  suma_recuperata     numeric,
  rest_ramas          numeric,
  rata_recuperare_pct numeric,
  rata_clasa          text,
  igiena_pct          numeric,
  igiena_clasa        text,
  volum_clasa         text,
  rafala_flag         boolean,
  decalaj_flag        boolean,
  scor_total          numeric,
  scor_pct            numeric,
  clasa_generala      text
)
language sql
stable
security invoker
set search_path = public
as $$
  with
  cfg as (
    select
      coalesce((select prag_standard from scorecard_praguri where cheie='rafala_nr'), 10)              as rafala_nr,
      coalesce((select prag_standard from scorecard_praguri where cheie='rafala_min'), 5)               as rafala_min,
      coalesce((select prag_standard from scorecard_praguri where cheie='volum_recuperare'), 8)         as volum_standard,
      coalesce((select prag_standard from scorecard_praguri where cheie='recuperare_fereastra_zile'), 7) as fereastra_zile
  ),
  cc as (
    select c.id, c.client_id, c.user_id, c.observatii, c.created
    from client_contacte c
    where c.scop = 'recuperare'
      and c.created::date between p_from and p_to
      and (
        p_locatie is null or exists (
          select 1 from enrollments e
          join cursuri cu on cu.id = e.cursul
          join sali s on s.id = cu.sala
          where e.client = c.client_id and e.reziliat = false and s.locatie = p_locatie
        )
      )
  ),
  owner as (
    select client_id, user_id from (
      select client_id, user_id,
        row_number() over (partition by client_id order by count(*) desc, max(created) desc) as rn
      from cc group by client_id, user_id
    ) t where rn = 1
  ),
  de as (
    select e.client, sum(coalesce(e.suma, 0)) as de_incasat
    from enrollments e
    where e.reziliat = false and e.client in (select client_id from owner)
      and e.data_incepere >= (current_date - interval '2 years')  -- exclude prescrise
      and e.data_incepere < (date_trunc('month', current_date) + interval '1 month')::date  -- exclude viitor
    group by e.client
  ),
  inc as (
    select e.client, sum(i.suma) as incasat
    from incasari i join enrollments e on e.id = i.inregistrare
    where e.reziliat = false and e.client in (select client_id from owner)
      and e.data_incepere >= (current_date - interval '2 years')  -- exclude prescrise
      and e.data_incepere < (date_trunc('month', current_date) + interval '1 month')::date  -- exclude viitor
    group by e.client
  ),
  rest_client as (
    select o.client_id, coalesce(d.de_incasat, 0) - coalesce(n.incasat, 0) as rest
    from owner o
    left join de d on d.client = o.client_id
    left join inc n on n.client = o.client_id
  ),
  -- Recuperat = încasări REALE care urmează unui apel de recuperare (precedență + fereastră N zile)
  recuperat as (
    select o.client_id, sum(i.suma) as recuperat
    from owner o
    join incasari i on (
      i.client = o.client_id
      or exists (select 1 from enrollments e where e.id = i.inregistrare and e.client = o.client_id)
    )
    where exists (
      select 1 from cc, cfg
      where cc.client_id = o.client_id
        and i.created > cc.created                                  -- plata înregistrată DUPĂ apel
        and i.data >= cc.created::date                              -- în/​după ziua apelului
        and i.data <= cc.created::date + cfg.fereastra_zile::int    -- în fereastra de N zile
    )
    group by o.client_id
  ),
  per_client as (
    select o.client_id, o.user_id as owner,
      coalesce(rc.rest, 0) as rest,
      greatest(coalesce(rec.recuperat, 0), 0) as recuperat
    from owner o
    left join rest_client rc on rc.client_id = o.client_id
    left join recuperat rec on rec.client_id = o.client_id
  ),
  vol as (
    select cc.user_id,
      count(*)::int as contacte_recuperare,
      count(distinct cc.client_id)::int as clienti_contactati,
      round(100.0 * count(*) filter (where cc.observatii is not null and length(trim(cc.observatii)) > 0)
            / nullif(count(*), 0), 1) as igiena_pct
    from cc group by cc.user_id
  ),
  agg as (
    select pc.owner as user_id,
      sum(pc.recuperat) as suma_recuperata,
      sum(pc.rest) as rest_ramas
    from per_client pc group by pc.owner
  ),
  rafala as (
    select c.user_id, max(w.cnt) as max_in_window
    from cc c
    cross join cfg
    cross join lateral (
      select count(*) as cnt from cc c2
      where c2.user_id = c.user_id
        and c2.created >= c.created
        and c2.created < c.created + (cfg.rafala_min * interval '1 minute')
    ) w
    group by c.user_id
  ),
  metrics as (
    select
      v.user_id,
      v.contacte_recuperare,
      v.clienti_contactati,
      coalesce(a.suma_recuperata, 0) as suma_recuperata,
      coalesce(a.rest_ramas, 0) as rest_ramas,
      v.igiena_pct,
      case
        when coalesce(a.suma_recuperata,0) + coalesce(a.rest_ramas,0) > 0
        then round(100.0 * coalesce(a.suma_recuperata,0) / (coalesce(a.suma_recuperata,0) + coalesce(a.rest_ramas,0)), 1)
      end as rata_recuperare_pct,
      (coalesce(rf.max_in_window, 0) >= (select rafala_nr from cfg)) as rafala_flag,
      (v.contacte_recuperare >= (select volum_standard from cfg) and coalesce(a.suma_recuperata, 0) <= 0) as decalaj_flag
    from vol v
    left join agg a on a.user_id = v.user_id
    left join rafala rf on rf.user_id = v.user_id
  ),
  clase as (
    select m.*,
      clasifica_prag(m.contacte_recuperare, 'volum_recuperare') as volum_clasa,
      clasifica_prag(m.igiena_pct, 'igiena_recuperare')         as igiena_clasa,
      clasifica_prag(m.rata_recuperare_pct, 'rata_recuperare')  as rata_clasa
    from metrics m
  ),
  scor as (
    select c.*,
      (
        select sum(scor_num(x.clasa) * x.pondere)
        from (values
          (c.volum_clasa, (select pondere from scorecard_praguri where cheie='volum_recuperare')),
          (c.igiena_clasa,(select pondere from scorecard_praguri where cheie='igiena_recuperare')),
          (c.rata_clasa,  (select pondere from scorecard_praguri where cheie='rata_recuperare'))
        ) as x(clasa, pondere)
        where x.clasa is not null
      ) as scor_total,
      (
        select sum(2 * x.pondere)
        from (values
          (c.volum_clasa, (select pondere from scorecard_praguri where cheie='volum_recuperare')),
          (c.igiena_clasa,(select pondere from scorecard_praguri where cheie='igiena_recuperare')),
          (c.rata_clasa,  (select pondere from scorecard_praguri where cheie='rata_recuperare'))
        ) as x(clasa, pondere)
        where x.clasa is not null
      ) as scor_max
    from clase c
  )
  select
    s.user_id, s.contacte_recuperare, s.clienti_contactati, s.suma_recuperata,
    s.rest_ramas, s.rata_recuperare_pct, s.rata_clasa, s.igiena_pct, s.igiena_clasa,
    s.volum_clasa, s.rafala_flag, s.decalaj_flag, s.scor_total,
    round(100.0 * s.scor_total / nullif(s.scor_max, 0), 1) as scor_pct,
    clasifica_prag(round(100.0 * s.scor_total / nullif(s.scor_max, 0), 1), 'scor_general') as clasa_generala
  from scor s
  order by scor_pct desc nulls last;
$$;

-- ============================================================
-- 7d. get_sold_familie (portal) — soldul nu conține nici prescris, nici viitor
-- ============================================================
create or replace function get_sold_familie()
returns table (client_id uuid, nume text, prenume text, restanta numeric)
language sql stable security definer set search_path = public as $$
  select pi.id_cursant,
         max(pi.nume_client),
         max(pi.prenume_client),
         coalesce(sum(pi.rest) filter (
           where not coalesce(pi.prescris, false) and not coalesce(pi.viitor, false)
         ), 0)
  from plati_inrolari pi
  where pi.id_cursant in (select client_member_ids())
  group by pi.id_cursant;
$$;

-- ============================================================
-- 8. get_datorii_dashboard — agregatul CANONIC per locație (abonamente + one-off).
--    p_locatie null → un rând per locație (varianta comparativă „Toate locațiile");
--    p_locatie setat → un singur rând. One-off fără locație → rând id_locatie null.
--    Înlocuiește get_restante_totale (mort, zero call sites) — DROP mai jos.
-- ============================================================
create function get_datorii_dashboard(p_locatie uuid default null)
returns table (
  id_locatie    uuid,
  nume_locatie  text,
  de_incasat    numeric,
  incasat       numeric,
  rest_net      numeric,
  rest_oneoff   numeric,
  rest_prescris numeric,
  nr_datornici  int
)
language sql
stable
security invoker
set search_path = public
as $$
  with enr as (
    select pi.id_locatie, pi.nume_locatie, pi.id_cursant as client,
           pi.total_de_plata, pi.platit, pi.rest, pi.prescris, pi.viitor
    from plati_inrolari pi
    where (p_locatie is null or pi.id_locatie = p_locatie)
  ),
  oneoff as (
    select dr.locatie as id_locatie, l.nume as nume_locatie, dr.client,
           dr.suma_datorata, dr.platit, dr.rest
    from datorii_rest dr
    left join locatii l on l.id = dr.locatie
    where (p_locatie is null or dr.locatie = p_locatie)
  ),
  enr_agg as (
    select id_locatie, max(nume_locatie) as nume_locatie,
      coalesce(sum(total_de_plata) filter (where not prescris and not viitor), 0) as de_incasat,
      coalesce(sum(platit)         filter (where not prescris and not viitor), 0) as incasat,
      coalesce(sum(rest) filter (where rest > 0 and not prescris and not viitor), 0) as rest_net,
      coalesce(sum(rest) filter (where rest > 0 and prescris), 0) as rest_prescris
    from enr group by id_locatie
  ),
  oneoff_agg as (
    select id_locatie, max(nume_locatie) as nume_locatie,
      coalesce(sum(suma_datorata), 0) as de_incasat,
      coalesce(sum(platit), 0) as incasat,
      coalesce(sum(rest) filter (where rest > 0), 0) as rest_oneoff
    from oneoff group by id_locatie
  ),
  datornici as (
    select id_locatie, count(distinct client)::int as nr
    from (
      select id_locatie, client from enr where rest > 0 and not prescris and not viitor
      union
      select id_locatie, client from oneoff where rest > 0
    ) u
    group by id_locatie
  )
  select
    coalesce(ea.id_locatie, oa.id_locatie) as id_locatie,
    coalesce(ea.nume_locatie, oa.nume_locatie, 'Fără locație') as nume_locatie,
    coalesce(ea.de_incasat, 0) + coalesce(oa.de_incasat, 0) as de_incasat,
    coalesce(ea.incasat, 0) + coalesce(oa.incasat, 0) as incasat,
    coalesce(ea.rest_net, 0) as rest_net,
    coalesce(oa.rest_oneoff, 0) as rest_oneoff,
    coalesce(ea.rest_prescris, 0) as rest_prescris,
    coalesce(d.nr, 0) as nr_datornici
  from enr_agg ea
  full outer join oneoff_agg oa on oa.id_locatie is not distinct from ea.id_locatie
  left join datornici d on d.id_locatie is not distinct from coalesce(ea.id_locatie, oa.id_locatie)
  where auth_role() in ('owner', 'admin', 'manager', 'front_desk')
  order by coalesce(ea.rest_net, 0) + coalesce(oa.rest_oneoff, 0) desc;
$$;

drop function if exists get_restante_totale(uuid);

-- ============================================================
-- 9. get_datorii_evolutie — soldul restant la FINALUL fiecărei luni (ultimele p_luni).
--    Semantică de BALANȚĂ (facturat − încasat; supraplățile se compensează) —
--    intenționat diferită de Σ-rest-pozitive din KPI: e trend, nu headline.
--    Prescrierea se aplică per luna de raport (fereastră rulantă ~24 luni de
--    facturare, aproximată la granularitate de lună); lunile facturate după M
--    nu intră (regula „viitor" per lună de raport).
--    Perf: matrici mici pe luni (f: luna_facturare; p: luna_facturare × luna_plată),
--    NU sume cumulative per înrolare — ține agregarea sub timeout-ul de 8s.
-- ============================================================
create function get_datorii_evolutie(p_locatie uuid default null, p_luni int default 12)
returns table (
  luna        text,
  sold_net    numeric,
  sold_oneoff numeric,
  sold_total  numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with luni as (
    select (date_trunc('month', current_date) - (interval '1 month' * g))::date as m_start
    from generate_series(0, greatest(coalesce(p_luni, 12), 1) - 1) g
  ),
  f as (
    select date_trunc('month', e.data_incepere)::date as b, sum(coalesce(e.suma, 0)) as suma
    from enrollments e
    left join cursuri c on c.id = e.cursul
    left join sali s on s.id = c.sala
    where e.reziliat = false
      and e.data_incepere is not null
      and (p_locatie is null or s.locatie = p_locatie)
    group by 1
  ),
  p as (
    select date_trunc('month', e.data_incepere)::date as b,
           date_trunc('month', i.data)::date as pm,
           sum(i.suma) as suma
    from incasari i
    join enrollments e on e.id = i.inregistrare
    left join cursuri c on c.id = e.cursul
    left join sali s on s.id = c.sala
    where e.reziliat = false
      and e.data_incepere is not null
      and (p_locatie is null or s.locatie = p_locatie)
    group by 1, 2
  ),
  df as (
    select date_trunc('month', d.created)::date as b, sum(d.suma_datorata) as suma
    from datorii d
    where (p_locatie is null or d.locatie = p_locatie)
    group by 1
  ),
  dp as (
    select date_trunc('month', d.created)::date as b,
           date_trunc('month', i.data)::date as pm,
           sum(i.suma) as suma
    from incasari i
    join datorii d on d.id = i.datorie
    where (p_locatie is null or d.locatie = p_locatie)
    group by 1, 2
  ),
  solduri as (
    select
      l.m_start,
      greatest(
        coalesce((select sum(f.suma) from f
                  where f.b <= l.m_start and f.b > (l.m_start - interval '2 years')::date), 0)
        - coalesce((select sum(p.suma) from p
                  where p.b <= l.m_start and p.b > (l.m_start - interval '2 years')::date
                    and p.pm <= l.m_start), 0),
        0) as sold_net,
      greatest(
        coalesce((select sum(df.suma) from df where df.b <= l.m_start), 0)
        - coalesce((select sum(dp.suma) from dp where dp.b <= l.m_start and dp.pm <= l.m_start), 0),
        0) as sold_oneoff
    from luni l
  )
  select
    to_char(s.m_start, 'YYYY-MM') as luna,
    s.sold_net,
    s.sold_oneoff,
    s.sold_net + s.sold_oneoff as sold_total
  from solduri s
  where auth_role() in ('owner', 'admin', 'manager', 'front_desk')
  order by s.m_start asc;
$$;

-- ============================================================
-- 10. Securitate (regula obligatorie: anon primește EXECUTE implicit pe funcții
--     noi, iar auth_role() cade pe front_desk → revoke anon + public peste tot)
-- ============================================================
revoke execute on function get_restante_worklist(uuid, uuid, date) from anon, public;
grant execute on function get_restante_worklist(uuid, uuid, date) to authenticated;

revoke execute on function get_sms_recipients(uuid, uuid, text) from anon, public;
grant execute on function get_sms_recipients(uuid, uuid, text) to authenticated;

revoke execute on function get_restante_aging(uuid) from anon, public;
grant execute on function get_restante_aging(uuid) to authenticated;

revoke execute on function get_kpis_financiar(date, date, uuid) from anon, public;
grant execute on function get_kpis_financiar(date, date, uuid) to authenticated;

revoke execute on function get_client_restante(uuid) from anon, public;
grant execute on function get_client_restante(uuid) to authenticated;

revoke execute on function get_scorecard_restante(date, date, uuid) from anon, public;
grant execute on function get_scorecard_restante(date, date, uuid) to authenticated;

revoke execute on function get_sold_familie() from anon, public;
grant execute on function get_sold_familie() to authenticated;

revoke execute on function get_datorii_dashboard(uuid) from anon, public;
grant execute on function get_datorii_dashboard(uuid) to authenticated;

revoke execute on function get_datorii_evolutie(uuid, int) from anon, public;
grant execute on function get_datorii_evolutie(uuid, int) to authenticated;
