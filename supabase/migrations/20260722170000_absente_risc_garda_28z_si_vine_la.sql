-- Lista de risc: (1) fereastră de vizibilitate de 14 zile, (2) notiță „vine la".
--
-- (1) GARDA. Pragul nou (20260722160000) e la 14 zile de tăcere, dar garda
-- `clienti_activi_la(current_date)` scotea din listă pe oricine n-avea prezență
-- de 21 de zile → cursantul era vizibil doar 7 zile (ziua 14 → ziua 21) înainte
-- să dispară. Ridicăm garda la 28 de zile DOAR aici, inline: helperul canonic
-- clienti_activi_la rămâne pe 21 (îl folosesc headcount-ul, MRR, get_pachet_luni
-- — vezi 20260702120000), la fel cronul auto_mark_inactiv_si_exclient (21/45).
-- Rezultat: fereastră ziua 14 → ziua 28 = 14 zile de intervenție.
--
-- Condiția inline replică inrolari_active_la, cu 28 în loc de 21:
--   activ ⟺ înrolare ne-reziliată care acoperă azi  SAU  'Prezent' în (azi-28, azi]
--
-- (2) VINE_LA. Cerință Alex: „pentru cei care s-au mutat la altă grupă să apară
-- notiță la ce grupă s-a mutat, să se știe" — ca recepția să nu sune degeaba.
-- Sursa NU e mutarea formală: `muta cursant` (enrollment-admin.ts) face UPDATE pe
-- enrollments.cursul, deci prezențele vechi se re-atribuie grupei noi și cursantul
-- mutat curat NU mai apare deloc în lista grupei vechi. Cazurile care ajung totuși
-- în listă sunt mutările făcute „de mână" (înrolare nouă la B, cea de la A lăsată
-- să curgă) și cursanții înscriși la 2 grupe care renunță la una. Pentru amândouă
-- semnalul util e același și e factual: la ce grupă a fost prezent MAI RECENT
-- decât la asta. De aceea coloana se numește `vine_la`, nu `mutat_la` — nu putem
-- dovedi intenția de mutare, doar unde vine omul acum.
--
-- Fără filtru de locație pe `alte_grupe`: o mutare la cealaltă sală trebuie să se
-- vadă. Fereastra de 45 de zile mărginește scanarea (max tăcere relevantă = 28z).

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
  absente_consecutive  int,
  lectii_pe_saptamana  int,
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
  activi_azi as (
    select distinct e.client
    from enrollments e
    left join cursuri c on c.id = e.cursul
    where e.client is not null
      and (p_locatie is null or c.locatie = p_locatie)
      and (
        (e.reziliat = false
          and e.data_incepere <= current_date
          and (e.data_final is null or e.data_final >= current_date))
        or exists (
          select 1 from prezente p
          where p.enrollment = e.id
            and p.status = 'Prezent'
            and p.data > current_date - 28
            and p.data <= current_date
        )
      )
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
      and c.sezon = (select id from sezon_activ)
      and (p_locatie is null or c.locatie = p_locatie)
      and p.client in (select client from activi_azi)
  ),
  alte_grupe as (
    select p.client, e.cursul as curs_id, max(p.data) as ultima
    from prezente p
    join enrollments e on e.id = p.enrollment and e.reziliat = false
    join cursuri c on c.id = e.cursul
    where p.status = 'Prezent'
      and p.data > current_date - 45
      and p.data <= current_date
      and coalesce(c.facultativ, false) = false
      and c.sezon = (select id from sezon_activ)
      and p.client in (select client from activi_azi)
    group by p.client, e.cursul
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
         s.absente, s.lectii, s.ultima_prez, mv.nume
  from streak s
  join clienti cl on cl.id = s.client
  join cursuri cu on cu.id = s.curs_id
  left join lateral (
    select string_agg(distinct cu2.numele, ', ') as nume
    from alte_grupe ag
    join cursuri cu2 on cu2.id = ag.curs_id
    where ag.client = s.client
      and ag.curs_id <> s.curs_id
      and ag.ultima > coalesce(s.ultima_prez, current_date - 45)
  ) mv on true
  where s.absente >= greatest(coalesce(p_saptamani, 2), 1) * s.lectii
  order by (s.absente::numeric / s.lectii) desc, s.absente desc, client_nume
  limit 200;
$$;

revoke execute on function get_absente_consecutive(uuid, int) from anon, public;
grant execute on function get_absente_consecutive(uuid, int) to authenticated;

-- ── 2. get_absente_risc_teacher (rol teacher, /grupele-mele) ────────────────
-- Aceeași populație și aceleași reguli, scopate pe instructorul curent.
-- `alte_grupe` NU e scopat pe instructor: dacă elevul s-a mutat la grupa altui
-- profesor, exact asta trebuie să afle.
drop function if exists get_absente_risc_teacher(int);

create or replace function get_absente_risc_teacher(p_saptamani int default 2)
returns table (
  client_id            uuid,
  client_nume          text,
  curs_id              uuid,
  curs_nume            text,
  absente_consecutive  int,
  lectii_pe_saptamana  int,
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
  activi_azi as (
    select distinct e.client
    from enrollments e
    where e.client is not null
      and (
        (e.reziliat = false
          and e.data_incepere <= current_date
          and (e.data_final is null or e.data_final >= current_date))
        or exists (
          select 1 from prezente p
          where p.enrollment = e.id
            and p.status = 'Prezent'
            and p.data > current_date - 28
            and p.data <= current_date
        )
      )
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
      and c.sezon = (select id from sezon_activ)
      and p.client in (select client from activi_azi)
      and (
        c.teacher = current_teacher_id()
        or exists (select 1 from cursuri_teacheri ct
                   where ct.curs_id = c.id and ct.teacher_id = current_teacher_id())
      )
  ),
  alte_grupe as (
    select p.client, e.cursul as curs_id, max(p.data) as ultima
    from prezente p
    join enrollments e on e.id = p.enrollment and e.reziliat = false
    join cursuri c on c.id = e.cursul
    where p.status = 'Prezent'
      and p.data > current_date - 45
      and p.data <= current_date
      and coalesce(c.facultativ, false) = false
      and c.sezon = (select id from sezon_activ)
      and p.client in (select client from prez)
    group by p.client, e.cursul
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
         s.absente, s.lectii, s.ultima_prez, mv.nume
  from streak s
  join clienti cl on cl.id = s.client
  join cursuri cu on cu.id = s.curs_id
  left join lateral (
    select string_agg(distinct cu2.numele, ', ') as nume
    from alte_grupe ag
    join cursuri cu2 on cu2.id = ag.curs_id
    where ag.client = s.client
      and ag.curs_id <> s.curs_id
      and ag.ultima > coalesce(s.ultima_prez, current_date - 45)
  ) mv on true
  where s.absente >= greatest(coalesce(p_saptamani, 2), 1) * s.lectii
  order by (s.absente::numeric / s.lectii) desc, s.absente desc, client_nume
  limit 200;
$$;

revoke execute on function get_absente_risc_teacher(int) from anon, public;
grant execute on function get_absente_risc_teacher(int) to authenticated;
