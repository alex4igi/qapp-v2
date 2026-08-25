-- Qapp v2 — Suspendarea accesului pentru datornici + worklist v3 (status de colectare).
--
-- Decizie user (2026-08-24, din conceptul Claude Design „Datorii & rău-platnici"):
--   1. SUSPENDARE: un datornic poate fi suspendat (manager+) — nu mai poate fi
--      marcat Prezent la grupă și nu mai poate rezerva OPEN class, până la
--      reactivare. Plata NU e blocată nicăieri (așa se stinge datoria).
--   2. STATUS DE COLECTARE derivat în worklist: Suspendat / Promisiune /
--      Reminder trimis / De contactat — fără tabel nou; reminderul vine din
--      coada SMS existentă (situatie_sms_uri), promisiunea din client_contacte.
--   3. Worklist v3 expune și: id_locatie (pt. SMS pe rând), cursuri (coloana
--      „Ce datorează"), suspendat, ultim_sms_at.

-- ============================================================
-- 1. clienti — flag suspendare + audit (cine/când)
-- ============================================================
alter table clienti
  add column if not exists suspendat_datorii boolean not null default false,
  add column if not exists suspendat_datorii_la timestamptz,
  add column if not exists suspendat_datorii_de uuid;

-- ============================================================
-- 2. Garduri: prezența „Prezent" și rezervările OPEN sunt blocate
--    pentru clienți suspendați (trigger — prinde și fluxul de portal)
-- ============================================================
create or replace function blocheaza_prezenta_suspendat()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'Prezent' and exists (
    select 1 from clienti c where c.id = new.client and c.suspendat_datorii
  ) then
    raise exception 'Clientul are accesul suspendat pentru restanțe. Încasează restanța și reactivează-l din pagina Datorii.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prezenta_suspendat on prezente;
create trigger trg_prezenta_suspendat
  before insert or update on prezente
  for each row execute function blocheaza_prezenta_suspendat();

create or replace function blocheaza_rezervare_suspendat()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1 from clienti c where c.id = new.client and c.suspendat_datorii
  ) then
    raise exception 'Clientul are accesul suspendat pentru restanțe — nu poate rezerva până la achitare.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_rezervare_suspendat on open_rezervari;
create trigger trg_rezervare_suspendat
  before insert on open_rezervari
  for each row execute function blocheaza_rezervare_suspendat();

-- ============================================================
-- 3. set_suspendare_datorii — doar manager/admin/owner
-- ============================================================
create or replace function set_suspendare_datorii(p_client uuid, p_suspendat boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if auth_role() not in ('owner', 'admin', 'manager') then
    raise exception 'Doar managerii pot suspenda sau reactiva accesul unui client.';
  end if;
  update clienti
     set suspendat_datorii    = p_suspendat,
         suspendat_datorii_la = case when p_suspendat then now() end,
         suspendat_datorii_de = case when p_suspendat then auth.uid() end
   where id = p_client;
  if not found then
    raise exception 'Client inexistent.';
  end if;
end;
$$;

-- ============================================================
-- 4. get_restante_worklist v3 — + id_locatie, cursuri, suspendat, ultim_sms_at
--    (return type se schimbă → drop obligatoriu; coloanele noi sunt la final,
--    consumatorii existenți — DatorniciWorklistCard — merg nemodificați)
-- ============================================================
drop function if exists get_restante_worklist(uuid, uuid, date);

create function get_restante_worklist(
  p_locatie uuid default null,
  p_sezon   uuid default null,
  p_luna    date default null
)
returns table (
  client_id uuid,
  nume text,
  prenume text,
  telefon text,
  nume_locatie text,
  rest_total numeric,
  nr_rate_neachitate int,
  zile_depasire int,
  ultima_prezenta date,
  ultim_apel_at timestamptz,
  ultim_apel_rezultat text,
  promisiune_data date,
  promisiune_suma numeric,
  promisiune_logata_at timestamptz,
  id_locatie uuid,
  cursuri text,
  suspendat boolean,
  ultim_sms_at date
)
language sql
stable
security invoker
set search_path = public
as $$
  with baza as (
    select
      pi.id_cursant as client_id,
      pi.id_locatie,
      pi.nume_locatie,
      pi.nume_curs,
      pi.rest,
      pi.data_incepere,
      case
        when sz.scadenta_prima_rata is not null
             and date_trunc('month', pi.data_incepere) = date_trunc('month', sz.data_incepere)
          then sz.scadenta_prima_rata
        when sz.scadenta_ultima_rata is not null
             and date_trunc('month', pi.data_incepere) = date_trunc('month', sz.data_final)
          then sz.scadenta_ultima_rata
        else (date_trunc('month', pi.data_incepere)::date + 14)
      end as scadenta
    from plati_inrolari pi
    join enrollments e on e.id = pi.id_enrollment
    left join sezoane sz on sz.id = e.sezon_id
    where pi.id_cursant is not null
      and pi.rest > 0
      and pi.prescris = false          -- datoriile prescrise nu se mai recuperează
      and pi.viitor = false            -- lunile facturate în viitor nu sunt restanță
      and e.reziliat = false
      and (p_locatie is null or pi.id_locatie = p_locatie)
      and (p_sezon is null or e.sezon_id = p_sezon)   -- aliniere cu get_sms_recipients
  ),
  agg as (
    select client_id,
      max(nume_locatie) as nume_locatie,
      min(id_locatie::text)::uuid as id_locatie,
      string_agg(distinct nume_curs, ' · ') as cursuri,
      sum(rest) as rest_total,
      count(*)::int as nr_rate_neachitate,
      max((current_date - scadenta)::int) as zile_depasire,
      bool_or(p_luna is not null and date_trunc('month', data_incepere) = date_trunc('month', p_luna)) as are_luna_ceruta
    from baza
    group by client_id
    having max((current_date - scadenta)::int) >= 1   -- cel puțin o rată chiar depășită
  )
  select
    a.client_id,
    cl.nume,
    cl.prenume,
    coalesce(nullif(trim(cl.telefon), ''), cl.telefonul_2) as telefon,
    a.nume_locatie,
    round(a.rest_total) as rest_total,
    a.nr_rate_neachitate,
    a.zile_depasire,
    (select max(p.data) from prezente p where p.client = a.client_id and p.status = 'Prezent') as ultima_prezenta,
    lc.ultim_apel_at,
    lc.ultim_apel_rezultat,
    lp.promisiune_data,
    lp.promisiune_suma,
    lp.promisiune_logata_at,
    a.id_locatie,
    a.cursuri,
    coalesce(cl.suspendat_datorii, false) as suspendat,
    ls.ultim_sms_at
  from agg a
  join clienti cl on cl.id = a.client_id
  left join lateral (
    select cc.created as ultim_apel_at, cc.rezultat::text as ultim_apel_rezultat
    from client_contacte cc
    where cc.client_id = a.client_id and cc.scop = 'recuperare'
    order by cc.created desc
    limit 1
  ) lc on true
  left join lateral (
    select cc.promisiune_data, cc.suma_promisa as promisiune_suma, cc.created as promisiune_logata_at
    from client_contacte cc
    where cc.client_id = a.client_id and cc.scop = 'recuperare' and cc.promisiune_data is not null
    order by cc.created desc
    limit 1
  ) lp on true
  left join lateral (
    select max(coalesce(s.data_trimitere, s.data_planificata)) as ultim_sms_at
    from situatie_sms_uri s
    where s.cod_mesaj in ('notificare_restante', 'avertisment_loc')
      and s.clienti_vizati @> array[a.client_id]
  ) ls on true
  where cl.status = 'Activ'
    and (p_luna is null or a.are_luna_ceruta)
  order by a.zile_depasire desc nulls last, a.rest_total desc;
$$;

-- ============================================================
-- 5. Securitate (regula obligatorie)
-- ============================================================
revoke execute on function get_restante_worklist(uuid, uuid, date) from anon, public;
grant execute on function get_restante_worklist(uuid, uuid, date) to authenticated;

revoke execute on function set_suspendare_datorii(uuid, boolean) from anon, public;
grant execute on function set_suspendare_datorii(uuid, boolean) to authenticated;
