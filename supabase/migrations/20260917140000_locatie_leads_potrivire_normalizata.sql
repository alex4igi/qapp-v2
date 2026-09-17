-- Filtrul de locație peste `leads.locatia` devine potrivire NORMALIZATĂ.
--
-- `leads.locatia` e text liber cu eticheta scurtă („Ștefan cel Mare"), dar
-- selectoarele din /statistici (Funnel leads) și /analytics (Conversie lead →
-- client) trimit `locatii.nume` („Galeriile Stefan cel Mare"). Egalitatea
-- strictă întorcea 0 leaduri pe cea mai mare locație, tăcut: pe 17 sept 2026
-- pâlnia arăta 0 în loc de 209 pe ultimele 12 luni. Aceeași normalizare e deja
-- folosită în get_pachet_luni (vezi 20260703160000).

create or replace function locatie_norm(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select btrim(translate(lower(coalesce(p, '')), 'ăâîșşțţ', 'aaisstt'))
$$;

comment on function locatie_norm(text) is
  'Nume de locație normalizat (lowercase, fără diacritice) pentru potriviri text.';

-- Substring bidirecțional: „galeriile stefan cel mare" ⊃ „stefan cel mare".
-- Cele 3 locații au nume disjuncte, deci nu apar fals-pozitive.
create or replace function locatie_label_match(a text, b text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select s.na <> '' and s.nb <> ''
     and (position(s.na in s.nb) > 0 or position(s.nb in s.na) > 0)
  from (select locatie_norm(a) as na, locatie_norm(b) as nb) s
$$;

revoke execute on function locatie_norm(text) from anon, public;
revoke execute on function locatie_label_match(text, text) from anon, public;
grant execute on function locatie_norm(text) to authenticated;
grant execute on function locatie_label_match(text, text) to authenticated;

-- ── get_lead_funnel: identic cu 20260828220100, doar filtrul de locație se
--    schimbă (l.locatia = p_locatie → locatie_label_match).
create or replace function get_lead_funnel(
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
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Gardă dublă: auth_role() cade pe front_desk la tokenurile fără rol, deci
  -- conturile de portal se exclud explicit (vezi 20260721100200).
  if is_parinte() or auth_role() not in
     ('owner', 'admin', 'manager', 'front_desk', 'marketing') then
    raise exception 'Acces refuzat.';
  end if;

  return query
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
      and (p_locatie is null or locatie_label_match(l.locatia, p_locatie))
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
end;
$$;

revoke execute on function get_lead_funnel(date, date, text, text) from anon, public;
grant execute on function get_lead_funnel(date, date, text, text) to authenticated;

-- ── get_conversie_leads: aceeași corecție (cardul „Conversie lead → client"
--    din /analytics primea tot `locatii.nume`).
create or replace function get_conversie_leads(
  p_luni    integer default 6,
  p_locatie text default null
)
returns table (
  total_leads  integer,
  convertiti   integer,
  procent      numeric,
  zile_medii   numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with bounds as (
    select (date_trunc('month', current_date)
            - make_interval(months => greatest(coalesce(p_luni,6),1) - 1))::date as start_luna
  ),
  lead_set as (
    select l.status, l.data_conversie, l.created
    from leads l, bounds b
    where l.created >= b.start_luna
      and l.status <> 'nurture'
      and (p_locatie is null or locatie_label_match(l.locatia, p_locatie))
  )
  select
    count(*)::int as total_leads,
    count(*) filter (where status = 'convertit')::int as convertiti,
    case when count(*) > 0
         then round(100.0 * count(*) filter (where status = 'convertit') / count(*), 1)
         else 0 end as procent,
    round(avg(extract(epoch from (data_conversie - created)) / 86400.0)
          filter (where status = 'convertit' and data_conversie is not null), 1) as zile_medii
  from lead_set;
$$;

revoke execute on function get_conversie_leads(integer, text) from anon, public;
grant execute on function get_conversie_leads(integer, text) to authenticated;
