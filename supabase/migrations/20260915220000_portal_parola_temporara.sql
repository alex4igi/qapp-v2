-- Portal membri — PAROLĂ TEMPORARĂ cu schimbare obligatorie la prima logare.
--
-- Conturile create în masă primesc o parolă comună. Cât timp `must_change_password`
-- e true, portal-auth NU emite tokenuri la login: cere întâi o parolă nouă
-- (acțiunea change_temporary_password). Altfel oricine știe emailul altui membru
-- ar intra în contul lui cu parola comună.

set search_path = public, extensions;

alter table portal_accounts
  add column if not exists must_change_password boolean not null default false;

-- Orice setare de parolă de către om (reset din email, schimbare din profil, reset de
-- la recepție) închide starea „temporară".
create or replace function portal_set_password(p_id uuid, p_password text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  update portal_accounts
     set password_hash = crypt(p_password, gen_salt('bf', 12)),
         status = 'active',
         must_change_password = false
   where id = p_id;
  delete from portal_sessions where account_id = p_id;
end; $$;

-- Creează un cont cu parolă temporară ȘI îl leagă de familie sau de client, atomic.
-- Aruncă excepție cu motivul (fără cont orfan dacă legarea nu se poate face).
create or replace function portal_create_account_temp(
  p_email citext,
  p_password text,
  p_familie_id uuid default null,
  p_client_id uuid default null
)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  if (p_familie_id is null) = (p_client_id is null) then
    raise exception 'specifica exact una: familie sau client';
  end if;
  if length(coalesce(p_password, '')) < 8 then
    raise exception 'parola sub 8 caractere';
  end if;

  if p_familie_id is not null then
    perform 1 from familii where id = p_familie_id and auth_user_id is null for update;
  else
    perform 1 from clienti where id = p_client_id and auth_user_id is null for update;
  end if;
  if not found then
    raise exception 'tinta inexistenta sau are deja cont';
  end if;

  insert into portal_accounts (email, password_hash, must_change_password)
  values (p_email, crypt(p_password, gen_salt('bf', 12)), true)
  on conflict (email) do nothing
  returning id into v_id;
  if v_id is null then
    raise exception 'email folosit deja de alt cont de portal';
  end if;

  if p_familie_id is not null then
    update familii set auth_user_id = v_id where id = p_familie_id;
  else
    update clienti set auth_user_id = v_id where id = p_client_id;
  end if;
  return v_id;
end; $$;

revoke all on function portal_set_password(uuid, text) from public, anon, authenticated;
revoke all on function portal_create_account_temp(citext, text, uuid, uuid) from public, anon, authenticated;
grant execute on function portal_set_password(uuid, text) to service_role;
grant execute on function portal_create_account_temp(citext, text, uuid, uuid) to service_role;
