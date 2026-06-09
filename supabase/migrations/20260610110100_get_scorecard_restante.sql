-- Qapp v2 — Scorecard call-center, Faza 2: RPC recuperare restanțe per operator.
--
-- Anti-gaming: suma_recuperata NU e self-reported — e suma încasărilor REALE
-- (incasari) pentru clienții contactați, cu data >= data primului contact de
-- recuperare. Operatorul nu poate fabrica bani intrați. `decalaj_flag` =
-- multe contacte logate, dar ~0 bani recuperați.
--
-- Atribuire: pe operatorul cu cele mai multe contacte de recuperare pe acel
-- client în interval (owner). Locație = uuid (locatii.id), via enrollment →
-- curs → sală → locație (clienții nu au locație proprie).

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
      coalesce((select prag_standard from scorecard_praguri where cheie='rafala_nr'), 10)        as rafala_nr,
      coalesce((select prag_standard from scorecard_praguri where cheie='rafala_min'), 5)         as rafala_min,
      coalesce((select prag_standard from scorecard_praguri where cheie='volum_recuperare'), 8)   as volum_standard
  ),
  -- Contacte de recuperare în interval (+ filtru locație via enrollment)
  cc as (
    select c.client_id, c.user_id, c.observatii, c.created
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
        row_number() over (
          partition by client_id order by count(*) desc, max(created) desc
        ) as rn
      from cc group by client_id, user_id
    ) t where rn = 1
  ),
  first_contact as (
    select client_id, min(created) as first_at from cc group by client_id
  ),
  -- Rest curent per client lucrat (pattern view-uri restanțe: de_incasat - incasat)
  de as (
    select e.client, sum(coalesce(e.suma, 0)) as de_incasat
    from enrollments e
    where e.reziliat = false and e.client in (select client_id from owner)
    group by e.client
  ),
  inc as (
    select e.client, sum(i.suma) as incasat
    from incasari i
    join enrollments e on e.id = i.inregistrare
    where e.reziliat = false and e.client in (select client_id from owner)
    group by e.client
  ),
  rest_client as (
    select o.client_id, coalesce(d.de_incasat, 0) - coalesce(n.incasat, 0) as rest
    from owner o
    left join de d on d.client = o.client_id
    left join inc n on n.client = o.client_id
  ),
  -- Recuperat = încasări REALE după primul contact (verificat, ne-gameabil)
  recuperat as (
    select fc.client_id, sum(i.suma) as recuperat
    from first_contact fc
    join incasari i on (
      i.data >= fc.first_at::date and i.data <= p_to
      and (
        i.client = fc.client_id
        or exists (select 1 from enrollments e where e.id = i.inregistrare and e.client = fc.client_id)
      )
    )
    group by fc.client_id
  ),
  per_client as (
    select o.client_id, o.user_id as owner,
      coalesce(rc.rest, 0) as rest,
      greatest(coalesce(rec.recuperat, 0), 0) as recuperat
    from owner o
    left join rest_client rc on rc.client_id = o.client_id
    left join recuperat rec on rec.client_id = o.client_id
  ),
  -- Volum + igienă per operator (toate contactele, nu doar owned)
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
        then round(100.0 * coalesce(a.suma_recuperata,0)
                   / (coalesce(a.suma_recuperata,0) + coalesce(a.rest_ramas,0)), 1)
      end as rata_recuperare_pct,
      (coalesce(rf.max_in_window, 0) >= (select rafala_nr from cfg)) as rafala_flag,
      (v.contacte_recuperare >= (select volum_standard from cfg)
        and coalesce(a.suma_recuperata, 0) <= 0) as decalaj_flag
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
    s.user_id,
    s.contacte_recuperare,
    s.clienti_contactati,
    s.suma_recuperata,
    s.rest_ramas,
    s.rata_recuperare_pct,
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

grant execute on function get_scorecard_restante(date, date, uuid) to authenticated;
