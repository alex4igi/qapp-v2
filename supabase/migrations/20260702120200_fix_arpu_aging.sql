-- Qapp v2 — fixuri de calcul găsite la auditul /analytics (2026-07-02).
--
-- 1. get_arpu_trend: numărătorul era TOATE încasările lunii (orice client,
--    orice categorie), numitorul doar clienții „activi" → ARPU umflat.
--    Acum: ARPU = venit RECURENT (categorie 'Abonament') ÷ clienți activi
--    canonic în lună — comparabil lună-la-lună. (Alternativa venit-total ÷
--    plătitori-distincți e mai volatilă la merch/bilete; respinsă.)
--
-- 2. get_restante_aging: vârsta datoriei era azi − data_incepere a înrolării,
--    nu scadența reală → o rată din luna curentă apărea „datorie de 30 zile"
--    înainte de termen. Acum: vârsta = azi − scadență, cu scadența canonică
--    (prima/ultima rată din sezon dacă sunt definite, altfel ziua 15 a lunii
--    facturate — același CASE ca get_sms_recipients, 20260608150000). Ratele
--    cu scadență în viitor intră în bucketul nou „Nescadent".

create or replace function get_arpu_trend(
  p_from    date,
  p_to      date,
  p_locatie uuid default null
)
returns table (
  luna           text,
  venit          numeric,
  clienti_activi int,
  arpu           numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with months as (
    select to_char(gs, 'YYYY-MM') as luna,
           gs::date as m_start
    from generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month') gs
  ),
  venit as (
    select to_char(date_trunc('month', i.data), 'YYYY-MM') as luna, sum(i.suma) as s
    from incasari i
    where i.categorie = 'Abonament'
      and i.data >= date_trunc('month', p_from)
      and i.data < date_trunc('month', p_to) + interval '1 month'
      and (p_locatie is null or i.locatie = p_locatie)
    group by 1
  ),
  activi as (
    select m.luna, count(distinct ia.client)::int as n
    from months m
    cross join lateral inrolari_active_luna(m.m_start) ia
    join cursuri c on c.id = ia.cursul
    where (p_locatie is null or c.locatie = p_locatie)
    group by m.luna
  )
  select m.luna,
         coalesce(v.s, 0) as venit,
         coalesce(a.n, 0) as clienti_activi,
         case when coalesce(a.n, 0) > 0 then round(coalesce(v.s, 0) / a.n, 0) else null end as arpu
  from months m
  left join venit v on v.luna = m.luna
  left join activi a on a.luna = m.luna
  order by m.luna;
$$;

grant execute on function get_arpu_trend(date, date, uuid) to authenticated;

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
      (e.data_incepere < (current_date - interval '2 years')) as prescris
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
    where rest > 0 and not prescris
  )
  select b.bucket,
         coalesce(sum(f.rest), 0) as total,
         count(f.rest)::int as nr
  from (values ('Nescadent'), ('0-30'), ('31-60'), ('61-90'), ('90+')) b(bucket)
  left join flagged f on f.bucket = b.bucket
  where is_admin()
  group by b.bucket
  order by array_position(array['Nescadent','0-30','31-60','61-90','90+'], b.bucket);
$$;

grant execute on function get_restante_aging(uuid) to authenticated;
