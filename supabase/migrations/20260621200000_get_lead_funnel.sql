-- Qapp v2 — Funnel leads: Lead → Contact → Probă → Prezent → Înscriere → Retenție 90z
--
-- Cohortă pe data intrării lead-ului (leads.created), urmărit prin toate
-- etapele. Funnel-ul se construiește pe SEMNALE PERSISTENTE, nu pe coloana
-- curentă din kanban (statusul e terminal — un lead 'convertit' nu mai apare
-- în 'contactat'/'programat'/'a_venit', deci numărarea pe status ar fi greșită).
--
-- Treptele sunt CUMULATIVE: un lead care a ajuns mai departe contează și în
-- etapele anterioare, chiar dacă un flag intermediar n-a fost setat (igienă CRM
-- imperfectă). Astfel funnel-ul e mereu monoton descrescător.
--
-- Retenție 90z = onestă: clientul convertit are o înrolare neziliată ȘI o
-- prezență REALĂ ('Prezent') la ≥90 zile după conversie. `retentie_eligibili`
-- = convertiți suficient de „maturi" (conversie ≤ azi−90z) ca să poată fi
-- evaluați — altfel cohortele noi ar arăta fals 0%.
--
-- Filtru locație: leads.locatia e TEXT label ('Ștefan cel Mare'/'Nicolina').

create or replace function get_lead_funnel(
  p_from    date,
  p_to      date,
  p_locatie text default null
)
returns table (
  sursa_id           uuid,
  sursa_nume         text,
  leads_total        integer,
  contactati         integer,
  proba              integer,
  prezenti           integer,
  convertiti         integer,
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
      -- semnale per-etapă (booleeni)
      (l.nr_contactari > 0 or l.ultima_contactare_la is not null
        or l.status <> 'nou')                                     as s_contact,
      (l.data_programare is not null
        or exists (select 1 from programari_leads pl
                   where pl.lead = l.id))                          as s_proba,
      -- „prezent la probă": coloana a_venit a fost dropuită în funnel_v2;
      -- adevărul persistent e prezenta din programari_leads (sau statusul curent)
      (l.status = 'a_venit'
        or exists (select 1 from programari_leads pl
                   where pl.lead = l.id and pl.prezenta = 'prezent')) as s_prezent,
      (l.id_client is not null)                                   as s_convertit,
      (l.id_client is not null and l.data_conversie is not null
        and l.data_conversie::date <= current_date - 90)          as s_matur,
      (l.id_client is not null and l.data_conversie is not null
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
      and (p_locatie is null or l.locatia = p_locatie)
  )
  select
    b.sursa                                            as sursa_id,
    coalesce(c.nume, 'Necunoscută')                    as sursa_nume,
    count(*)::int                                      as leads_total,
    -- cumulativ: fiecare etapă include cei care au ajuns mai departe
    count(*) filter (where b.s_contact or b.s_proba or b.s_prezent
                        or b.s_convertit)::int          as contactati,
    count(*) filter (where b.s_proba or b.s_prezent
                        or b.s_convertit)::int          as proba,
    count(*) filter (where b.s_prezent or b.s_convertit)::int as prezenti,
    count(*) filter (where b.s_convertit)::int          as convertiti,
    count(*) filter (where b.s_matur)::int              as retentie_eligibili,
    count(*) filter (where b.s_retinut)::int            as retentie_90z
  from baza b
  left join campanii_promovare c on c.id = b.sursa
  group by b.sursa, c.nume
  order by leads_total desc;
$$;

grant execute on function get_lead_funnel(date, date, text) to authenticated;
