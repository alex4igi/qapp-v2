-- Prorata nu se numără, fie că omul rămâne, fie că pleacă (Alex, 9 oct. 2026). Condiția „rămâne client
-- luna următoare" din 20261009210000 recompensa plecarea: managerul câștiga locul exact când copilul pleca
-- după luna de prorata. Ajustările la reziliere rămân numărate — pe ele nu se pune semnul.

create or replace function public._locuri_ponderate(
  p_de date,
  p_pana date,
  p_cursuri uuid[],
  p_sedinta_30_zile boolean,
  p_fara_prorata boolean default false
)
returns table(client uuid, curs_id uuid, pondere numeric, fel text,
              sedinte_platite integer, sedinte_tinute integer)
language sql
stable
set search_path to 'public'
as $function$
  with grupe as (
    select c.id, coalesce(c.facultativ, false) as facultativ, c.zile::text[] as zile,
           c.sezon, z.data_incepere as sezon_de, z.data_final as sezon_pana
    from cursuri c
    left join sezoane z on z.id = c.sezon
    where c.id = any(p_cursuri)
  ),
  fac as (select array_agg(g.id) as ids from grupe g where g.facultativ),
  fer as (select case when p_sedinta_30_zile then p_de - 29 else p_de end as de),
  intregi as (
    select distinct r.client, r.curs_id
    from _inrolari_platite_randuri(p_de, p_pana,
                                   array(select g.id from grupe g where not g.facultativ),
                                   p_sedinta_30_zile) r
    where not (
      p_fara_prorata
      and exists (
        select 1 from enrollments e
        where e.prorata and e.cursul = r.curs_id and e.client = r.client
          and e.suma > 0
          and e.data_incepere between p_de and p_pana
      )
    )
  ),
  -- Facultativele se citesc o dată, pe toată fereastra ședințelor; abonamentul
  -- trebuie să atingă perioada propriu-zisă, nu fereastra.
  rand_fac as (
    select r.*
    from _inrolari_platite_randuri((select de from fer), p_pana, (select ids from fac), false) r
  ),
  abonati as (
    select distinct r.client, r.curs_id
    from rand_fac r
    where r.tip <> 'Per sedinta' and r.sfarsit >= greatest(r.data_incepere, p_de)
  ),
  sedinte as (
    select distinct r.client, r.curs_id, r.data_incepere as zi
    from rand_fac r
    where r.tip = 'Per sedinta'
  ),
  orar as (
    select g.id as curs_id, d::date as zi
    from grupe g
    cross join fer
    cross join lateral generate_series(
      greatest(fer.de, coalesce(g.sezon_de, fer.de)),
      least(p_pana, coalesce(g.sezon_pana, p_pana)),
      interval '1 day') d
    where g.facultativ
      and (array['Luni','Marti','Miercuri','Joi','Vineri','Sambata','Duminica'])[extract(isodow from d)::int]
          = any(g.zile)
      and not exists (select 1 from vacante v
                      where v.sezon_id = g.sezon and d::date between v.data_incepere and v.data_final)
      and curs_activ_in_luna(g.id, d::date)
  ),
  tinute as (
    select x.curs_id, count(*)::int as n
    from (select o.curs_id, o.zi from orar o
          union
          select s.curs_id, s.zi from sedinte s) x
    group by x.curs_id
  ),
  pe_sedinta as (
    select s.client, s.curs_id, count(*)::int as n
    from sedinte s
    where not exists (select 1 from abonati a where a.client = s.client and a.curs_id = s.curs_id)
    group by s.client, s.curs_id
  )
  select i.client, i.curs_id, 1::numeric, 'loc'::text, null::int, null::int
  from intregi i
  union all
  select a.client, a.curs_id, 1::numeric, 'abonament', null::int, t.n
  from abonati a
  left join tinute t on t.curs_id = a.curs_id
  union all
  select p.client, p.curs_id, least(1, p.n::numeric / t.n), 'sedinte', p.n, t.n
  from pe_sedinta p
  join tinute t on t.curs_id = p.curs_id;
$function$;
