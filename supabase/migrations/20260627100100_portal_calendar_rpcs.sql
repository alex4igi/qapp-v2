-- Portal membri (qapp-membri) — CALENDAR ANUAL: RPC-uri de CITIRE pentru sezonul
-- curent + vacanțele lui. Evenimentele au deja get_evenimente_client() (20260619120000).
--
-- De ce RPC și nu citire directă: conturile portal au rol `parinte`, iar gardul
-- restrictiv `deny_parinte_direct` blochează SELECT direct pe `sezoane`/`vacante`.
-- Deci expunem aceste date studio-wide (informative) prin funcții SECURITY DEFINER,
-- exact ca get_evenimente_client(). Doar citire; setarea rămâne în qapp v2 (admin).

-- ============================================================
-- 1) Sezonul curent (activ) — intervalul anului școlar pentru calendar.
-- ============================================================
create or replace function get_sezon_curent_client()
returns table (
  sezon_id uuid,
  nume text,
  data_incepere date,
  data_final date
)
language sql stable security definer set search_path = public as $$
  select s.id, s.numele_sezonului, s.data_incepere::date, s.data_final::date
  from sezoane s
  where s.stare = 'activ'
  limit 1;
$$;

-- ============================================================
-- 2) Vacanțele sezonului curent (intervale de pauză din anul școlar).
--    Zonele dintre vacanțe = modulele de studiu.
-- ============================================================
create or replace function get_vacante_client()
returns table (
  vacanta_id uuid,
  nume text,
  data_incepere date,
  data_final date
)
language sql stable security definer set search_path = public as $$
  select va.id, va.nume, va.data_incepere, va.data_final
  from vacante va
  join sezoane s on s.id = va.sezon_id
  where s.stare = 'activ'
  order by va.data_incepere;
$$;

grant execute on function get_sezon_curent_client() to authenticated;
grant execute on function get_vacante_client() to authenticated;
