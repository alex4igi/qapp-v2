-- Portal membri (qapp-membri) — FUNDAȚIE backend.
--
-- Clienții/familiile devin pentru prima dată utilizatori autentificați pe ACELAȘI
-- Supabase ca toolul intern. Politica existentă `<tabel>_select_all USING (true)`
-- (20260514100200_rls.sql) ar permite oricărui autentificat să citească TOT — inclusiv
-- un cont de client. Gardul de mai jos închide complet accesul direct la tabele pentru
-- conturile de tip `parinte`; portalul accesează datele EXCLUSIV prin RPC-urile
-- SECURITY DEFINER definite aici (care rulează ca owner și scopează manual la familie).
--
-- Rol marker: app_metadata.role = 'parinte' pe conturile de portal (setat la provisioning
-- printr-o edge function admin — pas separat). auth_role() îl întoarce din JWT.

-- ============================================================
-- 1) LEGARE clienți/familii ↔ auth.users  (pattern teacheri.auth_user_id)
-- ============================================================
alter table clienti add column if not exists auth_user_id uuid
  references auth.users(id) on delete set null;
alter table familii add column if not exists auth_user_id uuid
  references auth.users(id) on delete set null;

create unique index if not exists clienti_auth_user_id_key
  on clienti(auth_user_id) where auth_user_id is not null;
create unique index if not exists familii_auth_user_id_key
  on familii(auth_user_id) where auth_user_id is not null;

-- ============================================================
-- 2) HELPERE de identitate client
-- ============================================================
create or replace function is_parinte()
returns boolean language sql stable as $$
  select auth_role() = 'parinte';
$$;

create or replace function current_familie()
returns uuid language sql stable security definer set search_path = public as $$
  select id from familii where auth_user_id = auth.uid() limit 1;
$$;

create or replace function current_client()
returns uuid language sql stable security definer set search_path = public as $$
  select id from clienti where auth_user_id = auth.uid() limit 1;
$$;

-- Setul de clienți (id) pe care contul autentificat are voie să-i vadă:
--   - cont de familie  → toți membrii familiei (clienti.familia = familia contului)
--   - cont individual  → propriul client
create or replace function client_member_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select c.id from clienti c
  where c.familia is not null
    and c.familia = (select f.id from familii f where f.auth_user_id = auth.uid())
  union
  select c.id from clienti c where c.auth_user_id = auth.uid();
$$;

grant execute on function is_parinte() to authenticated;
grant execute on function current_familie() to authenticated;
grant execute on function current_client() to authenticated;
grant execute on function client_member_ids() to authenticated;

-- ============================================================
-- 3) GARD DE SECURITATE — interzice accesul DIRECT la tabele pentru `parinte`
-- Politică RESTRICTIVE (AND cu toate cele permissive) pe fiecare tabel cu RLS activ.
-- Staff (role <> 'parinte') neafectat. Conturile portal nu pot citi/scrie NIMIC direct.
-- ============================================================
do $$
declare r record;
begin
  for r in
    select c.relname
    from pg_class c
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

-- ============================================================
-- 4) RPC-uri de CITIRE client-facing (SECURITY DEFINER, scopate la familie)
-- ============================================================

-- Sold per membru al familiei (restanță agregată). Sursă: view-ul plati_inrolari.
create or replace function get_sold_familie()
returns table (client_id uuid, nume text, prenume text, restanta numeric)
language sql stable security definer set search_path = public as $$
  select pi.id_cursant,
         max(pi.nume_client),
         max(pi.prenume_client),
         coalesce(sum(pi.rest), 0)
  from plati_inrolari pi
  where pi.id_cursant in (select client_member_ids())
  group by pi.id_cursant;
$$;

-- Detaliul plăților unui membru (cronologic, pt blocajul FIFO din UI):
-- fiecare înrolare cu total/plătit/rest. Doar membrii familiei contului.
create or replace function get_plati_client(p_client uuid)
returns table (
  enrollment_id uuid,
  curs_nume text,
  data_incepere date,
  tip_plata tip_plata,
  total_de_plata numeric,
  platit numeric,
  rest numeric,
  cod_voucher text
)
language sql stable security definer set search_path = public as $$
  select pi.id_enrollment, pi.nume_curs, pi.data_incepere, pi.tip_plata,
         pi.total_de_plata, pi.platit, pi.rest, pi.cod_voucher
  from plati_inrolari pi
  where pi.id_cursant = p_client
    and p_client in (select client_member_ids())
  order by pi.data_incepere asc nulls last, pi.id_enrollment;
$$;

-- Istoric prezențe pentru un membru. Doar membrii familiei contului.
create or replace function get_prezente_client(p_client uuid)
returns table (data date, curs_nume text, status status_prezenta)
language sql stable security definer set search_path = public as $$
  select p.data::date, c.numele, p.status
  from prezente p
  left join enrollments e on e.id = p.enrollment
  left join cursuri c on c.id = e.cursul
  where p.client = p_client
    and p_client in (select client_member_ids())
  order by p.data desc nulls last;
$$;

-- Sesiuni OPEN viitoare (cursuri facultative) cu locuri rămase + preț/ședință.
-- NOTĂ MVP: listează doar sesiunile DEJA create (open_sesiuni). Generarea sesiunilor
-- viitoare din cursuri.zile/ora (pt date încă fără rezervări) = îmbunătățire ulterioară.
create or replace function list_open_sesiuni_client(p_locatie uuid default null)
returns table (
  sesiune_id uuid,
  curs_id uuid,
  curs_nume text,
  data date,
  locuri_ramase integer,
  pret numeric,
  instructor_nume text
)
language sql stable security definer set search_path = public as $$
  select s.id, c.id, c.numele, s.data::date,
         (s.capacitate - count(r.id))::integer,
         c.pret_sedinta,
         t.nume
  from open_sesiuni s
  join cursuri c on c.id = s.curs and coalesce(c.facultativ, false)
  left join open_rezervari r on r.sesiune = s.id and r.status <> 'anulat'
  left join teacheri t on t.id = s.instructor
  where s.data >= current_date
    and s.status <> 'anulata'
    and (p_locatie is null or c.locatie = p_locatie)
  group by s.id, c.id, c.numele, s.data, s.capacitate, c.pret_sedinta, t.nume
  having (s.capacitate - count(r.id)) > 0
  order by s.data asc;
$$;

grant execute on function get_sold_familie() to authenticated;
grant execute on function get_plati_client(uuid) to authenticated;
grant execute on function get_prezente_client(uuid) to authenticated;
grant execute on function list_open_sesiuni_client(uuid) to authenticated;
