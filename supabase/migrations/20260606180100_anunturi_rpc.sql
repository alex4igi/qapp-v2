-- Qapp v2 — Anunțuri: RPC-uri pentru canalul STAFF (complet) + fundație CLIENT (fără UI).
-- Toate SECURITY DEFINER (bypass RLS pentru fan-out, ca la notify_admins_new_app_feedback).
-- Reutilizează helperii: auth_role(), is_admin(), user_locatie_id(), current_teacher_id().

-- ============================================================
-- STAFF — rezolvarea destinatarilor (validată pe scopul expeditorului)
-- ============================================================
-- owner/admin → orice rol × orice locație (global).
-- manager/front_desk → locația proprie + escaladare la admin/owner.
-- teacher → locațiile unde predă + escaladare.
create or replace function _anunt_staff_recipients(
  p_target_roles      text[],
  p_target_locatie_ids uuid[]
)
returns uuid[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid         uuid := auth.uid();
  v_role        text := auth_role();
  v_allowed     uuid[];
  v_has_locrole boolean;
  v_recipients  uuid[];
begin
  if v_uid is null then
    raise exception 'Autentificare necesară.';
  end if;
  if p_target_roles is null or cardinality(p_target_roles) = 0 then
    raise exception 'Alege cel puțin un rol destinatar.';
  end if;

  v_has_locrole := exists (
    select 1 from unnest(p_target_roles) r where r in ('manager', 'front_desk', 'teacher')
  );

  -- Validare scop pentru expeditorii ne-admin
  if not is_admin() then
    if v_role = 'teacher' then
      select array_agg(distinct c.locatie) into v_allowed
      from cursuri c
      where c.locatie is not null
        and (
          c.teacher = current_teacher_id()
          or exists (
            select 1 from cursuri_teacheri ct
            where ct.curs_id = c.id and ct.teacher_id = current_teacher_id()
          )
        );
      if user_locatie_id() is not null then
        v_allowed := array_append(coalesce(v_allowed, '{}'), user_locatie_id());
      end if;
    else
      -- manager, front_desk
      if user_locatie_id() is not null then
        v_allowed := array[user_locatie_id()];
      else
        v_allowed := '{}';
      end if;
    end if;
    v_allowed := coalesce(v_allowed, '{}');

    if v_has_locrole then
      if p_target_locatie_ids is null or cardinality(p_target_locatie_ids) = 0 then
        raise exception 'Alege cel puțin o locație pentru rolurile selectate.';
      end if;
      if exists (
        select 1 from unnest(p_target_locatie_ids) l where not (l = any(v_allowed))
      ) then
        raise exception 'Nu ai acces la una dintre locațiile alese.';
      end if;
    end if;
  end if;

  -- Rezolvare destinatari
  with recipients as (
    -- roluri globale (owner/admin): toți, indiferent de locație
    select u.id
    from auth.users u
    where u.raw_app_meta_data->>'role' = any(p_target_roles)
      and u.raw_app_meta_data->>'role' in ('owner', 'admin')
    union
    -- roluri legate de locație, cu locație fixă (sau admin-global = fără filtru)
    select u.id
    from auth.users u
    where u.raw_app_meta_data->>'role' = any(p_target_roles)
      and u.raw_app_meta_data->>'role' in ('manager', 'front_desk', 'teacher')
      and (
        cardinality(coalesce(p_target_locatie_ids, '{}')) = 0
        or (u.raw_app_meta_data->>'locatie_id')::uuid = any(p_target_locatie_ids)
      )
    union
    -- teacheri multi-locație (locatie_id null): incluși dacă predau la o locație țintă
    select distinct u.id
    from auth.users u
    join teacheri t on t.auth_user_id = u.id
    join cursuri c on (
      c.teacher = t.id
      or exists (select 1 from cursuri_teacheri ct where ct.curs_id = c.id and ct.teacher_id = t.id)
    )
    where 'teacher' = any(p_target_roles)
      and u.raw_app_meta_data->>'role' = 'teacher'
      and (u.raw_app_meta_data->>'locatie_id') is null
      and cardinality(coalesce(p_target_locatie_ids, '{}')) > 0
      and c.locatie = any(p_target_locatie_ids)
  )
  select array_agg(distinct id) into v_recipients
  from recipients
  where id <> v_uid;

  return coalesce(v_recipients, '{}');
end;
$$;

-- ============================================================
-- STAFF — preview (număr destinatari)
-- ============================================================
create or replace function preview_anunt_staff(
  p_target_roles       text[],
  p_target_locatie_ids uuid[]
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select cardinality(_anunt_staff_recipients(p_target_roles, p_target_locatie_ids));
$$;

-- ============================================================
-- STAFF — trimitere
-- ============================================================
create or replace function send_anunt_staff(
  p_titlu              text,
  p_continut           text,
  p_target_roles       text[],
  p_target_locatie_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_email      text;
  v_recipients uuid[];
  v_anunt_id   uuid;
  v_n          integer;
begin
  if v_uid is null then
    raise exception 'Autentificare necesară.';
  end if;
  if coalesce(btrim(p_titlu), '') = '' then
    raise exception 'Titlul e obligatoriu.';
  end if;
  if coalesce(btrim(p_continut), '') = '' then
    raise exception 'Conținutul e obligatoriu.';
  end if;

  v_recipients := _anunt_staff_recipients(p_target_roles, p_target_locatie_ids);
  v_n := cardinality(v_recipients);
  select email into v_email from auth.users where id = v_uid;

  insert into anunturi (expeditor_user_id, expeditor_email, canal, titlu, continut, audienta, nr_destinatari)
  values (
    v_uid, v_email, 'staff', btrim(p_titlu), btrim(p_continut),
    jsonb_build_object(
      'target_roles', to_jsonb(p_target_roles),
      'target_locatie_ids', to_jsonb(coalesce(p_target_locatie_ids, '{}'))
    ),
    v_n
  )
  returning id into v_anunt_id;

  if v_n > 0 then
    insert into anunturi_destinatari (anunt_id, recipient_user_id)
    select v_anunt_id, r from unnest(v_recipients) r;

    insert into notifications (recipient_user_id, kind, title, body, payload)
    select
      r,
      'anunt_staff',
      format('Anunț: %s', btrim(p_titlu)),
      coalesce(v_email, 'cineva'),
      jsonb_build_object('anunt_id', v_anunt_id, 'expeditor_email', v_email)
    from unnest(v_recipients) r;
  end if;

  return jsonb_build_object('anunt_id', v_anunt_id, 'nr_destinatari', v_n);
end;
$$;

-- ============================================================
-- STAFF — marcare citit (recipient)
-- ============================================================
create or replace function mark_anunt_read(p_anunt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update anunturi_destinatari
    set read_at = now()
    where anunt_id = p_anunt_id
      and recipient_user_id = auth.uid()
      and read_at is null;

  update notifications
    set read_at = now()
    where recipient_user_id = auth.uid()
      and kind = 'anunt_staff'
      and (payload->>'anunt_id')::uuid = p_anunt_id
      and read_at is null;
end;
$$;

-- ============================================================
-- CLIENT — fundație (fără UI încă): rezolvare audiență + preview + send
-- ============================================================
-- Clienți activi (recurent activ OR facultativ Prezent ≤21z), scopați pe expeditor:
--   teacher → cursurile lui (opțional un singur curs); manager → cursuri la locația lui;
--   admin/owner → oricine (opțional un curs). front_desk → nimic.
create or replace function resolve_anunt_clienti(p_curs_id uuid default null)
returns table (client_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select
      date_trunc('month', current_date)::date as start_luna,
      (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date as end_luna,
      (current_date - interval '21 days')::date as cut21
  ),
  scoped_cursuri as (
    select c.id, c.facultativ
    from cursuri c
    where (p_curs_id is null or c.id = p_curs_id)
      and (
        case auth_role()
          when 'teacher' then (
            c.teacher = current_teacher_id()
            or exists (
              select 1 from cursuri_teacheri ct
              where ct.curs_id = c.id and ct.teacher_id = current_teacher_id()
            )
          )
          when 'manager' then c.locatie = user_locatie_id()
          when 'admin'   then true
          when 'owner'   then true
          else false
        end
      )
  ),
  inrolari_active as (
    select e.id, e.client, sc.facultativ
    from enrollments e
    join scoped_cursuri sc on sc.id = e.cursul
    cross join params p
    where e.activ = true
      and e.reziliat = false
      and e.data_incepere <= p.end_luna
      and (e.data_final is null or e.data_final >= p.start_luna)
  )
  select distinct ia.client
  from inrolari_active ia
  cross join params p
  where ia.facultativ = false
     or exists (
       select 1 from prezente pr
       where pr.enrollment = ia.id
         and pr.status = 'Prezent'
         and pr.data >= p.cut21
     );
$$;

create or replace function preview_anunt_client(p_curs_id uuid default null)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from resolve_anunt_clienti(p_curs_id);
$$;

create or replace function send_anunt_client(
  p_titlu    text,
  p_continut text,
  p_curs_id  uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_email    text;
  v_anunt_id uuid;
  v_n        integer;
begin
  if v_uid is null then
    raise exception 'Autentificare necesară.';
  end if;
  if auth_role() not in ('teacher', 'manager', 'admin', 'owner') then
    raise exception 'Nu ai dreptul să trimiți anunțuri către clienți.';
  end if;
  if coalesce(btrim(p_titlu), '') = '' or coalesce(btrim(p_continut), '') = '' then
    raise exception 'Titlul și conținutul sunt obligatorii.';
  end if;

  select email into v_email from auth.users where id = v_uid;

  insert into anunturi (expeditor_user_id, expeditor_email, canal, titlu, continut, audienta, nr_destinatari)
  values (
    v_uid, v_email, 'client', btrim(p_titlu), btrim(p_continut),
    jsonb_build_object('curs_id', p_curs_id), 0
  )
  returning id into v_anunt_id;

  insert into anunturi_clienti (anunt_id, client_id)
  select v_anunt_id, r.client_id from resolve_anunt_clienti(p_curs_id) r;

  select count(*)::int into v_n from anunturi_clienti where anunt_id = v_anunt_id;
  update anunturi set nr_destinatari = v_n where id = v_anunt_id;

  return jsonb_build_object('anunt_id', v_anunt_id, 'nr_destinatari', v_n);
end;
$$;

-- ============================================================
-- Grants
-- ============================================================
grant execute on function _anunt_staff_recipients(text[], uuid[]) to authenticated;
grant execute on function preview_anunt_staff(text[], uuid[])     to authenticated;
grant execute on function send_anunt_staff(text, text, text[], uuid[]) to authenticated;
grant execute on function mark_anunt_read(uuid)                   to authenticated;
grant execute on function resolve_anunt_clienti(uuid)             to authenticated;
grant execute on function preview_anunt_client(uuid)              to authenticated;
grant execute on function send_anunt_client(text, text, uuid)     to authenticated;
