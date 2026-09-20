-- Drepturi implicite prea largi (audit 2026-09-20, secțiunea 4.8).
--
-- Supabase acordă implicit `all privileges` pe orice tabel nou către `anon` și
-- `authenticated`. Asta include TRUNCATE, care NU trece prin RLS: un singur
-- `truncate incasari` ar șterge toate cele 55.000 de încasări, fără ca nicio
-- politică să-l oprească. PostgREST nu emite TRUNCATE, deci gaura n-a fost
-- exploatabilă din aplicație — dar e exact genul de drept care nu trebuie să existe
-- pe rolul public al unei baze cu date reale. La fel REFERENCES/TRIGGER/MAINTAIN:
-- sunt drepturi de DDL și de mentenanță, n-au ce căuta pe rolurile de API.
--
-- Rămân: SELECT, INSERT, UPDATE, DELETE — singurele pe care le folosește PostgREST
-- și singurele filtrate de RLS.

-- ============================================================
-- 1) Tabelele existente
-- ============================================================
revoke truncate, references, trigger, maintain
  on all tables in schema public
  from anon, authenticated;

-- ============================================================
-- 2) Tabelele viitoare
-- ============================================================
-- Default privileges se schimbă per rol care creează obiectul. Migrațiile rulează
-- ca `postgres`, dar o parte din tabele au fost create de `supabase_admin` — dacă
-- nu avem drept pe al doilea, spunem și mergem mai departe.
do $$
declare
  r text;
begin
  foreach r in array array['postgres', 'supabase_admin'] loop
    begin
      execute format(
        'alter default privileges for role %I in schema public revoke truncate, references, trigger, maintain on tables from anon, authenticated',
        r
      );
    exception when insufficient_privilege or undefined_object then
      raise notice 'default privileges pentru % — fără drept, sărit', r;
    end;
  end loop;
end;
$$;

-- ============================================================
-- 3) Singura funcție `security definer` fără search_path fix
-- ============================================================
-- Fără `set search_path`, o funcție definer folosește search_path-ul apelantului:
-- cine poate crea obiecte într-o schemă din calea aceea îi poate substitui tabela.
create or replace function log_lead_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  uid uuid := auth.uid();
begin
  if (tg_op = 'INSERT') then
    insert into lead_history (lead_id, user_id, action_type, new_value)
    values (new.id, uid, 'created', new.status::text);
    return new;
  end if;

  if (new.status is distinct from old.status) then
    insert into lead_history (lead_id, user_id, action_type, old_value, new_value)
    values (new.id, uid, 'status_change', old.status::text, new.status::text);
  end if;

  if (new.sub_status is distinct from old.sub_status) then
    insert into lead_history (lead_id, user_id, action_type, old_value, new_value)
    values (new.id, uid, 'sub_status_change',
            old.sub_status::text, new.sub_status::text);
  end if;

  if (new.flag_reminder is distinct from old.flag_reminder) then
    insert into lead_history (lead_id, user_id, action_type)
    values (new.id, uid,
            (case when new.flag_reminder then 'flag_set' else 'flag_cleared' end)::lead_action_type);
  end if;

  if (new.observatii is distinct from old.observatii) then
    insert into lead_history (lead_id, user_id, action_type, new_value)
    values (new.id, uid, 'note_added', left(coalesce(new.observatii, ''), 500));
  end if;

  return new;
end;
$function$;
