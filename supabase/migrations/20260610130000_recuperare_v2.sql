-- Qapp v2 — Scorecard Faza 2 REVIZUIRE: worklist de recuperare + atribuire corectă.
--
-- Problema rezolvată: „orice încasare după contact" supra-credita walk-in-urile.
-- Acum o încasare se creditează unui apel DOAR dacă apelul PRECEDE plata și plata
-- e în fereastra de N zile:
--   incasari.created > client_contacte.created  (plata înregistrată după apel)
--   incasari.data în [data_apel, data_apel + N]  (N = recuperare_fereastra_zile)
--
-- + worklist țintit: clienți Activ (prezență ≤21z) cu ≥2 rate (luni) neachitate.

-- ============================================================
-- 1. Praguri noi (parametri restanțe, ne-scorate)
-- ============================================================
insert into scorecard_praguri
  (cheie, faza, eticheta, unitate, prag_standard, prag_peste, directie, pondere, scorat, descriere)
values
  ('recuperare_fereastra_zile', 2, 'Fereastră recuperare (zile)', 'numar', 7, 7, 'mai_mic_e_bine', 0, false,
    'Nr. de zile după apel în care o plată reală se creditează apelului.'),
  ('rata_restante', 2, 'Rată restanțe (țintă echipă)', 'procent', 7, 5, 'mai_mic_e_bine', 0, false,
    'Țintă portofoliu: rest total ÷ de-încasat total pe lună. Sub prag = sănătos.')
on conflict (cheie) do nothing;

-- ============================================================
-- 2. RPC worklist de recuperare (per client)
--    Activ + ≥2 rate neachitate. Reutilizează CASE-ul de scadență din
--    get_sms_recipients. security invoker (front_desk îl poate citi, ca la /sms).
-- ============================================================
create or replace function get_restante_worklist(p_locatie uuid default null)
returns table (
  client_id           uuid,
  nume                text,
  prenume             text,
  telefon             text,
  nume_locatie        text,
  rest_total          numeric,
  nr_rate_neachitate  integer,
  zile_depasire       integer,
  ultima_prezenta     date,
  ultim_apel_at       timestamptz,
  ultim_apel_rezultat text
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
      and e.reziliat = false
      and (p_locatie is null or pi.id_locatie = p_locatie)
  ),
  agg as (
    select client_id,
      max(nume_locatie) as nume_locatie,
      sum(rest) as rest_total,
      count(*)::int as nr_rate_neachitate,
      max((current_date - scadenta)::int) as zile_depasire
    from baza
    group by client_id
    having count(*) >= 2
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
    lc.ultim_apel_rezultat
  from agg a
  join clienti cl on cl.id = a.client_id
  left join lateral (
    select cc.created as ultim_apel_at, cc.rezultat::text as ultim_apel_rezultat
    from client_contacte cc
    where cc.client_id = a.client_id and cc.scop = 'recuperare'
    order by cc.created desc
    limit 1
  ) lc on true
  where cl.status = 'Activ'
  order by a.zile_depasire desc nulls last, a.rest_total desc;
$$;

grant execute on function get_restante_worklist(uuid) to authenticated;

-- ============================================================
-- 3. get_scorecard_restante — recalibrare atribuire (apel precede plata + fereastră N zile)
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
    group by e.client
  ),
  inc as (
    select e.client, sum(i.suma) as incasat
    from incasari i join enrollments e on e.id = i.inregistrare
    where e.reziliat = false and e.client in (select client_id from owner)
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
