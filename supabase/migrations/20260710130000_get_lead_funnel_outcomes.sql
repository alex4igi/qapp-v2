-- get_lead_funnel: adaugă ieșirile nu_a_venit + pierdut (pe status CURENT, în
-- cohortă). Nu sunt trepte cumulative ale funnel-ului (un pierdut iese din
-- pâlnie, nu se cuprinde în „au venit"), de aceea se raportează separat, nu ca
-- filtre monotone. Restul e neschimbat față de 20260710120000.
--
-- Schimbăm tipul de retur (2 coloane noi) ⇒ nu merge create or replace pe loc:
-- drop + recreate pe aceeași semnătură (date,date,text,text).
drop function if exists get_lead_funnel(date, date, text, text);

create function get_lead_funnel(
  p_from    date,
  p_to      date,
  p_locatie text default null,
  p_grupa   text default null
)
returns table (
  sursa_id           uuid,
  sursa_nume         text,
  leads_total        integer,
  contactati         integer,
  proba              integer,
  prezenti           integer,
  convertiti         integer,
  nu_a_venit         integer,
  pierdut            integer,
  retentie_eligibili integer,
  retentie_90z       integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with baza as (
    select
      l.sursa,
      (l.nr_contactari > 0 or l.ultima_contactare_la is not null
        or l.status <> 'nou')                                     as s_contact,
      (l.data_programare is not null
        or exists (select 1 from programari_leads pl
                   where pl.lead = l.id))                          as s_proba,
      (l.status = 'a_venit'
        or exists (select 1 from programari_leads pl
                   where pl.lead = l.id and pl.prezenta = 'prezent')) as s_prezent,
      (l.status = 'convertit')                                    as s_convertit,
      (l.status = 'nu_a_venit')                                   as s_nuavenit,
      (l.status = 'pierdut')                                      as s_pierdut,
      (l.status = 'convertit' and l.data_conversie is not null
        and l.data_conversie::date <= current_date - 90)          as s_matur,
      (l.status = 'convertit' and l.data_conversie is not null
        and l.data_conversie::date <= current_date - 90
        and exists (
          select 1
          from enrollments e
          join prezente p on p.enrollment = e.id
          where e.client = l.id_client
            and e.reziliat = false
            and p.status = 'Prezent'
            and p.data >= l.data_conversie::date + 90
        ))                                                        as s_retinut
    from leads l
    where l.created::date between p_from and p_to
      and l.status <> 'nurture'
      and (p_locatie is null or l.locatia = p_locatie)
      and (p_grupa is null or l.grupa_varsta::text = p_grupa)
  )
  select
    b.sursa                                            as sursa_id,
    coalesce(c.nume, 'Necunoscută')                    as sursa_nume,
    count(*)::int                                      as leads_total,
    count(*) filter (where b.s_contact or b.s_proba or b.s_prezent
                        or b.s_convertit)::int          as contactati,
    count(*) filter (where b.s_proba or b.s_prezent
                        or b.s_convertit)::int          as proba,
    count(*) filter (where b.s_prezent or b.s_convertit)::int as prezenti,
    count(*) filter (where b.s_convertit)::int          as convertiti,
    count(*) filter (where b.s_nuavenit)::int           as nu_a_venit,
    count(*) filter (where b.s_pierdut)::int            as pierdut,
    count(*) filter (where b.s_matur)::int              as retentie_eligibili,
    count(*) filter (where b.s_retinut)::int            as retentie_90z
  from baza b
  left join campanii_promovare c on c.id = b.sursa
  group by b.sursa, c.nume
  order by leads_total desc;
$$;
