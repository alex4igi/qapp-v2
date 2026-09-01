-- Stocul de restanțe exclude datoriile PRESCRISE (mai vechi de 2 ani), ca în
-- definiția canonică a modulului /datorii (20260824180000). Fără asta,
-- „stoc total" afișat lângă bază conținea arhiva istorică importată din v1 și
-- arăta dublul realității (28.251 lei în oct. 2025 față de ~15.000 reali),
-- ceea ce ar fi făcut indicatorul de necitit pentru manager.
--
-- Baza de calcul nu se schimbă (era deja limitată la banda 30 zile – 1 an);
-- se corectează doar cifrele de context.

create or replace function kpi_k2(
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
    select make_date(p_anul, p_luna, 1) as prima_zi,
           (make_date(p_anul, p_luna, 1) + interval '1 month')::date as luna_urm,
           coalesce((p_parametri ->> 'zile_min')::int, 30) as zile_min,
           coalesce((p_parametri ->> 'zile_max')::int, 365) as zile_max
  ),
  candidati as (
    select e.id, e.suma, e.data_incepere, e.sezon_id,
           scadenta_rata(e.data_incepere, e.sezon_id) as scadenta,
           coalesce((select sum(i.suma) from incasari i
                      where i.inregistrare = e.id
                        and i.data < (select prima_zi from param)), 0) as platit_pana_la_z1
    from enrollments e
    join cursuri c on c.id = e.cursul
    left join sali s on s.id = c.sala
    where e.data_incepere is not null
      and e.reziliat = false
      and coalesce(c.locatie, s.locatie) = any(p_locatii)
      and e.data_incepere < (select prima_zi from param)
      -- prescris: aceeași regulă ca `plati_inrolari.prescris`
      and e.data_incepere >= (select prima_zi from param) - interval '2 years'
  ),
  stoc as (
    select c.id,
           c.suma - c.platit_pana_la_z1 as rest,
           ((select prima_zi from param) - c.scadenta)::int as vechime
    from candidati c
    where c.scadenta is not null
      and c.suma - c.platit_pana_la_z1 > 0
      and c.scadenta < (select prima_zi from param) - (select zile_min from param)
  ),
  in_baza as (
    select * from stoc where vechime <= (select zile_max from param)
  ),
  recuperari as (
    select b.id, b.vechime,
           coalesce((select sum(i.suma) from incasari i
                      where i.inregistrare = b.id
                        and i.data >= (select prima_zi from param)
                        and i.data <  (select luna_urm from param)), 0) as recuperat
    from in_baza b
  )
  select jsonb_build_object(
    'kpi', 'restante_recuperate',
    'stoc_total',    round((select coalesce(sum(rest), 0) from stoc), 2),
    'stoc_peste_max',round((select coalesce(sum(rest), 0) from stoc
                             where vechime > (select zile_max from param)), 2),
    'numitor',       round((select coalesce(sum(rest), 0) from in_baza), 2),
    'numarator',     round((select coalesce(sum(recuperat), 0) from recuperari), 2),
    'valoare', case when (select coalesce(sum(rest), 0) from in_baza) = 0 then null
                    else round((select coalesce(sum(recuperat), 0) from recuperari)
                               / (select sum(rest) from in_baza) * 100, 1) end,
    'nr_datornici', (select count(*) from in_baza),
    'benzi', jsonb_build_object(
      'stoc_30_90',      round((select coalesce(sum(rest), 0) from in_baza where vechime <= 90), 2),
      'stoc_90_max',     round((select coalesce(sum(rest), 0) from in_baza where vechime > 90), 2),
      'recuperat_30_90', round((select coalesce(sum(r.recuperat), 0) from recuperari r where r.vechime <= 90), 2),
      'recuperat_90_max',round((select coalesce(sum(r.recuperat), 0) from recuperari r where r.vechime > 90), 2)
    )
  );
$$;

revoke execute on function kpi_k2(uuid[], int, int, jsonb) from anon, public;
grant execute on function kpi_k2(uuid[], int, int, jsonb) to authenticated;
