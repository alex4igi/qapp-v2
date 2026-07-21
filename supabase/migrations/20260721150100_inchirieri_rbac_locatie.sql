-- Închirieri săli — reguli pe roluri + locație aplicate ÎN DB.
-- Până acum toată garda era în UI: politica `inchirieri_all` dădea CRUD total
-- oricărui cont staff autentificat (inclusiv teacher), iar `incasari` avea
-- insert/update deschise tuturor. Reguli decise cu userul (2026-07-21):
--   * teacher: rezervă DOAR pentru el (tier 'staff', gratis sau plătit), doar la
--     locația lui (dacă are una asignată); mută/anulează DOAR rezervările lui,
--     doar înainte de start și doar fără încasări pe ele; NU umblă la bani
--     (pret/status/datorie) și NU scrie în incasari/datorii.
--   * front_desk: gestionează orice închiriere, dar creează doar la locația lui
--     (dacă are una asignată); nu poate seta/modifica prețuri manuale.
--   * manager/admin/owner: totul, oriunde; doar ei creează/modifică tier 'manual'.
-- NB: comparațiile pe tier folosesc ::text ca să nu refere direct valoarea nouă
-- de enum ('manual') adăugată în migrația anterioară.

-- ============================================================
-- 1) Helper: locația asignată din JWT (null = multi-locație / manager+)
-- ============================================================
create or replace function auth_locatie_id()
returns uuid
language sql
stable
as $$
  select nullif(
    current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'locatie_id',
    ''
  )::uuid;
$$;
revoke all on function auth_locatie_id() from anon, public;
grant execute on function auth_locatie_id() to authenticated;

-- ============================================================
-- 2) inchirieri.locatie = întotdeauna locația sălii (nu mai avem încredere în
--    client) + backfill pe istoricul existent.
-- ============================================================
create or replace function inchirieri_sync_locatie()
returns trigger
language plpgsql
as $$
begin
  select locatie into new.locatie from sali where id = new.sala;
  return new;
end;
$$;

drop trigger if exists trg_inchirieri_sync_locatie on inchirieri;
create trigger trg_inchirieri_sync_locatie
  before insert or update on inchirieri
  for each row execute function inchirieri_sync_locatie();

update inchirieri i
   set locatie = s.locatie
  from sali s
 where s.id = i.sala
   and i.locatie is distinct from s.locatie;

-- ============================================================
-- 3) Politici RLS pe inchirieri (înlocuiesc inchirieri_all).
--    deny_parinte_direct (restrictivă) rămâne neatinsă.
-- ============================================================
drop policy if exists inchirieri_all on inchirieri;

create policy inchirieri_select on inchirieri
  for select to authenticated using (true);

create policy inchirieri_staff_insert on inchirieri
  for insert to authenticated
  with check (
    auth_role() in ('owner','admin','manager','front_desk')
    and (auth_role() <> 'front_desk' or auth_locatie_id() is null or locatie = auth_locatie_id())
    and (tier::text <> 'manual' or auth_role() in ('owner','admin','manager'))
  );

create policy inchirieri_staff_update on inchirieri
  for update to authenticated
  using (auth_role() in ('owner','admin','manager','front_desk'))
  with check (auth_role() in ('owner','admin','manager','front_desk'));

create policy inchirieri_staff_delete on inchirieri
  for delete to authenticated
  using (auth_role() in ('owner','admin','manager','front_desk'));

create policy inchirieri_teacher_insert on inchirieri
  for insert to authenticated
  with check (
    auth_role() = 'teacher'
    and teacher is not null
    and teacher = current_teacher_id()
    and tier::text = 'staff'
    and (auth_locatie_id() is null or locatie = auth_locatie_id())
  );

create policy inchirieri_teacher_update on inchirieri
  for update to authenticated
  using (auth_role() = 'teacher' and teacher = current_teacher_id())
  with check (auth_role() = 'teacher' and teacher = current_teacher_id());

-- Teacherul anulează doar rezervări viitoare și fără bani încasați pe ele
-- (altfel o închiriere folosită/plătită ar dispărea din evidență).
create policy inchirieri_teacher_delete on inchirieri
  for delete to authenticated
  using (
    auth_role() = 'teacher'
    and teacher = current_teacher_id()
    and (data + ora_start) > (now() at time zone 'Europe/Bucharest')
    and not exists (select 1 from incasari i where i.inchiriere = inchirieri.id)
  );

-- ============================================================
-- 4) Trigger-gard pe coloane (RLS nu poate restricționa coloane):
--    teacherul mută doar programarea; prețul manual e doar treaba managerului.
-- ============================================================
create or replace function inchirieri_guard()
returns trigger
language plpgsql
as $$
declare
  v_claims json := nullif(current_setting('request.jwt.claims', true), '')::json;
  v_role   text;
begin
  -- Context de sistem (migrații, service_role) sau RPC-ul de reconciliere
  -- (adjust_inchiriere_price își face singur gardurile): trecem mai departe.
  if v_claims is null or (v_claims ->> 'role') = 'service_role' then
    return new;
  end if;
  if coalesce(current_setting('app.inchirieri_definer', true), '') = '1' then
    return new;
  end if;
  v_role := auth_role();

  if tg_op = 'INSERT' then
    if v_role = 'teacher' then
      if new.datorie is not null then
        raise exception 'Instructorii nu pot atașa datorii la rezervări.';
      end if;
      if coalesce(new.pret, 0) > 0 and new.status_plata <> 'neachitat' then
        raise exception 'Plata închirierii se înregistrează la recepție.';
      end if;
    end if;
    if new.tier::text = 'manual' and v_role not in ('owner','admin','manager') then
      raise exception 'Prețul manual e stabilit doar de manager.';
    end if;
  else
    if v_role = 'teacher' then
      if new.pret is distinct from old.pret
         or new.status_plata is distinct from old.status_plata
         or new.tier is distinct from old.tier
         or new.datorie is distinct from old.datorie
         or new.teacher is distinct from old.teacher
         or new.client is distinct from old.client
         or new.guest_nume is distinct from old.guest_nume
         or new.sala is distinct from old.sala then
        raise exception 'Instructorii pot modifica doar data/ora/durata rezervării.';
      end if;
      if (old.data + old.ora_start) <= (now() at time zone 'Europe/Bucharest') then
        raise exception 'Rezervarea a început deja — modificările se fac la recepție.';
      end if;
    end if;
    if v_role not in ('owner','admin','manager') then
      if new.tier is distinct from old.tier and new.tier::text = 'manual' then
        raise exception 'Prețul manual e stabilit doar de manager.';
      end if;
      if (new.tier::text = 'manual' or old.tier::text = 'manual')
         and new.pret is distinct from old.pret then
        raise exception 'Prețul manual îl modifică doar un manager.';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_inchirieri_guard on inchirieri;
create trigger trg_inchirieri_guard
  before insert or update on inchirieri
  for each row execute function inchirieri_guard();

-- ============================================================
-- 5) adjust_inchiriere_price: gard teacher (doar propriile închirieri) + gard
--    preț manual (doar manager+) + flag pentru bypass-ul trigger-gardului.
--    Corp identic cu 20260703200000 în rest.
-- ============================================================
create or replace function adjust_inchiriere_price(
  p_inchiriere uuid,
  p_new_pret   numeric
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_row    inchirieri%rowtype;
  v_paid   numeric;
  v_rest   numeric;
  v_status status_plata_inchiriere;
  v_dat    uuid;
  v_descr  text;
begin
  if p_new_pret is null or p_new_pret < 0 then
    raise exception 'Prețul trebuie să fie un număr pozitiv.';
  end if;

  select * into v_row from inchirieri where id = p_inchiriere;
  if not found then raise exception 'Închirierea nu există.'; end if;

  if auth_role() = 'teacher'
     and (v_row.teacher is null or v_row.teacher is distinct from current_teacher_id()) then
    raise exception 'Poți ajusta doar închirierile tale.';
  end if;
  if v_row.tier::text = 'manual' and auth_role() not in ('owner','admin','manager') then
    raise exception 'Prețul manual îl modifică doar un manager.';
  end if;

  -- Update-urile de mai jos sunt reconciliere legitimă — trigger-gardul de
  -- coloane nu se aplică (flag tranzacțional).
  perform set_config('app.inchirieri_definer', '1', true);

  select coalesce(sum(suma), 0) into v_paid from incasari where inchiriere = p_inchiriere;
  v_rest := round(p_new_pret - v_paid, 2);

  v_status := case
    when v_rest <= 0.004 then 'achitat'::status_plata_inchiriere
    when v_paid > 0.004  then 'partial'::status_plata_inchiriere
    else 'neachitat'::status_plata_inchiriere
  end;

  v_dat := v_row.datorie;

  -- Reconciliere pe cont — doar pentru un client (teacher/guest n-au cont).
  -- suma_datorata are CHECK > 0, deci gestionăm datoria doar când prețul e pozitiv.
  if v_row.client is not null and p_new_pret > 0.004 then
    if v_dat is null then
      -- creează datorie doar dacă rămâne ceva de reconciliat (rest de plată SAU credit)
      if abs(v_rest) > 0.004 then
        v_descr := 'Închiriere sală ' || to_char(v_row.data, 'DD.MM.YYYY')
                   || ' ' || to_char(v_row.ora_start, 'HH24:MI');
        insert into datorii (client, categorie, descriere, suma_datorata, locatie)
          values (v_row.client, 'Inchiriere', v_descr, p_new_pret, v_row.locatie)
          returning id into v_dat;
        -- leagă plățile deja făcute de noua datorie, ca restul din view să fie corect
        update incasari set datorie = v_dat, updated = now()
          where inchiriere = p_inchiriere;
      end if;
    else
      -- sincronizează charge-ul cu prețul nou; restul (poz/neg) rezultă din datorii_rest
      update datorii set suma_datorata = p_new_pret, updated = now() where id = v_dat;
    end if;
  end if;

  update inchirieri
     set pret = p_new_pret, status_plata = v_status, datorie = v_dat, updated = now()
   where id = p_inchiriere;

  return jsonb_build_object(
    'old_pret',    v_row.pret,
    'new_pret',    p_new_pret,
    'paid',        v_paid,
    'rest',        v_rest,
    'status',      v_status,
    'has_account', v_row.client is not null
  );
end;
$$;

revoke all on function adjust_inchiriere_price(uuid, numeric) from anon, public;
grant execute on function adjust_inchiriere_price(uuid, numeric) to authenticated;

-- ============================================================
-- 6) Grila de tarife: citire pentru toți, scriere doar manager+
--    (pagina Setări e deja PRIVILEGED; acum și DB-ul o garantează).
-- ============================================================
drop policy if exists tarife_inchiriere_all on tarife_inchiriere;

create policy tarife_inchiriere_select on tarife_inchiriere
  for select to authenticated using (true);

create policy tarife_inchiriere_priv_insert on tarife_inchiriere
  for insert to authenticated
  with check (auth_role() in ('owner','admin','manager'));

create policy tarife_inchiriere_priv_update on tarife_inchiriere
  for update to authenticated
  using (auth_role() in ('owner','admin','manager'))
  with check (auth_role() in ('owner','admin','manager'));

create policy tarife_inchiriere_priv_delete on tarife_inchiriere
  for delete to authenticated
  using (auth_role() in ('owner','admin','manager'));

-- ============================================================
-- 7) Teacherul nu scrie bani: gard restrictiv pe incasari + datorii.
--    (incasari avea insert/update deschise oricărui cont autentificat;
--    select rămâne liber — calendarul citește sumele încasate.)
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['incasari', 'datorii']
  loop
    execute format('drop policy if exists deny_teacher_insert on public.%I', t);
    execute format(
      'create policy deny_teacher_insert on public.%I as restrictive for insert to authenticated with check (auth_role() <> %L)',
      t, 'teacher');
    execute format('drop policy if exists deny_teacher_update on public.%I', t);
    execute format(
      'create policy deny_teacher_update on public.%I as restrictive for update to authenticated using (auth_role() <> %L) with check (auth_role() <> %L)',
      t, 'teacher', 'teacher');
    execute format('drop policy if exists deny_teacher_delete on public.%I', t);
    execute format(
      'create policy deny_teacher_delete on public.%I as restrictive for delete to authenticated using (auth_role() <> %L)',
      t, 'teacher');
  end loop;
end $$;
