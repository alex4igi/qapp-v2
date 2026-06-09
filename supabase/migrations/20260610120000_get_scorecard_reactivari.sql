-- Qapp v2 — Scorecard call-center, Faza 3: reactivare clienți inactivi per operator.
-- Refolosește tabelul client_contacte cu scop='reactivare'.
--
-- Anti-gaming: reactivare REUȘITĂ = clientul a avut o prezență 'Prezent' REALĂ
-- după data contactului (s-a întors efectiv la cursuri). Operatorul nu poate
-- fabrica o prezență. `decalaj_flag` = multe contacte, dar ~0 reveniri.
--
-- Atribuire: owner = operatorul cu cele mai multe contacte de reactivare pe acel
-- client. Locație = uuid (via enrollment → curs → sală → locație).

-- ============================================================
-- Seed praguri Faza 3. 'scor_general' se reutilizează din Faza 1.
-- ============================================================
insert into scorecard_praguri
  (cheie, faza, eticheta, unitate, prag_standard, prag_peste, directie, pondere, scorat, descriere)
values
  ('volum_reactivare',  3, 'Volum contacte reactivare', 'numar',    8, 15, 'mai_mare_e_bine', 1, true,
    'Nr. contacte de reactivare / lună per operator.'),
  ('rata_reactivare',   3, 'Rată reactivare',           'procent', 50, 80, 'mai_mare_e_bine', 1, true,
    'Clienți care au revenit (prezență reală după contact) / clienți lucrați.'),
  ('igiena_reactivare', 3, 'Igienă reactivare',         'procent', 80, 95, 'mai_mare_e_bine', 1, true,
    '% contacte de reactivare cu notă (observații).')
on conflict (cheie) do nothing;

-- ============================================================
-- RPC get_scorecard_reactivari
-- ============================================================
create or replace function get_scorecard_reactivari(
  p_from    date,
  p_to      date,
  p_locatie uuid default null
)
returns table (
  user_id             uuid,
  contacte_reactivare integer,
  clienti_contactati  integer,
  reactivati          integer,
  rata_reactivare_pct numeric,
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
      coalesce((select prag_standard from scorecard_praguri where cheie='rafala_nr'), 10)        as rafala_nr,
      coalesce((select prag_standard from scorecard_praguri where cheie='rafala_min'), 5)         as rafala_min,
      coalesce((select prag_standard from scorecard_praguri where cheie='volum_reactivare'), 8)   as volum_standard
  ),
  cc as (
    select c.client_id, c.user_id, c.observatii, c.created
    from client_contacte c
    where c.scop = 'reactivare'
      and c.created::date between p_from and p_to
      and (
        p_locatie is null or exists (
          select 1 from enrollments e
          join cursuri cu on cu.id = e.cursul
          join sali s on s.id = cu.sala
          where e.client = c.client_id and s.locatie = p_locatie
        )
      )
  ),
  owner as (
    select client_id, user_id from (
      select client_id, user_id,
        row_number() over (
          partition by client_id order by count(*) desc, max(created) desc
        ) as rn
      from cc group by client_id, user_id
    ) t where rn = 1
  ),
  first_contact as (
    select client_id, min(created) as first_at from cc group by client_id
  ),
  -- Reactivat = prezență 'Prezent' reală după primul contact (verificat)
  per_client as (
    select o.client_id, o.user_id as owner,
      exists (
        select 1 from prezente p
        where p.client = o.client_id
          and p.status = 'Prezent'
          and p.data >= (select fc.first_at::date from first_contact fc where fc.client_id = o.client_id)
          and p.data <= p_to
      ) as reactivat
    from owner o
  ),
  vol as (
    select cc.user_id,
      count(*)::int as contacte_reactivare,
      round(100.0 * count(*) filter (where cc.observatii is not null and length(trim(cc.observatii)) > 0)
            / nullif(count(*), 0), 1) as igiena_pct
    from cc group by cc.user_id
  ),
  agg as (
    select pc.owner as user_id,
      count(*)::int as total_owned,
      count(*) filter (where pc.reactivat)::int as reactivati
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
      v.contacte_reactivare,
      coalesce(a.total_owned, 0) as clienti_contactati,
      coalesce(a.reactivati, 0) as reactivati,
      v.igiena_pct,
      case when coalesce(a.total_owned,0) > 0
        then round(100.0 * coalesce(a.reactivati,0) / a.total_owned, 1) end as rata_reactivare_pct,
      (coalesce(rf.max_in_window, 0) >= (select rafala_nr from cfg)) as rafala_flag,
      (v.contacte_reactivare >= (select volum_standard from cfg)
        and coalesce(a.reactivati, 0) = 0) as decalaj_flag
    from vol v
    left join agg a on a.user_id = v.user_id
    left join rafala rf on rf.user_id = v.user_id
  ),
  clase as (
    select m.*,
      clasifica_prag(m.contacte_reactivare, 'volum_reactivare') as volum_clasa,
      clasifica_prag(m.igiena_pct, 'igiena_reactivare')         as igiena_clasa,
      clasifica_prag(m.rata_reactivare_pct, 'rata_reactivare')  as rata_clasa
    from metrics m
  ),
  scor as (
    select c.*,
      (
        select sum(scor_num(x.clasa) * x.pondere)
        from (values
          (c.volum_clasa, (select pondere from scorecard_praguri where cheie='volum_reactivare')),
          (c.igiena_clasa,(select pondere from scorecard_praguri where cheie='igiena_reactivare')),
          (c.rata_clasa,  (select pondere from scorecard_praguri where cheie='rata_reactivare'))
        ) as x(clasa, pondere)
        where x.clasa is not null
      ) as scor_total,
      (
        select sum(2 * x.pondere)
        from (values
          (c.volum_clasa, (select pondere from scorecard_praguri where cheie='volum_reactivare')),
          (c.igiena_clasa,(select pondere from scorecard_praguri where cheie='igiena_reactivare')),
          (c.rata_clasa,  (select pondere from scorecard_praguri where cheie='rata_reactivare'))
        ) as x(clasa, pondere)
        where x.clasa is not null
      ) as scor_max
    from clase c
  )
  select
    s.user_id,
    s.contacte_reactivare,
    s.clienti_contactati,
    s.reactivati,
    s.rata_reactivare_pct,
    s.rata_clasa,
    s.igiena_pct,
    s.igiena_clasa,
    s.volum_clasa,
    s.rafala_flag,
    s.decalaj_flag,
    s.scor_total,
    round(100.0 * s.scor_total / nullif(s.scor_max, 0), 1) as scor_pct,
    clasifica_prag(round(100.0 * s.scor_total / nullif(s.scor_max, 0), 1), 'scor_general') as clasa_generala
  from scor s
  order by scor_pct desc nulls last;
$$;

grant execute on function get_scorecard_reactivari(date, date, uuid) to authenticated;
