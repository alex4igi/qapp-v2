-- Portal membri (qapp-membri) — grupul 🟢 „câștig rapid": RPC-uri de CITIRE
-- client-facing pentru ecranele „Grupa mea", „Activitatea mea" și „Documente".
-- Toate sunt SECURITY DEFINER și scopate la familia contului prin client_member_ids()
-- (pattern stabilit în 20260615120000_portal_membri_foundation.sql).

-- ============================================================
-- 1) GRUPA MEA — înrolări active ale unui membru cu curs + program +
--    instructor + abonament. Instructor: M:N (cursuri_teacheri) UNION titular
--    legacy (cursuri.teacher) ca fallback — cursurile clonate pe sezon n-au
--    încă rânduri M:N (backfill programat). Vezi [[project-cursuri-teacheri-m2n-backfill-gap]].
-- ============================================================
create or replace function get_grupe_client(p_client uuid)
returns table (
  enrollment_id uuid,
  curs_id uuid,
  curs_nume text,
  nivel nivel_curs,
  varsta varsta_curs,
  stil text,
  locatie_nume text,
  sala text,
  zile zi_saptamana[],
  ora text,
  tip_plata tip_plata,
  data_incepere date,
  data_final date,
  instructori text[]
)
language sql stable security definer set search_path = public as $$
  select
    e.id, c.id, c.numele, c.nivelul, c.varsta, c.stil, l.nume, c.sala,
    c.zile, c.ora, e.tip_plata, e.data_incepere::date, e.data_final::date,
    coalesce(
      (select array_agg(distinct t.nume order by t.nume)
       from (
         select teacher_id as tid from cursuri_teacheri where curs_id = c.id
         union
         select c.teacher where c.teacher is not null
       ) src
       join teacheri t on t.id = src.tid),
      '{}'::text[]
    )
  from enrollments e
  join cursuri c on c.id = e.cursul
  left join locatii l on l.id = c.locatie
  where e.client = p_client
    and p_client in (select client_member_ids())
    and e.activ = true
    and e.reziliat = false
    and (e.data_final is null or e.data_final::date >= current_date)
  order by c.numele;
$$;

-- ============================================================
-- 2) ACTIVITATEA MEA
-- ============================================================

-- Evenimente viitoare (informativ, studio-wide). Workshop/Auditie/Eveniment.
create or replace function get_evenimente_client()
returns table (
  eveniment_id uuid,
  nume text,
  tip tip_eveniment,
  data date,
  locatie text,
  descriere text,
  pret_bilet numeric
)
language sql stable security definer set search_path = public as $$
  select e.id, e.nume_eveniment, e.tip, e.data::date, e.locatia, e.descriere, e.pret_bilet
  from evenimente e
  where coalesce(e.data::date, current_date) >= current_date
    and (e.status is null or e.status <> 'Anulat')
  order by e.data asc nulls last;
$$;

-- Istoric participări la evenimente pentru un membru (e.participant = uuid[]).
create or replace function get_participari_client(p_client uuid)
returns table (
  eveniment_id uuid,
  nume text,
  tip tip_eveniment,
  data date,
  locatie text
)
language sql stable security definer set search_path = public as $$
  select e.id, e.nume_eveniment, e.tip, e.data::date, e.locatia
  from evenimente e
  where p_client = any(e.participant)
    and p_client in (select client_member_ids())
  order by e.data desc nulls last;
$$;

-- Rezultate la concursuri — studio-wide (tabelul `concursuri` ține plasamente
-- agregate locul I/II/III, NU legătură per-cursant; participanti[]/trupa[] nu sunt
-- populate de UI). Afișare informativă a realizărilor școlii.
create or replace function get_rezultate_concursuri()
returns table (
  id uuid,
  nume text,
  data date,
  locul_i integer,
  locul_ii integer,
  locul_iii integer,
  rezultate text
)
language sql stable security definer set search_path = public as $$
  select k.id, k.numele_concursului, k.data_evenimentului::date,
         k.locul_i, k.locul_ii, k.locul_iii, k.rezultate_obtinute
  from concursuri k
  order by k.data_evenimentului desc nulls last
  limit 20;
$$;

-- ============================================================
-- 3) DOCUMENTE — linkuri Drive tipizate, scopate la membru.
-- ============================================================
create or replace function get_documente_client(p_client uuid)
returns table (
  id uuid,
  tip tip_document,
  titlu text,
  link text,
  data_expirarii date,
  observatii text
)
language sql stable security definer set search_path = public as $$
  select d.id, d.tip, d.titlu, d.link, d.data_expirarii::date, d.observatii
  from documente_client d
  where d.client = p_client
    and p_client in (select client_member_ids())
  order by d.created desc;
$$;

grant execute on function get_grupe_client(uuid) to authenticated;
grant execute on function get_evenimente_client() to authenticated;
grant execute on function get_participari_client(uuid) to authenticated;
grant execute on function get_rezultate_concursuri() to authenticated;
grant execute on function get_documente_client(uuid) to authenticated;

-- ============================================================
-- 4) HARDENING RLS — re-aplică gardul `deny_parinte_direct` pe TOATE tabelele cu
--    RLS. Loop-ul original a rulat în 20260615120000; tabele adăugate ulterior
--    (ex. documente_client 20260618, scorecard_obiective) au rămas neacoperite,
--    deci un cont `parinte` putea citi direct (select_all USING(true)) date ale
--    altor familii. Idempotent. Conturile portal accesează tot doar prin RPC.
-- ============================================================
do $$
declare r record;
begin
  for r in
    select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  loop
    execute format('drop policy if exists deny_parinte_direct on public.%I', r.relname);
    execute format(
      'create policy deny_parinte_direct on public.%I as restrictive for all to authenticated '
      || 'using (auth_role() <> %L) with check (auth_role() <> %L)',
      r.relname, 'parinte', 'parinte'
    );
  end loop;
end $$;
