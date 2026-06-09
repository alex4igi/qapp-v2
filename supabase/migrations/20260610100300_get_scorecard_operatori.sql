-- Qapp v2 — Scorecard call-center, Faza 1 (leads): RPC agregat per operator.
--
-- Atribuire: pe lead_contacte.user_id (acțiune umană garantată), NU pe
-- responsabil_id (= creatorul, poluat de cron/import).
--   - Volumele (contacte_*) se atribuie pe operatorul care a făcut contactul.
--   - Rezultatele (conversie, show, persistență) se atribuie „owner-ului"
--     lead-ului = operatorul cu cele mai multe contacte pe acel lead în interval.
--
-- Anti-gaming: `contacte_verificate` numără doar contactele pe lead-uri cu un
-- artefact extern (SMS prin gateway / prezență demo / conversie) — pe care
-- operatorul nu-l poate fabrica. `decalaj_flag` și `rafala_flag` semnalează
-- activitate suspectă.
--
-- Filtru locație: leads.locatia e TEXT label ('Ștefan cel Mare'/'Nicolina'),
-- deci p_locatie e text, nu uuid.

create or replace function get_scorecard_operatori(
  p_from    date,
  p_to      date,
  p_locatie text default null
)
returns table (
  user_id             uuid,
  contacte_total      integer,
  contacte_verificate integer,
  contacte_telefon    integer,
  contacte_sms        integer,
  contacte_email      integer,
  contacte_dm         integer,
  leaduri_lucrate     integer,
  viteza_med_ore      numeric,
  viteza_clasa        text,
  persistenta_med     numeric,
  persistenta_clasa   text,
  followup_onorat_pct numeric,
  igiena_crm_pct      numeric,
  igiena_clasa        text,
  conversie_pct       numeric,
  conversie_clasa     text,
  show_rate_pct       numeric,
  show_rate_clasa     text,
  volum_clasa         text,
  nota_lipsa_pct      numeric,
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
  -- Praguri pentru flag-urile heuristice
  cfg as (
    select
      coalesce((select prag_standard from scorecard_praguri where cheie='rafala_nr'), 10) as rafala_nr,
      coalesce((select prag_standard from scorecard_praguri where cheie='rafala_min'), 5)  as rafala_min,
      coalesce((select prag_standard from scorecard_praguri where cheie='decalaj_rata'), 20) as decalaj_rata,
      coalesce((select prag_standard from scorecard_praguri where cheie='volum_contacte'), 10) as volum_standard
  ),
  -- Contactele din interval (+ filtru locație via lead)
  ci as (
    select lc.id, lc.lead_id, lc.user_id, lc.canal, lc.rezultat, lc.observatii, lc.created
    from lead_contacte lc
    join leads l on l.id = lc.lead_id
    where lc.created::date between p_from and p_to
      and (p_locatie is null or l.locatia = p_locatie)
  ),
  -- Artefact extern per lead atins în interval (anti-gaming)
  lead_artifact as (
    select distinct ci.lead_id,
      (
        exists (select 1 from sms_logs s where s.lead_id = ci.lead_id)
        or exists (select 1 from programari_leads p where p.lead = ci.lead_id and p.prezenta = 'prezent')
        or exists (select 1 from leads l where l.id = ci.lead_id and l.status = 'convertit')
      ) as has_artifact
    from ci
  ),
  -- Owner-ul fiecărui lead = operatorul cu cele mai multe contacte în interval
  lead_owner as (
    select lead_id, user_id from (
      select ci.lead_id, ci.user_id,
        row_number() over (
          partition by ci.lead_id
          order by count(*) desc, max(ci.created) desc
        ) as rn
      from ci
      group by ci.lead_id, ci.user_id
    ) t where rn = 1
  ),
  -- Meta lead-uri owned (pentru rezultate)
  lm as (
    select lo.user_id as owner, l.id as lead_id, l.status, l.data_conversie,
           l.nr_contactari, l.data_callback_dorit,
           exists (select 1 from ci where ci.lead_id = l.id and ci.observatii is not null and length(trim(ci.observatii)) > 0) as are_nota
    from lead_owner lo
    join leads l on l.id = lo.lead_id
  ),
  -- Primul contact per lead (pentru viteza de contactare), bornat la interval
  prim as (
    select t.user_id, t.lead_created, t.first_at
    from (
      select distinct on (ci.lead_id)
        ci.lead_id, ci.user_id, ci.created as first_at, l.created as lead_created
      from ci
      join leads l on l.id = ci.lead_id
      order by ci.lead_id, ci.created asc
    ) t
    where t.first_at::date between p_from and p_to
  ),
  -- Show-rate din programări (pe owner)
  shows as (
    select lo.user_id as owner,
      count(*) filter (where p.prezenta = 'prezent') as prezenti,
      count(*) filter (where p.prezenta in ('prezent','absent')) as finalizate
    from lead_owner lo
    join programari_leads p on p.lead = lo.lead_id
    where p.data_programarii between p_from and p_to
    group by lo.user_id
  ),
  -- Rafală: nr. max de contacte într-o fereastră de `rafala_min` minute
  rafala as (
    select c.user_id, max(w.cnt) as max_in_window
    from ci c
    cross join cfg
    cross join lateral (
      select count(*) as cnt
      from ci c2
      where c2.user_id = c.user_id
        and c2.created >= c.created
        and c2.created < c.created + (cfg.rafala_min * interval '1 minute')
    ) w
    group by c.user_id
  ),
  -- Volume + viteză + igienă + follow-up, agregate per operator
  vol as (
    select
      ci.user_id,
      count(*)::int as contacte_total,
      count(*) filter (where la.has_artifact)::int as contacte_verificate,
      count(*) filter (where ci.canal = 'telefon')::int as contacte_telefon,
      count(*) filter (where ci.canal = 'sms')::int as contacte_sms,
      count(*) filter (where ci.canal = 'email')::int as contacte_email,
      count(*) filter (where ci.canal = 'dm')::int as contacte_dm,
      round(
        100.0 * count(*) filter (where ci.rezultat = 'reusit' and (ci.observatii is null or length(trim(ci.observatii)) = 0))
        / nullif(count(*) filter (where ci.rezultat = 'reusit'), 0)
      , 1) as nota_lipsa_pct
    from ci
    left join lead_artifact la on la.lead_id = ci.lead_id
    group by ci.user_id
  ),
  viteza as (
    select user_id,
      round((percentile_cont(0.5) within group (order by ore_lucratoare(lead_created, first_at)))::numeric, 1) as viteza_med_ore
    from prim
    group by user_id
  ),
  rezultate as (
    select
      owner as user_id,
      count(*)::int as leaduri_lucrate,
      round(100.0 * count(*) filter (where status = 'convertit' and data_conversie::date between p_from and p_to)
            / nullif(count(*), 0), 1) as conversie_pct,
      round(avg(nr_contactari) filter (where status in ('pierdut','nurture')), 1) as persistenta_med,
      round(100.0 * count(*) filter (where are_nota) / nullif(count(*), 0), 1) as igiena_crm_pct,
      round(100.0 * count(*) filter (where data_callback_dorit is not null
                                       and data_callback_dorit::date between p_from and p_to
                                       and exists (select 1 from ci where ci.lead_id = lm.lead_id and ci.created >= lm.data_callback_dorit))
            / nullif(count(*) filter (where data_callback_dorit is not null
                                        and data_callback_dorit::date between p_from and p_to), 0), 1) as followup_onorat_pct
    from lm
    group by owner
  ),
  -- Reunește toți operatorii care apar undeva
  operatori as (
    select user_id from vol
    union select user_id from rezultate
  ),
  metrics as (
    select
      o.user_id,
      coalesce(v.contacte_total, 0) as contacte_total,
      coalesce(v.contacte_verificate, 0) as contacte_verificate,
      coalesce(v.contacte_telefon, 0) as contacte_telefon,
      coalesce(v.contacte_sms, 0) as contacte_sms,
      coalesce(v.contacte_email, 0) as contacte_email,
      coalesce(v.contacte_dm, 0) as contacte_dm,
      coalesce(r.leaduri_lucrate, 0) as leaduri_lucrate,
      vit.viteza_med_ore,
      r.persistenta_med,
      r.followup_onorat_pct,
      r.igiena_crm_pct,
      r.conversie_pct,
      case when s.finalizate > 0 then round(100.0 * s.prezenti / s.finalizate, 1) end as show_rate_pct,
      v.nota_lipsa_pct,
      (coalesce(rf.max_in_window, 0) >= (select rafala_nr from cfg)) as rafala_flag,
      (coalesce(v.contacte_total,0) >= (select volum_standard from cfg)
        and 100.0 * coalesce(v.contacte_verificate,0) / nullif(coalesce(v.contacte_total,0),0) < (select decalaj_rata from cfg)) as decalaj_flag
    from operatori o
    left join vol v on v.user_id = o.user_id
    left join viteza vit on vit.user_id = o.user_id
    left join rezultate r on r.user_id = o.user_id
    left join shows s on s.owner = o.user_id
    left join rafala rf on rf.user_id = o.user_id
  ),
  clase as (
    select m.*,
      clasifica_prag(m.contacte_verificate, 'volum_contacte') as volum_clasa,
      clasifica_prag(m.viteza_med_ore, 'viteza_contactare')   as viteza_clasa,
      clasifica_prag(m.persistenta_med, 'persistenta')        as persistenta_clasa,
      clasifica_prag(m.igiena_crm_pct, 'igiena_crm')          as igiena_clasa,
      clasifica_prag(m.followup_onorat_pct, 'followup_onorat') as followup_clasa,
      clasifica_prag(m.conversie_pct, 'conversie')            as conversie_clasa,
      clasifica_prag(m.show_rate_pct, 'show_rate')            as show_rate_clasa
    from metrics m
  ),
  -- Scor ponderat: ignoră KPI fără date (nu penalizează lunile de backfill)
  scor as (
    select c.*,
      (
        select sum(scor_num(x.clasa) * x.pondere)
        from (values
          (c.volum_clasa,       (select pondere from scorecard_praguri where cheie='volum_contacte')),
          (c.viteza_clasa,      (select pondere from scorecard_praguri where cheie='viteza_contactare')),
          (c.persistenta_clasa, (select pondere from scorecard_praguri where cheie='persistenta')),
          (c.igiena_clasa,      (select pondere from scorecard_praguri where cheie='igiena_crm')),
          (c.followup_clasa,    (select pondere from scorecard_praguri where cheie='followup_onorat')),
          (c.conversie_clasa,   (select pondere from scorecard_praguri where cheie='conversie')),
          (c.show_rate_clasa,   (select pondere from scorecard_praguri where cheie='show_rate'))
        ) as x(clasa, pondere)
        where x.clasa is not null
      ) as scor_total,
      (
        select sum(2 * x.pondere)
        from (values
          (c.volum_clasa,       (select pondere from scorecard_praguri where cheie='volum_contacte')),
          (c.viteza_clasa,      (select pondere from scorecard_praguri where cheie='viteza_contactare')),
          (c.persistenta_clasa, (select pondere from scorecard_praguri where cheie='persistenta')),
          (c.igiena_clasa,      (select pondere from scorecard_praguri where cheie='igiena_crm')),
          (c.followup_clasa,    (select pondere from scorecard_praguri where cheie='followup_onorat')),
          (c.conversie_clasa,   (select pondere from scorecard_praguri where cheie='conversie')),
          (c.show_rate_clasa,   (select pondere from scorecard_praguri where cheie='show_rate'))
        ) as x(clasa, pondere)
        where x.clasa is not null
      ) as scor_max
    from clase c
  )
  select
    s.user_id,
    s.contacte_total,
    s.contacte_verificate,
    s.contacte_telefon,
    s.contacte_sms,
    s.contacte_email,
    s.contacte_dm,
    s.leaduri_lucrate,
    s.viteza_med_ore,
    s.viteza_clasa,
    s.persistenta_med,
    s.persistenta_clasa,
    s.followup_onorat_pct,
    s.igiena_crm_pct,
    s.igiena_clasa,
    s.conversie_pct,
    s.conversie_clasa,
    s.show_rate_pct,
    s.show_rate_clasa,
    s.volum_clasa,
    s.nota_lipsa_pct,
    s.rafala_flag,
    s.decalaj_flag,
    s.scor_total,
    round(100.0 * s.scor_total / nullif(s.scor_max, 0), 1) as scor_pct,
    clasifica_prag(round(100.0 * s.scor_total / nullif(s.scor_max, 0), 1), 'scor_general') as clasa_generala
  from scor s
  order by scor_pct desc nulls last;
$$;

grant execute on function get_scorecard_operatori(date, date, text) to authenticated;
