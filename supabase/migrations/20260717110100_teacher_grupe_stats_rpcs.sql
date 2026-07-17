-- RPC-uri pentru hub-ul „Grupele mele — progres" (rol teacher).
-- Toate SECURITY DEFINER, dar strict scoped la cursurile instructorului curent
-- (cursuri_teacheri M:N sau cursuri.teacher = current_teacher_id()). Pentru un
-- caller ne-teacher, current_teacher_id() e null → nu returnează nimic (hub-ul
-- e teacher-only). Reutilizăm în client RPC-urile existente teacher-scoped
-- get_grad_ocupare / get_trend_prezente / get_reinscrieri_progress; astea acoperă
-- ce nu e aici.

-- ── 1) Cursanți la risc: absențe consecutive pe grupele instructorului ──────
-- Clonă a get_absente_consecutive (20260625150000), fără p_locatie, cu scope pe
-- instructorul curent. Doar cursuri recurente (facultativ = false).
create or replace function get_absente_risc_teacher(p_prag int default 2)
returns table (
  client_id           uuid,
  client_nume         text,
  curs_id             uuid,
  curs_nume           text,
  absente_consecutive int,
  ultima_prezenta     date
)
language sql
stable
security definer
set search_path = public
as $$
  with prez as (
    select p.client, e.cursul as curs_id, p.data, p.status,
           row_number() over (partition by p.client, e.cursul order by p.data desc) as rn
    from prezente p
    join enrollments e on e.id = p.enrollment
      and e.activ = true and e.reziliat = false
    join cursuri c on c.id = e.cursul
    where p.data is not null
      and coalesce(c.facultativ, false) = false
      and (
        c.teacher = current_teacher_id()
        or exists (select 1 from cursuri_teacheri ct
                   where ct.curs_id = c.id and ct.teacher_id = current_teacher_id())
      )
  ),
  first_present as (
    select client, curs_id, min(rn) as rn_present
    from prez
    where status <> 'Absent'
    group by client, curs_id
  ),
  streak as (
    select p.client, p.curs_id,
           count(*) filter (
             where p.status = 'Absent'
               and (fp.rn_present is null or p.rn < fp.rn_present)
           )::int as absente,
           max(p.data) filter (where p.status <> 'Absent') as ultima_prez
    from prez p
    left join first_present fp on fp.client = p.client and fp.curs_id = p.curs_id
    group by p.client, p.curs_id
  )
  select s.client,
         trim(format('%s %s', coalesce(cl.prenume, ''), cl.nume)) as client_nume,
         s.curs_id, cu.numele as curs_nume,
         s.absente, s.ultima_prez
  from streak s
  join clienti cl on cl.id = s.client
  join cursuri cu on cu.id = s.curs_id
  where s.absente >= greatest(coalesce(p_prag, 2), 1)
  order by s.absente desc, client_nume
  limit 200;
$$;

grant execute on function get_absente_risc_teacher(int) to authenticated;

-- ── 2) Statistici evaluări pe grupele instructorului ────────────────────────
-- Per curs: nr. evaluări + cursanți evaluați + media generală + media pe fiecare
-- abilitate (sezonul activ) și trendul mediei pe data evaluării (toate sezoanele,
-- pentru progres — cele ~3 checkpoint-uri dec/apr/iun ies natural).
create or replace function get_evaluari_stats_teacher()
returns table (
  curs_id        uuid,
  curs_nume      text,
  n_evaluari     int,
  n_cursanti     int,
  media_generala numeric,
  skills         jsonb,
  trend          jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with scop as (
    select c.id, c.numele, c.sezon
    from cursuri c
    where c.teacher = current_teacher_id()
       or exists (select 1 from cursuri_teacheri ct
                  where ct.curs_id = c.id and ct.teacher_id = current_teacher_id())
  ),
  ev as (
    select e.cursul, e.client, e.data_evaluarii, e.sezon_id,
           e.skill_ritm, e.skill_pasi_baza, e.skill_coregrafie, e.skill_izolari,
           e.skill_coordonare, e.skill_freeze, e.skill_sincronizare,
           e.skill_improvizatie, e.skill_expresivitate, e.skill_prezentare,
           (coalesce(e.skill_ritm,0) + coalesce(e.skill_pasi_baza,0)
            + coalesce(e.skill_coregrafie,0) + coalesce(e.skill_izolari,0)
            + coalesce(e.skill_coordonare,0) + coalesce(e.skill_freeze,0)
            + coalesce(e.skill_sincronizare,0) + coalesce(e.skill_improvizatie,0)
            + coalesce(e.skill_expresivitate,0) + coalesce(e.skill_prezentare,0))::numeric
           / nullif(
             (e.skill_ritm is not null)::int + (e.skill_pasi_baza is not null)::int
             + (e.skill_coregrafie is not null)::int + (e.skill_izolari is not null)::int
             + (e.skill_coordonare is not null)::int + (e.skill_freeze is not null)::int
             + (e.skill_sincronizare is not null)::int + (e.skill_improvizatie is not null)::int
             + (e.skill_expresivitate is not null)::int + (e.skill_prezentare is not null)::int, 0)
           as media_rand
    from evaluari e
    join scop s on s.id = e.cursul
  )
  select
    s.id, s.numele,
    (select count(*) from ev where ev.cursul = s.id and ev.sezon_id is not distinct from s.sezon)::int,
    (select count(distinct ev.client) from ev where ev.cursul = s.id and ev.sezon_id is not distinct from s.sezon)::int,
    (select round(avg(ev.media_rand), 2) from ev where ev.cursul = s.id and ev.sezon_id is not distinct from s.sezon),
    (select jsonb_build_object(
        'ritm', round(avg(ev.skill_ritm), 2),
        'pasi_baza', round(avg(ev.skill_pasi_baza), 2),
        'coregrafie', round(avg(ev.skill_coregrafie), 2),
        'izolari', round(avg(ev.skill_izolari), 2),
        'coordonare', round(avg(ev.skill_coordonare), 2),
        'freeze', round(avg(ev.skill_freeze), 2),
        'sincronizare', round(avg(ev.skill_sincronizare), 2),
        'improvizatie', round(avg(ev.skill_improvizatie), 2),
        'expresivitate', round(avg(ev.skill_expresivitate), 2),
        'prezentare', round(avg(ev.skill_prezentare), 2))
     from ev where ev.cursul = s.id and ev.sezon_id is not distinct from s.sezon),
    coalesce((
      select jsonb_agg(jsonb_build_object('data', t.data, 'media', t.m, 'n', t.n) order by t.data)
      from (
        select ev.data_evaluarii as data, round(avg(ev.media_rand), 2) as m, count(*)::int as n
        from ev where ev.cursul = s.id
        group by ev.data_evaluarii
      ) t
    ), '[]'::jsonb)
  from scop s;
$$;

grant execute on function get_evaluari_stats_teacher() to authenticated;

-- ── 3) Participare la concurs / spectacol pe grupele instructorului ─────────
-- Concurs: NEmodelat cu FK — participarea e în array-uri uuid pe concursuri
-- (participanti/trupa), fără ancoră de curs/sezon. Numărăm cursanții înrolați la
-- grupă care apar în orice concurs. Spectacol: modelat curat
-- (spectacol_acte.curs → spectacol_act_performeri.client).
create or replace function get_participare_teacher()
returns table (
  curs_id       uuid,
  curs_nume     text,
  concurs       int,
  spectacol     int
)
language sql
stable
security definer
set search_path = public
as $$
  with scop as (
    select c.id, c.numele
    from cursuri c
    where c.teacher = current_teacher_id()
       or exists (select 1 from cursuri_teacheri ct
                  where ct.curs_id = c.id and ct.teacher_id = current_teacher_id())
  ),
  enrolled as (
    select distinct e.cursul, e.client
    from enrollments e
    join scop s on s.id = e.cursul
  ),
  concurs_c as (
    select en.cursul, count(distinct en.client)::int as n
    from enrolled en
    where exists (
      select 1 from concursuri co
      where en.client = any(co.participanti) or en.client = any(co.trupa)
    )
    group by en.cursul
  ),
  spect_c as (
    select sa.curs as cursul, count(distinct sap.client)::int as n
    from spectacol_acte sa
    join spectacol_act_performeri sap on sap.act = sa.id
    join scop s on s.id = sa.curs
    group by sa.curs
  )
  select s.id, s.numele, coalesce(cc.n, 0), coalesce(sp.n, 0)
  from scop s
  left join concurs_c cc on cc.cursul = s.id
  left join spect_c sp on sp.cursul = s.id;
$$;

grant execute on function get_participare_teacher() to authenticated;
