-- Raportul unei clase demo: inscrisi -> prezenti -> convertiti -> contract semnat.
--
-- `security invoker`, ca `get_lead_funnel`: rularea cu drepturile apelantului
-- pastreaza efectiv `deny_marketing_direct` pe `contracte`/`clienti` (agentia de
-- ads nu trebuie sa vada cine a semnat).
--
-- Un singur RPC, randuri per slot. Agregarea pe campanie se face in React —
-- vorbim de zeci de sloturi, nu de mii.
--
-- „Contract semnat": preferam `contracte.client_id`. Cand e null cadem pe familia
-- clientului, dar DOAR pentru contracte create dupa data demoului.
-- ⚠️ Compromis asumat: un contract de familie semnat dupa demo pentru un FRATE
-- poate da fals-pozitiv pe ramura de familie. Varianta stricta (doar client_id)
-- subnumara, fiindca fluxul de conversie creeaza contractul pe familie.

create or replace function get_demo_funnel(
  p_from     date,
  p_to       date,
  p_campanie uuid default null
)
returns table (
  eveniment_id            uuid,
  nume                    text,
  data                    date,
  ora                     text,
  locatie_nume            text,
  sala_nume               text,
  campanie_id             uuid,
  campanie_nume           text,
  curs_tinta_id           uuid,
  curs_tinta_nume         text,
  capacitate              int,
  inscrisi                int,
  prezenti                int,
  absenti                 int,
  clienti_participanti    int,
  convertiti              int,
  inscrisi_pe_grupa_tinta int,
  contract_semnat         int
)
language sql
stable
security invoker
set search_path = public
as $$
  with ev as (
    select e.*
      from evenimente e
     where e.tip = 'DEMO Class'
       and e.data between p_from and p_to
       and (p_campanie is null or e.campanie = p_campanie)
  ),
  lead_rows as (
    select pl.eveniment_programat as ev_id, pl.prezenta, l.id as lead_id,
           l.status, l.id_client
      from programari_leads pl
      join leads l on l.id = pl.lead
     where pl.eveniment_programat in (select id from ev)
  ),
  client_rows as (
    select ep.eveniment as ev_id, ep.prezenta
      from evenimente_participanti ep
     where ep.eveniment in (select id from ev)
  )
  select
    e.id,
    e.nume_eveniment,
    e.data,
    e.ora,
    loc.nume,
    s.nume,
    e.campanie,
    camp.nume,
    e.curs_tinta,
    ct.numele,
    e.capacitate,
    (select count(*) from lead_rows lr where lr.ev_id = e.id)
      + (select count(*) from client_rows cr where cr.ev_id = e.id),
    (select count(*) from lead_rows lr where lr.ev_id = e.id and lr.prezenta = 'prezent')
      + (select count(*) from client_rows cr where cr.ev_id = e.id and cr.prezenta = 'prezent'),
    (select count(*) from lead_rows lr where lr.ev_id = e.id and lr.prezenta = 'absent')
      + (select count(*) from client_rows cr where cr.ev_id = e.id and cr.prezenta = 'absent'),
    (select count(*) from client_rows cr where cr.ev_id = e.id),
    (select count(*) from lead_rows lr where lr.ev_id = e.id and lr.status = 'convertit'),
    (select count(*) from lead_rows lr
      where lr.ev_id = e.id and lr.id_client is not null and e.curs_tinta is not null
        and exists (
          select 1 from enrollments en
           where en.client = lr.id_client and en.cursul = e.curs_tinta
             and en.activ = true and en.reziliat = false
        )),
    (select count(*) from lead_rows lr
      where lr.ev_id = e.id and lr.id_client is not null
        and exists (
          select 1 from contracte c
           where c.status in ('semnat', 'finalizat')
             and (
               c.client_id = lr.id_client
               or (c.client_id is null
                   and c.familie_id = (select familia from clienti where id = lr.id_client)
                   and c.created >= e.data)
             )
        ))
  from ev e
  left join locatii loc  on loc.id = e.locatie_id
  left join sali    s    on s.id   = e.sala
  left join campanii_promovare camp on camp.id = e.campanie
  left join cursuri ct   on ct.id  = e.curs_tinta
  order by e.data asc, e.ora asc nulls last;
$$;

revoke execute on function get_demo_funnel(date, date, uuid) from anon, public;
grant  execute on function get_demo_funnel(date, date, uuid) to authenticated;
