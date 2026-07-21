-- Lista de risc se calculează din ȘEDINȚE ȚINUTE, nu din absențe marcate.
--
-- De ce: mecanismul vechi număra exclusiv rânduri `prezente.status = 'Absent'`.
-- Măsurat pe sezonul 2025-2026: din 2.516 ședințe, 2.057 (81,8%) n-au NICIUN
-- absent marcat; media e 8,5 prezenți și 0,42 absenți pe ședință. Profesorii
-- bifează cine a venit, nu cine lipsește — deci cursantul care se oprește pur și
-- simplu nu mai generează rânduri, seria lui nu crește și nu intră niciodată în
-- listă. Efect: în tot sezonul doar 13 perechi cursant-grupă au avut vreo serie
-- la final (maxim 4), iar la 15 martie mecanismul semnala 1 persoană din 438.
--
-- Definiția nouă, imună la cum lucrează oamenii:
--   ședințe_ratate = câte ședințe a ținut GRUPA de la ultimul semnal al elevului
--   ultimul semnal  = ultima prezență cu status <> 'Absent' (deci 'Prezent' SAU
--                     'Motivat' — absența anunțată resetează ceasul, ca înainte)
--   ședință         = zi în care grupa a avut cel puțin o prezență înregistrată
--   prag            = p_saptamani × lecții_pe_săptămână (neschimbat: 2 săpt)
-- Cine n-a venit niciodată se măsoară de la data începerii înrolării.
-- Aceeași măsurătoare pe 15 martie dă 5 persoane în loc de 1.
--
-- FĂRĂ plafon de zile. Am testat unul de 28 (ideea inițială: „fereastră de
-- intervenție de 14 zile") și tăia 4 din 5 cazuri — tocmai pe cele grave, de 29
-- până la 85 de zile de tăcere. Toți aveau înrolare activă la acea dată, deci
-- erau facturați în continuare, iar cronul auto_mark_inactiv_si_exclient NU îi
-- prinde: el cere „fără înrolare în sezonul activ". Cădeau prin ambele plase.
-- Populația e deja mărginită de `inscrisi` (înrolare ne-reziliată care acoperă
-- azi) — când ultima lună facturată se termină, omul iese singur din listă.
-- De aceea dispare și garda inline de 28 de zile din 20260722170000.
--
-- Coloana `absente_consecutive` devine `sedinte_ratate` (număra altceva; numele
-- vechi ar minți) și apare `zile_tacere`, după care se și ordonează lista.
--
-- ATENȚIE la `e.reziliat = false`: filtrul apare DOAR în `inscrisi` (cine e
-- înrolat azi). CTE-urile care OBSERVĂ prezențe trecute — `sesiuni`, `ultima`,
-- `alte_grupe` — nu-l pun, pentru că modelul are un rând de înrolare pe lună și
-- lunile vechi ajung reziliate normal. Cu filtrul pus, prezențele reale ale unui
-- cursant încă activ dispăreau: cazul real Lovin Delia (S QMotion CREW) avea
-- ultima prezență pe 14.02 legată de un rând reziliat → funcția cădea pe
-- data_incepere și raporta 14 zile de tăcere în loc de 29, cu „ultima prezență:
-- niciodată" în UI. O prezență e o prezență, indiferent ce s-a întâmplat ulterior
-- cu rândul de înrolare pe care a fost înregistrată.

-- ── 1. get_absente_consecutive (admin/owner, /analytics) ────────────────────
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
  sedinte_ratate       int,
  lectii_pe_saptamana  int,
  zile_tacere          int,
  ultima_prezenta      date,
  vine_la              text
)
language sql
stable
security invoker
set search_path = public
as $$
  with sezon_activ as (
    select id from sezoane where activ = true order by data_incepere desc limit 1
  ),
  sesiuni as (
    select e.cursul as curs_id, p.data
    from prezente p
    join enrollments e on e.id = p.enrollment
    join cursuri c on c.id = e.cursul
    where c.sezon = (select id from sezon_activ)
      and coalesce(c.facultativ, false) = false
      and p.data is not null and p.data <= current_date
      and (p_locatie is null or c.locatie = p_locatie)
    group by e.cursul, p.data
  ),
  inscrisi as (
    select e.client, e.cursul as curs_id,
           greatest(coalesce(array_length(c.zile, 1), 1), 1) as lectii,
           min(e.data_incepere) as start_data
    from enrollments e
    join cursuri c on c.id = e.cursul
    where e.client is not null
      and e.reziliat = false
      and c.sezon = (select id from sezon_activ)
      and coalesce(c.facultativ, false) = false
      and e.data_incepere <= current_date
      and (e.data_final is null or e.data_final >= current_date)
      and (p_locatie is null or c.locatie = p_locatie)
    group by e.client, e.cursul, c.zile
  ),
  ultima as (
    select e.client, e.cursul as curs_id, max(p.data) as ultima_prez
    from prezente p
    join enrollments e on e.id = p.enrollment
    join cursuri c on c.id = e.cursul
    where p.status <> 'Absent'
      and p.data is not null and p.data <= current_date
      and c.sezon = (select id from sezon_activ)
      and coalesce(c.facultativ, false) = false
    group by e.client, e.cursul
  ),
  alte_grupe as (
    select e.client, e.cursul as curs_id, max(p.data) as ultima
    from prezente p
    join enrollments e on e.id = p.enrollment
    join cursuri c on c.id = e.cursul
    where p.status = 'Prezent'
      and p.data > current_date - 45 and p.data <= current_date
      and coalesce(c.facultativ, false) = false
      and c.sezon = (select id from sezon_activ)
    group by e.client, e.cursul
  ),
  ratate as (
    select i.client, i.curs_id, i.lectii, i.start_data, u.ultima_prez,
           count(se.data)::int as sedinte_ratate
    from inscrisi i
    left join ultima u on u.client = i.client and u.curs_id = i.curs_id
    left join sesiuni se on se.curs_id = i.curs_id
      and se.data > coalesce(u.ultima_prez, i.start_data - 1)
    group by i.client, i.curs_id, i.lectii, i.start_data, u.ultima_prez
  )
  select r.client,
         trim(format('%s %s', coalesce(cl.prenume, ''), cl.nume)) as client_nume,
         r.curs_id, cu.numele as curs_nume,
         r.sedinte_ratate, r.lectii,
         (current_date - coalesce(r.ultima_prez, r.start_data))::int as zile_tacere,
         r.ultima_prez, mv.nume
  from ratate r
  join clienti cl on cl.id = r.client
  join cursuri cu on cu.id = r.curs_id
  left join lateral (
    select string_agg(distinct cu2.numele, ', ') as nume
    from alte_grupe ag
    join cursuri cu2 on cu2.id = ag.curs_id
    where ag.client = r.client
      and ag.curs_id <> r.curs_id
      and ag.ultima > coalesce(r.ultima_prez, r.start_data)
  ) mv on true
  where r.sedinte_ratate >= greatest(coalesce(p_saptamani, 2), 1) * r.lectii
  order by (current_date - coalesce(r.ultima_prez, r.start_data)) desc, client_nume
  limit 200;
$$;

revoke execute on function get_absente_consecutive(uuid, int) from anon, public;
grant execute on function get_absente_consecutive(uuid, int) to authenticated;

-- ── 2. get_absente_risc_teacher (rol teacher, /grupele-mele) ────────────────
-- `sesiuni`/`inscrisi` scopate pe instructorul curent; `alte_grupe` NU — dacă
-- elevul s-a mutat la grupa altui profesor, exact asta trebuie să afle.
drop function if exists get_absente_risc_teacher(int);

create or replace function get_absente_risc_teacher(p_saptamani int default 2)
returns table (
  client_id            uuid,
  client_nume          text,
  curs_id              uuid,
  curs_nume            text,
  sedinte_ratate       int,
  lectii_pe_saptamana  int,
  zile_tacere          int,
  ultima_prezenta      date,
  vine_la              text
)
language sql
stable
security definer
set search_path = public
as $$
  with sezon_activ as (
    select id from sezoane where activ = true order by data_incepere desc limit 1
  ),
  cursurile_mele as (
    select c.id, c.zile
    from cursuri c
    where c.sezon = (select id from sezon_activ)
      and coalesce(c.facultativ, false) = false
      and (
        c.teacher = current_teacher_id()
        or exists (select 1 from cursuri_teacheri ct
                   where ct.curs_id = c.id and ct.teacher_id = current_teacher_id())
      )
  ),
  sesiuni as (
    select e.cursul as curs_id, p.data
    from prezente p
    join enrollments e on e.id = p.enrollment
    join cursurile_mele c on c.id = e.cursul
    where p.data is not null and p.data <= current_date
    group by e.cursul, p.data
  ),
  inscrisi as (
    select e.client, e.cursul as curs_id,
           greatest(coalesce(array_length(c.zile, 1), 1), 1) as lectii,
           min(e.data_incepere) as start_data
    from enrollments e
    join cursurile_mele c on c.id = e.cursul
    where e.client is not null
      and e.reziliat = false
      and e.data_incepere <= current_date
      and (e.data_final is null or e.data_final >= current_date)
    group by e.client, e.cursul, c.zile
  ),
  ultima as (
    select e.client, e.cursul as curs_id, max(p.data) as ultima_prez
    from prezente p
    join enrollments e on e.id = p.enrollment
    join cursurile_mele c on c.id = e.cursul
    where p.status <> 'Absent'
      and p.data is not null and p.data <= current_date
    group by e.client, e.cursul
  ),
  alte_grupe as (
    select e.client, e.cursul as curs_id, max(p.data) as ultima
    from prezente p
    join enrollments e on e.id = p.enrollment
    join cursuri c on c.id = e.cursul
    where p.status = 'Prezent'
      and p.data > current_date - 45 and p.data <= current_date
      and coalesce(c.facultativ, false) = false
      and c.sezon = (select id from sezon_activ)
      and e.client in (select client from inscrisi)
    group by e.client, e.cursul
  ),
  ratate as (
    select i.client, i.curs_id, i.lectii, i.start_data, u.ultima_prez,
           count(se.data)::int as sedinte_ratate
    from inscrisi i
    left join ultima u on u.client = i.client and u.curs_id = i.curs_id
    left join sesiuni se on se.curs_id = i.curs_id
      and se.data > coalesce(u.ultima_prez, i.start_data - 1)
    group by i.client, i.curs_id, i.lectii, i.start_data, u.ultima_prez
  )
  select r.client,
         trim(format('%s %s', coalesce(cl.prenume, ''), cl.nume)) as client_nume,
         r.curs_id, cu.numele as curs_nume,
         r.sedinte_ratate, r.lectii,
         (current_date - coalesce(r.ultima_prez, r.start_data))::int as zile_tacere,
         r.ultima_prez, mv.nume
  from ratate r
  join clienti cl on cl.id = r.client
  join cursuri cu on cu.id = r.curs_id
  left join lateral (
    select string_agg(distinct cu2.numele, ', ') as nume
    from alte_grupe ag
    join cursuri cu2 on cu2.id = ag.curs_id
    where ag.client = r.client
      and ag.curs_id <> r.curs_id
      and ag.ultima > coalesce(r.ultima_prez, r.start_data)
  ) mv on true
  where r.sedinte_ratate >= greatest(coalesce(p_saptamani, 2), 1) * r.lectii
  order by (current_date - coalesce(r.ultima_prez, r.start_data)) desc, client_nume
  limit 200;
$$;

revoke execute on function get_absente_risc_teacher(int) from anon, public;
grant execute on function get_absente_risc_teacher(int) to authenticated;
