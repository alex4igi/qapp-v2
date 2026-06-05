-- Qapp v2 — Privire de ansamblu: redefinire „client activ" (hibrid).
--
-- Definiție confirmată de user (2026-06-06):
--   * Curs RECURENT / Trupă (facultativ=false): clientul e activ dacă are o
--     înrolare activă care acoperă luna curentă (abonamentul = angajament lunar).
--   * Curs FACULTATIV (facultativ=true, plată per ședință): înrolarea nu e
--     suficientă — clientul e activ doar dacă are ≥1 `Prezent` în ultimele 21 zile
--     pe acea înrolare facultativă.
--
-- Motiv: clienti.status='Activ' e nedemn de încredere momentan (cronul
-- auto_mark_inactiv_si_exclient nu rulează pe prod → EXclient=0, status umflat de
-- import). Definiția hibridă citește direct din înrolări + prezențe, deci e corectă
-- indiferent de starea cronului. [[project-facultativ-fara-prorata]]
--
-- Rândul cu locatie_id=NULL = total unic pe club; restul = per locație (un client
-- poate apărea la mai multe locații → totalul NU e suma rândurilor).

create or replace function get_clienti_activi()
returns table (
  locatie_id   uuid,
  locatie_nume text,
  activi       integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with params as (
    select
      date_trunc('month', current_date)::date as start_luna,
      (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date as end_luna,
      (current_date - interval '21 days')::date as cut21
  ),
  inrolari_active as (
    select e.id, e.client, c.locatie, c.facultativ
    from enrollments e
    join cursuri c on c.id = e.cursul
    cross join params p
    where e.activ = true
      and e.reziliat = false
      and e.data_incepere <= p.end_luna
      and (e.data_final is null or e.data_final >= p.start_luna)
  ),
  -- înrolări care „califică" clientul drept activ
  calificate as (
    select ia.client, ia.locatie
    from inrolari_active ia
    cross join params p
    where ia.facultativ = false
       or exists (
         select 1 from prezente pr
         where pr.enrollment = ia.id
           and pr.status = 'Prezent'
           and pr.data >= p.cut21
       )
  ),
  per_locatie as (
    select loc.id as locatie_id, loc.nume as locatie_nume,
           count(distinct ca.client)::int as activi
    from locatii loc
    join calificate ca on ca.locatie = loc.id
    group by loc.id, loc.nume
  ),
  total as (
    select null::uuid as locatie_id, 'Total club'::text as locatie_nume,
           count(distinct client)::int as activi
    from calificate
  )
  select locatie_id, locatie_nume, activi from total
  union all
  select locatie_id, locatie_nume, activi from per_locatie
  order by locatie_id nulls first, locatie_nume;
$$;

grant execute on function get_clienti_activi() to authenticated;
