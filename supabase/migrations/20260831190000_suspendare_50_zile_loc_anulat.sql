-- Regula „50 de zile" (decizie Alex, 2026-08-31):
--   Dacă trec 50 de zile peste termenul de plată, se anulează locul în grupă,
--   iar prețul promo se termină odată cu asta.
--
-- Implementare SEMI-automată (decizie Alex): cron-ul suspendă automat accesul
-- (nu mai poate intra la ore, nu mai rezervă) și anunță managerul pe email;
-- ștergerea efectivă din grupă rămâne o confirmare de om, din /datorii.
-- Rezilierea e ireversibilă și zeroizează lunile viitoare — nu o automatizăm.
--
-- SCOPUL celor 50 de zile: doar rate din SEZONUL ÎNROLĂRII, și doar sezoane vii
-- (`sezoane.data_final >= azi`). Fără gardul ăsta prima rulare ar suspenda 241 de
-- clienți — mediana 197 zile, maximul 715 — adică arhiva de datornici a școlii,
-- nu cursanții de azi. Ca să pierzi locul în 2026-2027 trebuie să ratezi o rată
-- DIN 2026-2027. Prima aplicare reală: ~9 noiembrie 2026 (20 sept + 50 zile).

-- ============================================================
-- 1. suspenda_datornici_50_zile — suspendă și întoarce lista celor NOU suspendați
--    (edge function-ul cron-morning o folosește pentru emailul către manageri)
-- ============================================================
create or replace function suspenda_datornici_50_zile()
returns table (
  client_id     uuid,
  nume          text,
  prenume       text,
  zile_depasire int,
  rest          numeric,
  cursuri       text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prag constant int := 50;
begin
  return query
  with rate as (
    select e.client, e.cursul, e.suma,
      scadenta_rata(e.data_incepere, e.sezon_id) as scadenta,
      coalesce(
        (select sum(i.suma) from incasari i where i.inregistrare = e.id), 0
      ) as achitat
    from enrollments e
    join sezoane sz on sz.id = e.sezon_id
    where e.tip_plata = 'Per luna'
      and e.activ and not e.reziliat
      and e.data_incepere is not null
      and sz.data_final >= current_date
      -- o rată creată după propriul termen n-a avut ce să rateze
      and e.created::date <= scadenta_rata(e.data_incepere, e.sezon_id)
      and scadenta_rata(e.data_incepere, e.sezon_id) < current_date - v_prag
  ),
  neachitate as (
    select r.client, r.cursul,
      (coalesce(r.suma, 0) - r.achitat) as rest,
      (current_date - r.scadenta)::int as zile
    from rate r
    where r.achitat < coalesce(r.suma, 0)
  ),
  de_suspendat as (
    select n.client,
      max(n.zile)::int as zile,
      sum(n.rest) as rest,
      string_agg(distinct c.numele, ', ') as cursuri
    from neachitate n
    left join cursuri c on c.id = n.cursul
    join clienti cl on cl.id = n.client
    where not cl.suspendat_datorii
    group by n.client
  ),
  suspendati as (
    update clienti cl
       set suspendat_datorii    = true,
           suspendat_datorii_la = now(),
           -- NULL = suspendare automată (cron); manual, set_suspendare_datorii
           -- pune auth.uid(). Discriminatorul e gratis, fără coloană nouă.
           suspendat_datorii_de = null
      from de_suspendat d
     where cl.id = d.client
    returning cl.id, cl.nume, cl.prenume
  )
  select s.id, s.nume, s.prenume, d.zile, round(d.rest), d.cursuri
  from suspendati s
  join de_suspendat d on d.client = s.id
  order by d.zile desc;
end;
$$;

revoke execute on function suspenda_datornici_50_zile() from anon, public;
grant execute on function suspenda_datornici_50_zile() to authenticated;

-- ============================================================
-- 2. „Promo se termină odată cu locul": rezilierea unei înrolări pe preț promo
--    încheie promo-ul. Trigger, nu cod de aplicație, ca să prindă TOATE căile
--    de reziliere (fișa clientului, RPC-uri, cron-uri viitoare).
--    Regula generală din 20260831170000 rămâne: promo-ul NU se pierde pentru
--    întârziere la plată. Se pierde doar dacă înrolarea însăși se încheie.
-- ============================================================
create or replace function trg_reziliere_incheie_promo()
returns trigger
language plpgsql
as $$
begin
  if new.reziliat
     and not coalesce(old.reziliat, false)
     and coalesce(old.este_reinscriere, false) then
    new.este_reinscriere := false;
    new.promo_anulat_la := coalesce(new.promo_anulat_la, now());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enrollments_reziliere_promo on enrollments;
create trigger trg_enrollments_reziliere_promo
  before update of reziliat on enrollments
  for each row execute function trg_reziliere_incheie_promo();
