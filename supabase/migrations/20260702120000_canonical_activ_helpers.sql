-- Qapp v2 — definiția CANONICĂ „elev activ" (decisă de user 2026-07-02).
--
-- Context: dashboardul /analytics arăta 167 „clienți activi" în timp ce 500 de
-- elevi aveau prezențe în ultimele 21 de zile. Cauza: la arhivarea sezonului
-- 2025-2026 (28 iun), close_season_open_enrollments() a închis data_final pe
-- înrolări, iar definiția veche (înrolare activ=true care acoperă LUNA curentă)
-- a rămas doar cu cei re-înrolați pe „Vara 2026". În plus, flagul enrollments.activ
-- nu e întreținut consecvent (doar cronul auto_exclient îl atinge, pe unele căi).
--
-- Definiția canonică, unică, refolosită de toate RPC-urile de headcount:
--   activ la ziua D ⟺ (a) înrolare NE-reziliată care acoperă ziua D
--                  SAU (b) ≥1 prezență 'Prezent' pe înrolare în fereastra (D-21, D]
-- FĂRĂ condiție pe enrollments.activ (nesigur), FĂRĂ condiție de plată (neplata
-- e problema metricii de restanțe, nu ascunde elevul din activ).
--
-- NB fereastra 21z: (D-21, D] = 21 de zile stricte; vechiul RPC folosea
-- >= current_date - 21 (22 zile incluzive). Standardizăm la 21 stricte.
--
-- Funcțiile sunt LANGUAGE SQL STABLE → planner-ul le inlinează în interogările
-- apelante (rămân set-based, nu per-rând).

-- Granularitate de înrolare — servește și metrici per-curs/per-locație.
create or replace function inrolari_active_la(p_data date default current_date)
returns table (enrollment_id uuid, client uuid, cursul uuid)
language sql
stable
security invoker
set search_path = public
as $$
  select e.id, e.client, e.cursul
  from enrollments e
  where e.client is not null
    and (
      (e.reziliat = false
        and e.data_incepere <= p_data
        and (e.data_final is null or e.data_final >= p_data))
      or exists (
        select 1 from prezente p
        where p.enrollment = e.id
          and p.status = 'Prezent'
          and p.data > p_data - 21
          and p.data <= p_data
      )
    );
$$;

grant execute on function inrolari_active_la(date) to authenticated;

-- Wrapper client-level: cifra de titlu „elevi activi".
create or replace function clienti_activi_la(p_data date default current_date)
returns table (client uuid)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct client from inrolari_active_la(p_data);
$$;

grant execute on function clienti_activi_la(date) to authenticated;

-- Varianta LUNARĂ pentru serii (creștere netă, numitor ARPU):
--   activ în luna M ⟺ înrolare ne-reziliată cu acoperire care se suprapune cu M
--                  SAU ≥1 'Prezent' în M.
-- p_luna = orice zi din luna țintă (se trunchiază la lună).
create or replace function inrolari_active_luna(p_luna date)
returns table (enrollment_id uuid, client uuid, cursul uuid)
language sql
stable
security invoker
set search_path = public
as $$
  with m as (
    select date_trunc('month', p_luna)::date as m_start,
           (date_trunc('month', p_luna) + interval '1 month' - interval '1 day')::date as m_end
  )
  select e.id, e.client, e.cursul
  from enrollments e, m
  where e.client is not null
    and (
      (e.reziliat = false
        and e.data_incepere <= m.m_end
        and (e.data_final is null or e.data_final >= m.m_start))
      or exists (
        select 1 from prezente p
        where p.enrollment = e.id
          and p.status = 'Prezent'
          and p.data >= m.m_start
          and p.data <= m.m_end
      )
    );
$$;

grant execute on function inrolari_active_luna(date) to authenticated;

-- Ramura (b) și metricile săptămânale scanează prezențe pe ferestre de dată.
create index if not exists idx_prezente_prezent_data
  on prezente(data, enrollment, client)
  where status = 'Prezent';
