-- K5 și pâlnia de leaduri nu mai exclud Nurture în bloc, ci după MOTIV.
--
-- `status <> 'nurture'` era o poartă din care se putea ieși: orice lead mutat în
-- Nurture dispărea din numitor, deci indicatorul de conversie creștea exact
-- atunci când munca nu se făcea. Decizia din 09-17: Nurture rămâne în numitor.
--
-- Ies din numitor doar rândurile care n-au fost niciodată leaduri de vânzare:
--   ex_client — umbra unui fost cursant, ținută pentru campanii de reînscriere
--   import    — turnat direct în Nurture de un import, n-a intrat în pipeline
--   istoric   — rând vechi, fără poveste cunoscută
-- `neatins` NU e în listă, deliberat: un lead pe care nu l-a sunat nimeni e o
-- conversie ratată, nu un rând străin.
--
-- Efectul măsurat pe cohorta august 2026 (dry-run 18 sept., înainte de aplicare):
--   Ștefan cel Mare  24/45 = 53,3%  →  24/55 = 43,6%
--   Nicolina          2/13 = 15,4%  →   2/20 = 10,0%
--   Quasar 4 Kids     3/27 = 11,1%  →   3/32 =  9,4%
-- Scăderea e diferența dintre ce s-a raportat și ce s-a întâmplat.

-- ── Predicatul, într-un singur loc ──────────────────────────────────────────

create or replace function lead_intra_in_palnie(p_motiv_categorie text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(p_motiv_categorie, '') not in ('ex_client', 'import', 'istoric')
$$;

comment on function lead_intra_in_palnie(text) is
  'Leadul contează în numitorul conversiei? Nu: umbrele de foști cursanți, importurile și rândurile istorice. Da: tot restul, Nurture inclus.';

revoke execute on function lead_intra_in_palnie(text) from anon, public;
grant execute on function lead_intra_in_palnie(text) to authenticated;

-- ── K5 · identic cu 20260917160000, în afară de filtrul cohortei ────────────

create or replace function kpi_k5(
  p_locatii   uuid[],
  p_anul      int,
  p_luna      int,
  p_parametri jsonb default '{}'::jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with param as (
    select least(greatest(coalesce((p_parametri ->> 'fereastra_zile')::int, 30), 1), 180) as fereastra,
           least(greatest(coalesce((p_parametri ->> 'decalaj_luni')::int, 1), 0), 3) as decalaj
  ),
  cohorta_luna as (
    select (make_date(p_anul, p_luna, 1)
            - make_interval(months => (select decalaj from param)))::date as prima_zi
  ),
  toti as (
    select l.id, l.id_client, l.locatie_id, l.deja_client,
           (l.created at time zone 'Europe/Bucharest')::date as zi_creare
    from leads l, cohorta_luna cl
    where (l.created at time zone 'Europe/Bucharest')::date >= cl.prima_zi
      and (l.created at time zone 'Europe/Bucharest')::date < (cl.prima_zi + interval '1 month')::date
      and lead_intra_in_palnie(l.motiv_categorie)
  ),
  cohorta as (
    select * from toti
    where locatie_id = any(p_locatii)
      and coalesce(deja_client, false) = false
  ),
  verdict as (
    select c.id,
           c.id_client is not null and exists (
             select 1 from incasari i, param p
             where i.client = c.id_client
               and i.suma > 0
               and i.data >= c.zi_creare
               and i.data <= c.zi_creare + p.fereastra
           ) as convertit
    from cohorta c
  )
  select jsonb_build_object(
    'kpi', 'conversie_lead',
    'numitor',   (select count(*) from cohorta),
    'numarator', (select count(*) from verdict where convertit),
    'valoare', case when (select count(*) from cohorta) = 0 then null
                    else round((select count(*) from verdict where convertit)::numeric
                               / (select count(*) from cohorta) * 100, 1) end,
    'luna_cohortei',  to_char((select prima_zi from cohorta_luna), 'YYYY-MM'),
    'fereastra_zile', (select fereastra from param),
    'decalaj_luni',   (select decalaj from param),
    'fara_locatie',   (select count(*) from toti where locatie_id is null),
    'deja_clienti',   (select count(*) from toti
                        where locatie_id = any(p_locatii) and coalesce(deja_client, false))
  );
$$;

revoke execute on function kpi_k5(uuid[], int, int, jsonb) from anon, public;
grant execute on function kpi_k5(uuid[], int, int, jsonb) to authenticated;

-- ── Pâlnia · identică cu 20260917140000, în afară de același filtru ─────────

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
      and lead_intra_in_palnie(l.motiv_categorie)
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

-- ── Cardul „Conversie lead → client" din /analytics ─────────────────────────

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
      and lead_intra_in_palnie(l.motiv_categorie)
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

-- ── De ce pleacă leadurile ──────────────────────────────────────────────────
-- Prima cifră care răspunde la „ce pierdem și de ce". Până acum motivul era
-- text liber pe 24 de rânduri, în 24 de formulări.

create or replace function get_lead_motive(p_from date, p_to date)
returns table (
  status      text,
  categorie   text,
  in_palnie   boolean,
  nr          integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if is_parinte() or auth_role() not in
     ('owner', 'admin', 'manager', 'front_desk', 'marketing') then
    raise exception 'Acces refuzat.';
  end if;

  return query
  select l.status::text,
         coalesce(l.motiv_categorie, '(fără motiv)')::text,
         lead_intra_in_palnie(l.motiv_categorie),
         count(*)::int
  from leads l
  where l.created::date between p_from and p_to
    and l.status in ('nurture', 'pierdut')
  group by 1, 2, 3
  order by 4 desc;
end;
$$;

revoke execute on function get_lead_motive(date, date) from anon, public;
grant execute on function get_lead_motive(date, date) to authenticated;
