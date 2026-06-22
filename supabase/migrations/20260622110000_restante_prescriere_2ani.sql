-- Qapp v2 — Prescrierea restanțelor după 2 ani.
--
-- Regulă de business (decisă de user): o restanță se prescrie la 2 ani de la
-- scadența ratei neachitate. Ex: o datorie a cărei lună de plată a început în
-- 2022-2023 este prescrisă acum (2026).
--
-- Punct de referință: enrollments.data_incepere (ziua 1 a lunii facturate ≈ scadența
-- ratei; diferența față de scadența exactă e de ~2 săptămâni, neglijabilă la 2 ani).
-- NU folosim sfârșitul sezonului: datele v1 sunt toate într-un singur sezon-coș
-- „2017-2024" (data_final 31 aug 2024), deci regula pe sezon nu ar prescrie nimic
-- până în sept 2026 — contrar așteptării userului.
--
-- Acoperire (decisă de user):
--   • plati_inrolari        → expune flagul `prescris`; lista /financiar le ține
--                             vizibile cu badge, dar le scoate din totalul de recuperat.
--   • get_restante_worklist → exclude prescrisele (nu mai suni); funcția e deținută
--                             de migrația 20260622120000, care folosește pi.prescris.
--   • get_scorecard_restante→ exclude prescrisele din rest_ramas / rata de recuperare.
--   • get_sms_recipients    → nu mai trimite remindere de plată pentru prescrise.
-- KPI/statistici totale (statistica_restante_totale + restante_*_luna) rămân NEATINSE
-- intenționat — userul nu a inclus totalurile în scopul prescrierii.
--
-- Predicatul „prescris" e definit o singură dată în view (mai jos) și reutilizat prin
-- pi.prescris în worklist + SMS. get_scorecard_restante îl replică inline pe
-- data_incepere (agreghează direct din enrollments) — ține pragul aliniat cu view-ul.

-- ============================================================
-- 1. plati_inrolari + coloana `prescris`
-- ============================================================
drop view if exists plati_inrolari;

create view plati_inrolari as
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
  (e.data_incepere < (current_date - interval '2 years')) as prescris
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

-- NB: get_restante_worklist NU se mai redefinește aici. Migrația 20260622120000
-- (worklist + p_sezon) a fost împinsă între timp și deține acum funcția (versiunea
-- cu 2 argumente, care folosește deja pi.prescris). A o recrea aici ar reintroduce
-- semnătura veche cu 1 argument în paralel → overload ambiguu.

-- ============================================================
-- 2. get_scorecard_restante — exclude prescrisele din rest_ramas
--    (de + inc agreghează direct din enrollments → predicat inline, același prag)
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
    group by e.client
  ),
  inc as (
    select e.client, sum(i.suma) as incasat
    from incasari i join enrollments e on e.id = i.inregistrare
    where e.reziliat = false and e.client in (select client_id from owner)
      and e.data_incepere >= (current_date - interval '2 years')  -- exclude prescrise
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

grant execute on function get_scorecard_restante(date, date, uuid) to authenticated;

-- ============================================================
-- 3. get_sms_recipients — nu trimite remindere pentru prescrise
-- ============================================================
drop function if exists get_sms_recipients(uuid, uuid, text);

create function get_sms_recipients(
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
      pi.id_locatie,
      pi.nume_locatie,
      pi.rest,
      pi.data_incepere,
      e.sezon_id,
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
    where pi.id_familie is not null
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
      else rest > 0  -- notificare_restante (default)
    end
  ),
  per_membru as (
    select
      id_familie,
      id_cursant,
      max(nume_complet) as nume,
      max(nume_locatie) as nume_locatie,
      max(scadenta) as scadenta,
      sum(rest) as rest_membru,
      max(zile_dep) as zile_dep
    from filtrat
    group by id_familie, id_cursant
  )
  select
    pm.id_familie,
    coalesce(nullif(trim(fam.telefon), ''), fam.telefon_2) as telefon,
    max(pm.nume_locatie) as nume_locatie,
    max(pm.scadenta) as scadenta,
    jsonb_agg(
      jsonb_build_object('nume', pm.nume, 'rest', round(pm.rest_membru))
      order by pm.nume
    ) as membri,
    round(sum(pm.rest_membru)) as total_restanta,
    max(pm.zile_dep) as zile_depasire,
    array_agg(pm.id_cursant) as client_ids
  from per_membru pm
  join familii fam on fam.id = pm.id_familie
  group by pm.id_familie, fam.telefon, fam.telefon_2
  having coalesce(nullif(trim(fam.telefon), ''), fam.telefon_2) is not null
  order by total_restanta desc nulls last;
$$;

grant execute on function get_sms_recipients(uuid, uuid, text) to authenticated;
