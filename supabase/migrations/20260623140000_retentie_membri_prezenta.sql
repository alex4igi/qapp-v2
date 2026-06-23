-- Qapp v2 — Statistici/Overview: retenție membri pe PREZENȚĂ (nu pe înrolare).
--
-- PROBLEMĂ: retenția se calcula din get_crestere_neta (apartenență = înrolare care
-- acoperă luna). Dar înrolările recurente „Per luna" au data_final = NULL → o
-- singură înrolare acoperă toate lunile la nesfârșit → nimeni nu „pleacă" → rata
-- era artificial ~100% mereu, indiferent de luna comparată.
--
-- SOLUȚIE: apartenența la luna M = client cu ≥1 prezență „Prezent" în M, la cursuri
-- recurent + trupă (facultativ=false) — aceeași definiție de engagement ca
-- get_rata_prezenta_luna și consistentă cu „client activ" (prezent recent).
-- Comparăm cele două luni ÎNCHEIATE (luna curentă e în curs → incompletă).
--   retinuti = prezenți în prev ȘI în curent
--   pierduti = prezenți în prev dar NU în curent
--   baza_prev = prezenți în prev

create or replace function get_retentie_membri()
returns table (
  baza_prev integer,
  retinuti  integer,
  pierduti  integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with b as (
    select date_trunc('month', current_date)::date as m0
  ),
  ranges as (
    select
      (m0 - interval '2 month')::date                       as prev_start,
      (m0 - interval '1 month' - interval '1 day')::date     as prev_end,
      (m0 - interval '1 month')::date                        as cur_start,
      (m0 - interval '1 day')::date                          as cur_end
    from b
  ),
  prezenti_luna as (
    select distinct p.client, p.data
    from prezente p
    join enrollments e on e.id = p.enrollment
    join cursuri c on c.id = e.cursul
    where p.status = 'Prezent'
      and coalesce(c.facultativ, false) = false
      and p.client is not null
  ),
  prev_m as (
    select distinct pl.client
    from prezenti_luna pl, ranges r
    where pl.data between r.prev_start and r.prev_end
  ),
  cur_m as (
    select distinct pl.client
    from prezenti_luna pl, ranges r
    where pl.data between r.cur_start and r.cur_end
  )
  select
    (select count(*) from prev_m)::int as baza_prev,
    (select count(*) from prev_m where client in (select client from cur_m))::int as retinuti,
    (select count(*) from prev_m where client not in (select client from cur_m))::int as pierduti;
$$;

grant execute on function get_retentie_membri() to authenticated;
