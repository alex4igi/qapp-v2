-- O ședință facultativă se numără într-o SINGURĂ lună — cea în care a fost ținută.
--
-- Corecție a lui Alex (16 sept. 2026): regula de 30 de zile rămâne, dar numai
-- pentru ocuparea unei ZILE („un facultativ se numără încă 30 de zile după data
-- înrolării"). Pe LUNĂ, fereastra de 30 de zile atingea două luni, deci o
-- ședință plătită o dată intra în bonusul managerului de două ori.
--
-- Deci două citiri ale aceleiași definiții:
--   - pe zi   (Overview, liste, agendă, fișa pe luna curentă): abonamentul ține
--     locul cât îi ține fereastra, ședința 30 de zile de la data ei;
--   - pe lună (bani: prag minim, bonusuri, fișa pe o lună încheiată): ședința
--     aparține lunii în care a fost ținută, o singură dată.
-- Abonamentele se citesc la fel în ambele.

-- ============================================================
-- 1. Nucleul comun
-- ============================================================
create or replace function _locuri_ocupate(
  p_de              date,
  p_pana            date,
  p_cursuri         uuid[],
  p_sedinta_30_zile boolean
)
returns table (curs_id uuid, ocupate integer)
language sql
stable
security invoker
set search_path = public
as $$
  select e.cursul, count(distinct e.client)::int
  from enrollments e
  where e.cursul = any(p_cursuri)
    and e.client is not null
    and e.suma > 0
    -- Rezervarea OPEN anulată nu primește dată de reziliere și își păstrează
    -- suma. Nu se citește din `activ`: bifa se stinge și la închiderea sezonului,
    -- pe toate ședințele valide.
    and not (
      e.tip_plata = 'Per sedinta'
      and exists (select 1 from open_rezervari r
                  where r.enrollment = e.id and r.status = 'anulat')
    )
    and e.data_incepere <= p_pana
    and least(
          case
            when e.tip_plata = 'Per sedinta' and p_sedinta_30_zile then e.data_incepere + 29
            when e.tip_plata = 'Per sedinta' then e.data_incepere
            else coalesce(e.data_final, 'infinity'::date)
          end,
          coalesce((e.data_reziliere::date - 1), 'infinity'::date)
        ) >= greatest(e.data_incepere, p_de)
  group by e.cursul;
$$;

revoke execute on function _locuri_ocupate(date, date, uuid[], boolean) from anon, public;
grant execute on function _locuri_ocupate(date, date, uuid[], boolean) to authenticated;

-- ============================================================
-- 2. Pe zi — semnătura rămâne (o cheamă view-ul lista_cursuri și UI-ul)
-- ============================================================
create or replace function locuri_ocupate(
  p_de      date,
  p_pana    date,
  p_cursuri uuid[]
)
returns table (curs_id uuid, ocupate integer)
language sql
stable
security invoker
set search_path = public
as $$
  select * from _locuri_ocupate(p_de, p_pana, p_cursuri, true);
$$;

-- ============================================================
-- 3. Pe lună — ședința se numără o singură dată
-- ============================================================
create or replace function locuri_ocupate_luna(p_luna date, p_cursuri uuid[])
returns table (curs_id uuid, ocupate integer)
language sql
stable
security invoker
set search_path = public
as $$
  select * from _locuri_ocupate(
    date_trunc('month', p_luna)::date,
    (date_trunc('month', p_luna) + interval '1 month' - interval '1 day')::date,
    p_cursuri,
    false
  );
$$;

revoke execute on function locuri_ocupate_luna(date, uuid[]) from anon, public;
grant execute on function locuri_ocupate_luna(date, uuid[]) to authenticated;

create or replace function cursanti_platitori_luna(p_curs uuid, p_luna date)
returns int
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce((select lo.ocupate from locuri_ocupate_luna(p_luna, array[p_curs]) lo), 0);
$$;
