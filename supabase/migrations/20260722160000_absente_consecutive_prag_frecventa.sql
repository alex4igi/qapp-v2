-- Pragul de absențe consecutive devine frecvență-aware: „2 săptămâni tăcere",
-- nu „2 absențe" indiferent de grupă.
--
-- Înainte pragul era fix 2 absențe, deci timpul până la alertă depindea de
-- frecvența grupei: 2×/săpt alerta după 7 zile, 1×/săpt după 14. Grupele
-- intensive intrau în listă după o singură săptămână lipsă (zgomot: o răceală).
--
-- Acum prag efectiv = p_saptamani × lecții_pe_săptămână → uniform 14 zile:
--   2×/săpt → a 4-a absență consecutivă
--   1×/săpt → a 2-a absență consecutivă
-- lecții_pe_săptămână = array_length(cursuri.zile, 1), fallback 1 (grupe fără
-- zile setate se comportă ca 1×/săpt — nu le scoatem din listă).
--
-- Parametrul se redenumește p_prag → p_saptamani (semantica s-a schimbat, numele
-- vechi ar minți) și returul capătă lectii_pe_saptamana, ca UI-ul să calibreze
-- pragul „roșu" per grupă în loc de un ≥3 fix. Ambele cer drop + create.
-- Semnătura rămâne (uuid, int) / (int), deci apelul pozițional din
-- get_pachet_luni — get_absente_consecutive(p_locatie, 2) — rămâne valid și
-- înseamnă acum 2 săptămâni, exact ce vrea KPI-ul „Elevi în risc".

-- ── 1. get_absente_consecutive — lista de risc (admin/owner, /analytics) ─────
drop function if exists get_absente_consecutive(uuid, int);

create or replace function get_absente_consecutive(
  p_locatie    uuid default null,
  p_saptamani  int  default 2
)
returns table (
  client_id            uuid,
  client_nume          text,
  curs_id              uuid,
  curs_nume            text,
  absente_consecutive  int,
  lectii_pe_saptamana  int,
  ultima_prezenta      date
)
language sql
stable
security invoker
set search_path = public
as $$
  with activi_azi as (
    select client from clienti_activi_la(current_date)
  ),
  prez as (
    select p.client, e.cursul as curs_id, p.data, p.status,
           greatest(coalesce(array_length(c.zile, 1), 1), 1) as lectii,
           row_number() over (partition by p.client, e.cursul order by p.data desc) as rn
    from prezente p
    join enrollments e on e.id = p.enrollment
      and e.reziliat = false
    join cursuri c on c.id = e.cursul
    where p.data is not null
      and coalesce(c.facultativ, false) = false
      and c.sezon = (select id from sezoane where activ = true order by data_incepere desc limit 1)
      and (p_locatie is null or c.locatie = p_locatie)
      and p.client in (select client from activi_azi)
  ),
  first_present as (
    select client, curs_id, min(rn) as rn_present
    from prez
    where status <> 'Absent'
    group by client, curs_id
  ),
  streak as (
    select p.client, p.curs_id,
           max(p.lectii)::int as lectii,
           count(*) filter (
             where p.status = 'Absent'
               and (fp.rn_present is null or p.rn < fp.rn_present)
           )::int as absente,
           max(p.data) filter (where p.status <> 'Absent') as ultima_prez
    from prez p
    left join first_present fp on fp.client = p.client and fp.curs_id = p.curs_id
    group by p.client, p.curs_id
  )
  select s.client,
         trim(format('%s %s', coalesce(cl.prenume, ''), cl.nume)) as client_nume,
         s.curs_id, cu.numele as curs_nume,
         s.absente, s.lectii, s.ultima_prez
  from streak s
  join clienti cl on cl.id = s.client
  join cursuri cu on cu.id = s.curs_id
  where s.absente >= greatest(coalesce(p_saptamani, 2), 1) * s.lectii
  order by (s.absente::numeric / s.lectii) desc, s.absente desc, client_nume
  limit 200;
$$;

revoke execute on function get_absente_consecutive(uuid, int) from anon, public;
grant execute on function get_absente_consecutive(uuid, int) to authenticated;

-- ── 2. get_absente_risc_teacher — aceeași listă, scopată pe instructor ──────
-- Pe lângă pragul nou, aliniem populația cu versiunea admin: clona din
-- 20260717110100 rămăsese pe predicatul vechi (e.activ = true, fără filtru de
-- sezon, fără garda clienti_activi_la) — exact bug-ul de flag stale pe care
-- 20260702120100 îl reparase pentru admin. Rezultat: profesorul și adminul
-- vedeau liste diferite pentru același elev.
drop function if exists get_absente_risc_teacher(int);

create or replace function get_absente_risc_teacher(p_saptamani int default 2)
returns table (
  client_id            uuid,
  client_nume          text,
  curs_id              uuid,
  curs_nume            text,
  absente_consecutive  int,
  lectii_pe_saptamana  int,
  ultima_prezenta      date
)
language sql
stable
security definer
set search_path = public
as $$
  with activi_azi as (
    select client from clienti_activi_la(current_date)
  ),
  prez as (
    select p.client, e.cursul as curs_id, p.data, p.status,
           greatest(coalesce(array_length(c.zile, 1), 1), 1) as lectii,
           row_number() over (partition by p.client, e.cursul order by p.data desc) as rn
    from prezente p
    join enrollments e on e.id = p.enrollment
      and e.reziliat = false
    join cursuri c on c.id = e.cursul
    where p.data is not null
      and coalesce(c.facultativ, false) = false
      and c.sezon = (select id from sezoane where activ = true order by data_incepere desc limit 1)
      and p.client in (select client from activi_azi)
      and (
        c.teacher = current_teacher_id()
        or exists (select 1 from cursuri_teacheri ct
                   where ct.curs_id = c.id and ct.teacher_id = current_teacher_id())
      )
  ),
  first_present as (
    select client, curs_id, min(rn) as rn_present
    from prez
    where status <> 'Absent'
    group by client, curs_id
  ),
  streak as (
    select p.client, p.curs_id,
           max(p.lectii)::int as lectii,
           count(*) filter (
             where p.status = 'Absent'
               and (fp.rn_present is null or p.rn < fp.rn_present)
           )::int as absente,
           max(p.data) filter (where p.status <> 'Absent') as ultima_prez
    from prez p
    left join first_present fp on fp.client = p.client and fp.curs_id = p.curs_id
    group by p.client, p.curs_id
  )
  select s.client,
         trim(format('%s %s', coalesce(cl.prenume, ''), cl.nume)) as client_nume,
         s.curs_id, cu.numele as curs_nume,
         s.absente, s.lectii, s.ultima_prez
  from streak s
  join clienti cl on cl.id = s.client
  join cursuri cu on cu.id = s.curs_id
  where s.absente >= greatest(coalesce(p_saptamani, 2), 1) * s.lectii
  order by (s.absente::numeric / s.lectii) desc, s.absente desc, client_nume
  limit 200;
$$;

revoke execute on function get_absente_risc_teacher(int) from anon, public;
grant execute on function get_absente_risc_teacher(int) to authenticated;
