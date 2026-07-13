-- Pachet portal membri + CRM (decizii user 2026-07-13):
--
-- 1) list_open_sesiuni_client — „locuri rămase" scădea DOAR rezervările online;
--    abonații cursului (Per luna/Per an) vin fără rezervare, deci portalul arăta
--    „33/35 locuri" la un curs cu 6 abonați. Acum: ocupant = client cu rezervare
--    vie pe sesiune UNION abonat activ al cursului la data sesiunii (UNION distinct
--    deduplică abonatul care își face și rezervare).
-- 2) hold_loc_open — gardul de capacitate la plată aplică ACEEAȘI formulă; altfel
--    lista și gardul diverg (s-ar putea rezerva un loc pe care lista îl arată ocupat).
-- 3) lista_cursuri.inscrisi (CRM) — bug moștenit din v1: count(TOATE enrollments),
--    inclusiv reziliate și sezoane istorice (ex. 868 pe un curs cu 0 activi). Acum:
--    helperul canonic inrolari_active_la(current_date); pe cursurile facultative
--    doar abonații (per-ședință nu ocupă loc permanent).
-- 4) get_prezente_sezoane_client + get_prezente_client(p_sezon) — istoricul complet
--    de prezențe risca plafonul PostgREST de 1000 rânduri (trunchiere silențioasă +
--    statistici greșite). Acum: agregat per sezon + detaliu încărcat per sezon.
-- 5) Prescrierea la 2 ani (plati_inrolari.prescris, 20260622110000) se aplica doar
--    pe suprafețele CRM; portalul lăsa membrii să vadă și să PLĂTEASCĂ datorii
--    prescrise. Acum: get_sold_familie / get_plati_client / build_fifo_plan_membru
--    exclud restul prescris (istoricul plătit rămâne vizibil).

-- 6) rezervari_online — membrii se pot programa DOAR la cursurile facultative
--    care permit explicit rezervări online (bifă în profilul cursului, CRM).
--    Opt-in, default FALSE: după deploy, staff-ul bifează cursurile dorite.
--    Recepția (rezerva_loc_open) NU e restricționată de flag.

-- ============================================================
-- 0) Bifa „permite rezervări online" pe curs
-- ============================================================
alter table cursuri add column if not exists rezervari_online boolean not null default false;

-- ============================================================
-- 1) list_open_sesiuni_client — ocupanți = rezervări ∪ abonați activi
-- ============================================================
drop function if exists list_open_sesiuni_client(uuid);

create function list_open_sesiuni_client(p_locatie uuid default null)
returns table (
  sesiune_id uuid,
  curs_id uuid,
  curs_nume text,
  data date,
  locuri_ramase integer,
  capacitate integer,
  pret numeric,
  instructor_nume text
)
language sql stable security definer set search_path = public as $$
  select s.id, c.id, c.numele, s.data::date,
         (s.capacitate - occ.n)::integer,
         s.capacitate,
         c.pret_sedinta,
         t.nume
  from open_sesiuni s
  join cursuri c on c.id = s.curs
    and coalesce(c.facultativ, false)
    and coalesce(c.rezervari_online, false)
  left join teacheri t on t.id = s.instructor
  cross join lateral (
    select count(*) as n from (
      select r.client from open_rezervari r
      where r.sesiune = s.id and r.status <> 'anulat'
      union
      select e.client from enrollments e
      where e.cursul = c.id
        and e.client is not null
        and e.reziliat = false
        and e.tip_plata in ('Per luna', 'Per an')
        and e.data_incepere <= s.data::date
        and (e.data_final is null or e.data_final >= s.data::date)
    ) occupants
  ) occ
  where s.data >= current_date
    and s.status <> 'anulata'
    and (p_locatie is null or c.locatie = p_locatie)
    and (s.capacitate - occ.n) > 0
  order by s.data asc;
$$;

grant execute on function list_open_sesiuni_client(uuid) to authenticated;

-- ============================================================
-- 2) hold_loc_open — același calcul de ocupare la crearea hold-ului
-- ============================================================
create or replace function hold_loc_open(p_client uuid, p_sesiune uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_cap     integer;
  v_status  text;
  v_curs    uuid;
  v_data    date;
  v_count   integer;
  v_pret    numeric;
  v_rez     uuid;
begin
  -- authz: doar conturi parinte, doar pentru membrii propriei familii
  if not is_parinte() then
    raise exception 'forbidden';
  end if;
  if p_client not in (select client_member_ids()) then
    raise exception 'forbidden: clientul nu aparține familiei contului';
  end if;

  -- blochează rândul sesiunii → serializează rezervările concurente
  select s.capacitate, s.status, s.curs, s.data::date into v_cap, v_status, v_curs, v_data
  from open_sesiuni s where s.id = p_sesiune for update;
  if not found then
    raise exception 'Sesiunea nu există.';
  end if;
  if v_status = 'anulata' then
    raise exception 'Sesiunea este anulată.';
  end if;

  -- preț din curs + validare facultativ + bifa de rezervări online
  select c.pret_sedinta into v_pret
  from cursuri c
  where c.id = v_curs
    and coalesce(c.facultativ, false)
    and coalesce(c.rezervari_online, false);
  if not found then
    raise exception 'Cursul nu permite rezervări online.';
  end if;
  if v_pret is null or v_pret <= 0 then
    raise exception 'Sesiunea nu are un preț valid.';
  end if;

  -- capacitate strictă: rezervări vii ∪ abonați activi (formula din list_open_sesiuni_client)
  select count(*) into v_count from (
    select r.client from open_rezervari r
    where r.sesiune = p_sesiune and r.status <> 'anulat'
    union
    select e.client from enrollments e
    where e.cursul = v_curs
      and e.client is not null
      and e.reziliat = false
      and e.tip_plata in ('Per luna', 'Per an')
      and e.data_incepere <= v_data
      and (e.data_final is null or e.data_final >= v_data)
  ) occupants;
  if v_count >= v_cap then
    raise exception 'Sesiune completă (% / %). Nu mai sunt locuri.', v_count, v_cap;
  end if;

  -- creează HOLD fără bani. uq_open_rez_client_active prinde dublarea (23505).
  insert into open_rezervari (sesiune, client, status, suma)
  values (p_sesiune, p_client, 'rezervat', v_pret)
  returning id into v_rez;

  return jsonb_build_object('rezervare_id', v_rez, 'amount', v_pret);
end;
$$;

revoke all on function hold_loc_open(uuid, uuid) from public;
grant execute on function hold_loc_open(uuid, uuid) to authenticated;

-- ============================================================
-- 3) lista_cursuri — inscrisi = activi azi (canonic), facultativ = doar abonați
-- ============================================================
drop view if exists lista_cursuri;

create view lista_cursuri as
select
  c.id,
  c.numele as numele_cursului,
  c.sezon,
  c.zile,
  c.nivelul,
  coalesce(act.inscrisi, 0) as inscrisi,
  c.capacitate_maxima,
  i.id as id_teacher,
  i.nume,
  i.prenume,
  i.telefon,
  i.nivelul as nivel_teacher,
  s.nume as sala,
  coalesce(l_direct.nume, l_sala.nume) as locatie,
  coalesce(c.locatie, s.locatie) as id_locatie,
  0 as balance
from cursuri c
left join teacheri i on c.teacher = i.id
left join sali s on s.id = c.sala
left join locatii l_sala on l_sala.id = s.locatie
left join locatii l_direct on l_direct.id = c.locatie
left join lateral (
  select count(distinct a.client) as inscrisi
  from inrolari_active_la(current_date) a
  join enrollments e on e.id = a.enrollment_id
  where a.cursul = c.id
    and (not coalesce(c.facultativ, false) or e.tip_plata in ('Per luna', 'Per an'))
) act on true;

alter view lista_cursuri set (security_invoker = true);

-- ============================================================
-- 4) Prezențe pe sezoane (portal)
-- ============================================================
-- Agregat per sezon: antetele acordeonului + statisticile de titlu (server-side,
-- corecte indiferent de volum). sezon_id null = prezențe pe cursuri fără sezon.
create or replace function get_prezente_sezoane_client(p_client uuid)
returns table (sezon_id uuid, sezon_nume text, total integer, prezente integer, absente integer)
language sql stable security definer set search_path = public as $$
  select c.sezon,
         max(sz.numele_sezonului),
         count(*)::integer,
         (count(*) filter (where p.status = 'Prezent'))::integer,
         (count(*) filter (where p.status = 'Absent'))::integer
  from prezente p
  left join enrollments e on e.id = p.enrollment
  left join cursuri c on c.id = e.cursul
  left join sezoane sz on sz.id = c.sezon
  where p.client = p_client
    and p_client in (select client_member_ids())
  group by c.sezon
  order by max(sz.data_incepere) desc nulls last;
$$;

grant execute on function get_prezente_sezoane_client(uuid) to authenticated;

-- Detaliu filtrat pe sezon (p_sezon null = rândurile fără sezon). Semnătura se
-- schimbă → drop întâi (CREATE OR REPLACE nu poate adăuga parametri cu default
-- fără să lase overload-ul vechi ambiguu pentru PostgREST).
drop function if exists get_prezente_client(uuid);

create function get_prezente_client(p_client uuid, p_sezon uuid default null)
returns table (data date, curs_nume text, status status_prezenta)
language sql stable security definer set search_path = public as $$
  select p.data::date, c.numele, p.status
  from prezente p
  left join enrollments e on e.id = p.enrollment
  left join cursuri c on c.id = e.cursul
  where p.client = p_client
    and p_client in (select client_member_ids())
    and c.sezon is not distinct from p_sezon
  order by p.data desc nulls last;
$$;

grant execute on function get_prezente_client(uuid, uuid) to authenticated;

-- ============================================================
-- 5) Prescrierea (2 ani) în portal
-- ============================================================
-- Soldul familiei nu mai conține restul prescris.
create or replace function get_sold_familie()
returns table (client_id uuid, nume text, prenume text, restanta numeric)
language sql stable security definer set search_path = public as $$
  select pi.id_cursant,
         max(pi.nume_client),
         max(pi.prenume_client),
         coalesce(sum(pi.rest) filter (where not coalesce(pi.prescris, false)), 0)
  from plati_inrolari pi
  where pi.id_cursant in (select client_member_ids())
  group by pi.id_cursant;
$$;

-- Lista înrolărilor: datoria prescrisă dispare; istoricul plătit (oricât de vechi)
-- rămâne — de aceea NU filtrăm simplu pe `prescris` (care e doar vârstă).
create or replace function get_plati_client(p_client uuid)
returns table (
  enrollment_id uuid,
  curs_nume text,
  data_incepere date,
  tip_plata tip_plata,
  total_de_plata numeric,
  platit numeric,
  rest numeric,
  cod_voucher text,
  sezon_id uuid,
  sezon_nume text
)
language sql stable security definer set search_path = public as $$
  select pi.id_enrollment, pi.nume_curs, pi.data_incepere, pi.tip_plata,
         pi.total_de_plata, pi.platit, pi.rest, pi.cod_voucher,
         c.sezon, sz.numele_sezonului
  from plati_inrolari pi
  left join cursuri c on c.id = pi.id_curs
  left join sezoane sz on sz.id = c.sezon
  where pi.id_cursant = p_client
    and p_client in (select client_member_ids())
    and not (coalesce(pi.prescris, false) and pi.rest > 0)
  order by pi.data_incepere asc nulls last, pi.id_enrollment;
$$;

-- Planul FIFO (sursa sumei Netopia) exclude prescrisele — gardul server-side real.
create or replace function build_fifo_plan_membru(
  p_client uuid,
  p_pana_la uuid default null,
  p_datorii uuid[] default '{}',
  p_include_inrolari boolean default true
)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_enr jsonb := '[]'::jsonb;
  v_dat jsonb := '[]'::jsonb;
  v_enr_amt numeric := 0;
  v_dat_amt numeric := 0;
  v_cutoff_date date;
begin
  if p_client not in (select client_member_ids()) then
    raise exception 'forbidden: clientul nu aparține familiei contului';
  end if;

  if p_include_inrolari then
    if p_pana_la is not null then
      select t.data_incepere into v_cutoff_date
      from plati_inrolari t
      where t.id_enrollment = p_pana_la and t.id_cursant = p_client and t.rest > 0
        and not coalesce(t.prescris, false);
      if not found then
        raise exception 'Înrolarea selectată nu există sau e deja achitată.';
      end if;
    end if;

    select coalesce(jsonb_agg(jsonb_build_object('enrollment_id', t.id_enrollment, 'pay', t.rest)
                              order by t.data_incepere asc nulls last, t.id_enrollment), '[]'::jsonb),
           coalesce(sum(t.rest), 0)
      into v_enr, v_enr_amt
    from plati_inrolari t
    where t.id_cursant = p_client
      and t.rest > 0
      and not coalesce(t.prescris, false)
      and (p_pana_la is null or t.data_incepere <= v_cutoff_date);
  end if;

  if p_datorii is not null and array_length(p_datorii, 1) is not null then
    select coalesce(jsonb_agg(jsonb_build_object('datorie_id', dr.id, 'pay', dr.rest)
                              order by dr.created asc), '[]'::jsonb),
           coalesce(sum(dr.rest), 0)
      into v_dat, v_dat_amt
    from datorii_rest dr
    where dr.client = p_client and dr.rest > 0 and dr.id = any(p_datorii);
  end if;

  return jsonb_build_object('amount', v_enr_amt + v_dat_amt, 'plan', v_enr || v_dat);
end;
$$;

grant execute on function build_fifo_plan_membru(uuid, uuid, uuid[], boolean) to authenticated;
