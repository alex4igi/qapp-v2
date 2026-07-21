-- Anunțuri staff — repară fan-out-ul către recepția/managerii multi-locație.
--
-- Din 0cd399e (2026-06-24) front_desk poate avea locatie_id = null = „lucrează la mai
-- multe locații, basculează din header" (vezi useWorkingLocatie + admin-users). Modulul
-- de anunțuri e anterior și presupunea locație fixă, așa că filtrul
-- `(locatie_id)::uuid = any(target)` dădea NULL → recepția era invizibilă la fan-out
-- (0 destinatari) și, ca expeditor, nu putea alege nicio locație.
--
-- Teacherii aveau deja o ramură dedicată (incluși după locațiile unde predau efectiv);
-- aici adăugăm simetricul pentru manager/front_desk, unde „fără locație" înseamnă
-- „oriunde", nu „nicăieri".

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
      -- manager, front_desk: locație fixă → doar ea; fără locație → toate (multi-locație).
      if user_locatie_id() is not null then
        v_allowed := array[user_locatie_id()];
      else
        select array_agg(id) into v_allowed from locatii;
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
    -- roluri legate de locație (sau admin-global = fără filtru)
    select u.id
    from auth.users u
    where u.raw_app_meta_data->>'role' = any(p_target_roles)
      and u.raw_app_meta_data->>'role' in ('manager', 'front_desk', 'teacher')
      and (
        cardinality(coalesce(p_target_locatie_ids, '{}')) = 0
        or nullif(u.raw_app_meta_data->>'locatie_id', '')::uuid = any(p_target_locatie_ids)
        -- manager/front_desk fără locație fixă = multi-locație → primesc pentru orice
        -- locație țintă. (Teacherii fără locație NU intră aici: pentru ei contează
        -- unde predau efectiv, rezolvat în ramura de mai jos.)
        or (
          nullif(u.raw_app_meta_data->>'locatie_id', '') is null
          and u.raw_app_meta_data->>'role' in ('manager', 'front_desk')
        )
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
      and nullif(u.raw_app_meta_data->>'locatie_id', '') is null
      and cardinality(coalesce(p_target_locatie_ids, '{}')) > 0
      and c.locatie = any(p_target_locatie_ids)
  )
  select array_agg(distinct id) into v_recipients
  from recipients
  where id <> v_uid;

  return coalesce(v_recipients, '{}');
end;
$$;

revoke execute on function _anunt_staff_recipients(text[], uuid[]) from anon, public;
grant execute on function _anunt_staff_recipients(text[], uuid[]) to authenticated;
