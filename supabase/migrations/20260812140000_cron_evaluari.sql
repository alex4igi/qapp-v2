-- Evaluări cursanți: un SINGUR job zilnic care duce fiecare rundă prin toată
-- cronologia ei. Nu se creează cron-uri per rundă și nu există unul separat pentru
-- aprobările întârziate — acelea sunt prinse de pasul 4, care revizitează runda în
-- fiecare zi cât timp e în `verificare`.
--
-- Idempotent: fiecare pas verifică starea, iar notificările se dau o singură dată
-- (gardate pe kind + payload->>'sesiune').

create or replace function proceseaza_sesiuni_evaluare()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s          record;
  v_uid      uuid;
  v_deschise int := 0;
  v_verif    int := 0;
  v_trimise  int := 0;
  v_inchise  int := 0;
  v_n        int;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'Access denied';
  end if;

  -- ── 1) Deschiderea + contorul instructorilor ─────────────────────────────
  for s in
    select * from sesiuni_evaluare
    where stare = 'ciorna'
      and current_date >= data_limita_teacher - zile_avans
  loop
    update sesiuni_evaluare set stare = 'deschisa', updated = now() where id = s.id;
    v_deschise := v_deschise + 1;

    for v_uid in
      select distinct t.auth_user_id
      from sesiune_evaluare_grupe g
      join cursuri c on c.id = g.curs_id
      join teacheri t on t.id = c.teacher
      where g.sesiune_id = s.id and t.auth_user_id is not null
    loop
      insert into notifications (recipient_user_id, kind, title, body, payload, requires_action, status)
      values (
        v_uid, 'evaluari_deschise',
        format('Evaluări de completat: %s', s.nume),
        format('Ai timp până pe %s. Deschide „Grupele mele" ca să vezi ce mai lipsește.',
               to_char(s.data_limita_teacher, 'DD.MM.YYYY')),
        jsonb_build_object('sesiune', s.id),
        true, 'open'
      );
    end loop;
  end loop;

  -- ── 2) Memento cu o săptămână înainte de termenul instructorilor ──────────
  for s in
    select * from sesiuni_evaluare
    where stare = 'deschisa'
      and current_date >= data_limita_teacher - 7
      and current_date <  data_limita_teacher
  loop
    for v_uid in
      select distinct t.auth_user_id
      from sesiune_evaluare_grupe g
      join cursuri c on c.id = g.curs_id
      join teacheri t on t.id = c.teacher
      where g.sesiune_id = s.id and t.auth_user_id is not null
        -- doar cine chiar mai are de lucru
        and exists (
          select 1 from roster_evaluare(s.id, c.id) r
          where not exists (
            select 1 from evaluari e
            where e.sesiune_id = s.id and e.cursul = c.id
              and e.client = r.client_id and e.stare <> 'respinsa'
          )
        )
        and not exists (
          select 1 from notifications n
          where n.kind = 'evaluari_reminder'
            and n.payload->>'sesiune' = s.id::text
            and n.recipient_user_id = t.auth_user_id
        )
    loop
      insert into notifications (recipient_user_id, kind, title, body, payload, requires_action, status)
      values (
        v_uid, 'evaluari_reminder',
        format('Mai ai o săptămână: %s', s.nume),
        format('Termenul e %s. După el, evaluările merg la verificare.',
               to_char(s.data_limita_teacher, 'DD.MM.YYYY')),
        jsonb_build_object('sesiune', s.id),
        true, 'open'
      );
    end loop;
  end loop;

  -- ── 3) Începe fereastra managerului ──────────────────────────────────────
  for s in
    select * from sesiuni_evaluare
    where stare = 'deschisa' and current_date >= data_limita_teacher
  loop
    update sesiuni_evaluare set stare = 'verificare', updated = now() where id = s.id;
    v_verif := v_verif + 1;

    select count(*) into v_n from evaluari
    where sesiune_id = s.id and stare = 'de_verificat';

    for v_uid in
      select id from auth.users where raw_app_meta_data->>'role' in ('owner','admin','manager')
    loop
      insert into notifications (recipient_user_id, kind, title, body, payload, requires_action, status)
      values (
        v_uid, 'evaluari_de_verificat',
        format('%s %s de verificat', v_n, case when v_n = 1 then 'evaluare' else 'evaluări' end),
        format('Runda „%s" se trimite pe %s. Doar ce aprobi ajunge la părinți.',
               s.nume, to_char(s.data_trimitere, 'DD.MM.YYYY')),
        jsonb_build_object('sesiune', s.id),
        true, 'open'
      );
    end loop;
  end loop;

  -- ── 4) Expedierea + aprobările întârziate ────────────────────────────────
  -- Rulează în FIECARE zi de la data_trimitere: prima dată pleacă grosul, apoi
  -- pleacă tot ce mai aprobă managerul între timp.
  for s in
    select * from sesiuni_evaluare
    where stare = 'verificare' and current_date >= data_trimitere
  loop
    v_trimise := v_trimise + trimite_aprobate(s.id);

    -- Avertisment cu 3 zile înainte de expirare, o singură dată.
    if current_date >= s.data_inchidere - 3 and current_date < s.data_inchidere then
      select count(*) into v_n from evaluari
      where sesiune_id = s.id and stare in ('ciorna','de_verificat','respinsa');

      if v_n > 0 then
        for v_uid in
          select id from auth.users
          where raw_app_meta_data->>'role' in ('owner','admin','manager')
            and not exists (
              select 1 from notifications n
              where n.kind = 'evaluari_expira'
                and n.payload->>'sesiune' = s.id::text
                and n.recipient_user_id = auth.users.id
            )
        loop
          insert into notifications (recipient_user_id, kind, title, body, payload, requires_action, status)
          values (
            v_uid, 'evaluari_expira',
            format('%s %s expiră pe %s', v_n,
                   case when v_n = 1 then 'evaluare' else 'evaluări' end,
                   to_char(s.data_inchidere, 'DD.MM.YYYY')),
            format('Runda „%s" se închide. Ce nu e aprobat până atunci NU ajunge la părinți.', s.nume),
            jsonb_build_object('sesiune', s.id),
            true, 'open'
          );
        end loop;
      end if;
    end if;
  end loop;

  -- ── 5) Închiderea ────────────────────────────────────────────────────────
  for s in
    select * from sesiuni_evaluare
    where stare in ('deschisa','verificare') and current_date >= data_inchidere
  loop
    perform inchide_sesiune(s.id);
    v_inchise := v_inchise + 1;
  end loop;

  return jsonb_build_object(
    'deschise', v_deschise, 'in_verificare', v_verif,
    'trimise', v_trimise, 'inchise', v_inchise
  );
end;
$$;

revoke execute on function proceseaza_sesiuni_evaluare() from anon, public;
grant execute on function proceseaza_sesiuni_evaluare() to authenticated;

-- 06:00 UTC ≈ 09:00 România. Nu are nevoie de garda de oră locală ca `cron-morning`:
-- nimic de aici nu e sensibil la ora exactă (notificări in-app, nu SMS).
select cron.unschedule('qapp-evaluari-zilnic')
  where exists (select 1 from cron.job where jobname = 'qapp-evaluari-zilnic');

select cron.schedule(
  'qapp-evaluari-zilnic',
  '0 6 * * *',
  $$ select proceseaza_sesiuni_evaluare(); $$
);
