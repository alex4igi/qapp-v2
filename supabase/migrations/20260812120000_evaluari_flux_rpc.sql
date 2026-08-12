-- Evaluări cursanți: RPC-urile fluxului ciornă → verificare → trimitere → închidere.
--
-- Toate SECURITY DEFINER (traversează RLS ca să poată agrega roster + evaluări), deci
-- toate revocate de la anon/public la finalul fișierului — `auth_role()` cade pe
-- 'front_desk' pentru requesturile fără rol, așa că un definer negardat ar fi apelabil
-- cu cheia publică (vezi 20260717150000).
--
-- Funcțiile de expediere acceptă și apel fără auth (auth.uid() is null = cron).

-- ============================================================
-- 0) Helperi
-- ============================================================

-- Cine are voie să atingă evaluările unei grupe: adminul, managerul din locația grupei
-- și oricine are profil de instructor legat de curs (rolul nu contează — un manager
-- care predă folosește aceleași ecrane ca un teacher pur).
create or replace function poate_evalua_cursul(p_curs uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin()
      or (is_manager() and evaluare_in_locatia_mea(p_curs))
      or exists (
        select 1 from cursuri c
        where c.id = p_curs
          and (c.teacher = current_teacher_id()
               or exists (select 1 from cursuri_teacheri ct
                          where ct.curs_id = c.id and ct.teacher_id = current_teacher_id()))
      );
$$;

-- Cursanții așteptați la o grupă într-o rundă = înrolări nereziliate care acoperă
-- deadline-ul teacherilor, minus excepțiile („nu se aplică").
-- Apartenența e pe reziliat + acoperire de dată, NU pe `activ` (nesigur pe datele
-- migrate din v1 — vezi dashboard/api/grupa.ts).
create or replace function roster_evaluare(p_sesiune uuid, p_curs uuid)
returns table (client_id uuid)
language sql stable security definer set search_path = public as $$
  select distinct e.client
  from enrollments e
  join sesiuni_evaluare s on s.id = p_sesiune
  where e.cursul = p_curs
    and e.client is not null
    and e.reziliat = false
    and e.data_incepere is not null
    and e.data_incepere <= s.data_limita_teacher
    and (e.data_final is null or e.data_final >= s.data_limita_teacher)
    and not exists (
      select 1 from evaluari_exceptii x
      where x.sesiune_id = p_sesiune and x.curs_id = p_curs and x.client_id = e.client
    );
$$;

-- ============================================================
-- 1) Citiri
-- ============================================================

-- Runda pe care lucrează toată lumea acum. Dacă sunt mai multe deschise, cea care
-- se trimite prima.
create or replace function get_sesiune_activa()
returns table (
  id uuid, nume text, stare text,
  data_limita_teacher date, data_trimitere date, data_inchidere date,
  zile_pana_la_limita int, zile_pana_la_trimitere int, zile_pana_la_inchidere int
)
language sql stable security definer set search_path = public as $$
  select s.id, s.nume, s.stare,
         s.data_limita_teacher, s.data_trimitere, s.data_inchidere,
         (s.data_limita_teacher - current_date)::int,
         (s.data_trimitere      - current_date)::int,
         (s.data_inchidere      - current_date)::int
  from sesiuni_evaluare s
  where s.stare in ('deschisa', 'verificare')
  order by s.data_trimitere
  limit 1;
$$;

-- Acoperirea rundei, per grupă — ecranul managerului.
create or replace function get_acoperire_sesiune(p_sesiune uuid)
returns table (
  curs_id uuid, curs_nume text, teacher_nume text,
  n_asteptati int, n_exceptii int,
  n_ciorna int, n_de_verificat int, n_aprobate int,
  n_respinse int, n_trimise int, n_expirate int
)
language sql stable security definer set search_path = public as $$
  select
    c.id,
    c.numele,
    btrim(coalesce(t.nume, '') || ' ' || coalesce(t.prenume, '')),
    (select count(*)::int from roster_evaluare(p_sesiune, c.id)),
    (select count(*)::int from evaluari_exceptii x
      where x.sesiune_id = p_sesiune and x.curs_id = c.id),
    count(*) filter (where e.stare = 'ciorna')::int,
    count(*) filter (where e.stare = 'de_verificat')::int,
    count(*) filter (where e.stare = 'aprobata')::int,
    count(*) filter (where e.stare = 'respinsa')::int,
    count(*) filter (where e.stare = 'trimisa')::int,
    count(*) filter (where e.stare = 'expirata')::int
  from sesiune_evaluare_grupe g
  join cursuri c on c.id = g.curs_id
  left join teacheri t on t.id = c.teacher
  left join evaluari e on e.sesiune_id = p_sesiune and e.cursul = c.id
  where g.sesiune_id = p_sesiune
  group by c.id, c.numele, t.nume, t.prenume
  order by c.numele;
$$;

-- Contorul instructorului: grupele LUI din runda activă, cu progresul.
create or replace function get_countdown_evaluari_teacher()
returns table (
  sesiune_id uuid, sesiune_nume text, sesiune_stare text,
  data_limita_teacher date, data_trimitere date,
  zile_ramase int,
  curs_id uuid, curs_nume text,
  n_asteptati int, n_completate int, n_respinse int, grupa_trimisa boolean
)
language sql stable security definer set search_path = public as $$
  with s as (select * from sesiuni_evaluare where stare in ('deschisa','verificare')
             order by data_trimitere limit 1)
  select
    s.id, s.nume, s.stare,
    s.data_limita_teacher, s.data_trimitere,
    (s.data_limita_teacher - current_date)::int,
    c.id, c.numele,
    (select count(*)::int from roster_evaluare(s.id, c.id)),
    -- „completat" = există evaluare în orice stare care nu s-a întors la teacher
    (select count(*)::int from evaluari e
      where e.sesiune_id = s.id and e.cursul = c.id and e.stare <> 'respinsa'),
    (select count(*)::int from evaluari e
      where e.sesiune_id = s.id and e.cursul = c.id and e.stare = 'respinsa'),
    -- grupa a plecat la manager: nu mai e nimic de completat
    not exists (
      select 1 from evaluari e
      where e.sesiune_id = s.id and e.cursul = c.id and e.stare in ('ciorna','respinsa')
    )
  from s
  join sesiune_evaluare_grupe g on g.sesiune_id = s.id
  join cursuri c on c.id = g.curs_id
  where c.teacher = current_teacher_id()
     or exists (select 1 from cursuri_teacheri ct
                where ct.curs_id = c.id and ct.teacher_id = current_teacher_id())
  order by c.numele;
$$;

-- Rosterul de completat: fiecare cursant așteptat + evaluarea lui (dacă există).
-- Alimentează ecranul de grupă, unde teacherul le bifează pe toate într-o pagină.
create or replace function get_roster_evaluare(p_sesiune uuid, p_curs uuid)
returns table (
  client_id uuid, client_nume text,
  evaluare_id uuid, stare text, motiv_respingere text,
  skill_ritm int, skill_pasi_baza int, skill_coregrafie int, skill_izolari int,
  skill_coordonare int, skill_freeze int, skill_sincronizare int,
  skill_improvizatie int, skill_expresivitate int, skill_prezentare int,
  feedback_general text, nivel_grupa text,
  exceptat boolean, motiv_exceptie text
)
language sql stable security definer set search_path = public as $$
  select
    cl.id,
    btrim(coalesce(cl.nume, '') || ' ' || coalesce(cl.prenume, '')),
    e.id, e.stare, e.motiv_respingere,
    e.skill_ritm, e.skill_pasi_baza, e.skill_coregrafie, e.skill_izolari,
    e.skill_coordonare, e.skill_freeze, e.skill_sincronizare,
    e.skill_improvizatie, e.skill_expresivitate, e.skill_prezentare,
    e.feedback_general, e.nivel_grupa,
    x.id is not null, x.motiv
  from clienti cl
  join enrollments en on en.client = cl.id and en.cursul = p_curs and en.reziliat = false
  join sesiuni_evaluare s on s.id = p_sesiune
  left join evaluari e
    on e.sesiune_id = p_sesiune and e.cursul = p_curs and e.client = cl.id
  left join evaluari_exceptii x
    on x.sesiune_id = p_sesiune and x.curs_id = p_curs and x.client_id = cl.id
  where poate_evalua_cursul(p_curs)
    and en.data_incepere is not null
    and en.data_incepere <= s.data_limita_teacher
    and (en.data_final is null or en.data_final >= s.data_limita_teacher)
  group by cl.id, cl.nume, cl.prenume, e.id, e.stare, e.motiv_respingere,
           e.skill_ritm, e.skill_pasi_baza, e.skill_coregrafie, e.skill_izolari,
           e.skill_coordonare, e.skill_freeze, e.skill_sincronizare,
           e.skill_improvizatie, e.skill_expresivitate, e.skill_prezentare,
           e.feedback_general, e.nivel_grupa, x.id, x.motiv
  order by 2;
$$;

-- ============================================================
-- 2) Acțiuni — instructor
-- ============================================================

-- „Nu se aplică" pe un cursant: iese din denominator, cu motiv obligatoriu.
create or replace function exclude_cursant_evaluare(
  p_sesiune uuid, p_curs uuid, p_client uuid, p_motiv text
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not poate_evalua_cursul(p_curs) then
    raise exception 'Nu ai dreptul să modifici evaluările acestei grupe.';
  end if;
  if coalesce(btrim(p_motiv), '') = '' then
    raise exception 'Motivul este obligatoriu.';
  end if;

  insert into evaluari_exceptii (sesiune_id, curs_id, client_id, motiv, teacher_id)
  values (p_sesiune, p_curs, p_client, btrim(p_motiv), current_teacher_id())
  on conflict (sesiune_id, curs_id, client_id)
  do update set motiv = excluded.motiv, teacher_id = excluded.teacher_id;

  -- Excepția bate ciorna: dacă exista una începută, dispare (nu are ce trimite).
  delete from evaluari
  where sesiune_id = p_sesiune and cursul = p_curs and client = p_client
    and stare in ('ciorna', 'respinsa');
end;
$$;

create or replace function anuleaza_exceptie_evaluare(
  p_sesiune uuid, p_curs uuid, p_client uuid
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not poate_evalua_cursul(p_curs) then
    raise exception 'Nu ai dreptul să modifici evaluările acestei grupe.';
  end if;
  delete from evaluari_exceptii
  where sesiune_id = p_sesiune and curs_id = p_curs and client_id = p_client;
end;
$$;

-- Trimite TOATĂ grupa spre verificare. Refuză dacă rămâne cineva neacoperit —
-- altfel managerul primește grupe pe jumătate și nu știe dacă mai vine ceva.
create or replace function submit_grupa_evaluare(p_sesiune uuid, p_curs uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_lipsa int;
  v_n     int;
begin
  if not poate_evalua_cursul(p_curs) then
    raise exception 'Nu ai dreptul să trimiți evaluările acestei grupe.';
  end if;

  select count(*) into v_lipsa
  from roster_evaluare(p_sesiune, p_curs) r
  where not exists (
    select 1 from evaluari e
    where e.sesiune_id = p_sesiune and e.cursul = p_curs and e.client = r.client_id
      and e.stare <> 'respinsa'
  );

  if v_lipsa > 0 then
    raise exception
      'Mai ai % % de completat. Completează-i sau marchează-i „nu se aplică".',
      v_lipsa, case when v_lipsa = 1 then 'cursant' else 'cursanți' end;
  end if;

  update evaluari
  set stare = 'de_verificat', motiv_respingere = null, updated = now()
  where sesiune_id = p_sesiune and cursul = p_curs
    and stare in ('ciorna', 'respinsa');
  get diagnostics v_n = row_count;

  return v_n;
end;
$$;

-- ============================================================
-- 3) Acțiuni — manager
-- ============================================================

create or replace function aproba_evaluari(p_ids uuid[])
returns integer
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if not (is_admin() or is_manager()) then
    raise exception 'Doar managerul poate aproba evaluări.';
  end if;

  update evaluari e
  set stare = 'aprobata', verificat_de = auth.uid(), verificat_la = now(), updated = now()
  where e.id = any(p_ids)
    and e.stare = 'de_verificat'
    and (is_admin() or evaluare_in_locatia_mea(e.cursul));
  get diagnostics v_n = row_count;

  return v_n;
end;
$$;

-- Respingerea se întoarce la instructor cu motivul. Nu ștergem nimic: teacherul
-- corectează exact rândul lui și îl retrimite.
create or replace function respinge_evaluare(p_id uuid, p_motiv text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_curs      uuid;
  v_teacher   uuid;
  v_client    text;
  v_curs_nume text;
  v_uid       uuid;
begin
  if not (is_admin() or is_manager()) then
    raise exception 'Doar managerul poate respinge evaluări.';
  end if;
  if coalesce(btrim(p_motiv), '') = '' then
    raise exception 'Motivul respingerii este obligatoriu — altfel instructorul nu știe ce să corecteze.';
  end if;

  select e.cursul, e.teacher,
         btrim(coalesce(cl.nume,'') || ' ' || coalesce(cl.prenume,'')), c.numele
    into v_curs, v_teacher, v_client, v_curs_nume
  from evaluari e
  join clienti cl on cl.id = e.client
  left join cursuri c on c.id = e.cursul
  where e.id = p_id and e.stare = 'de_verificat';

  if v_curs is null then
    raise exception 'Evaluarea nu există sau nu e în verificare.';
  end if;
  if not (is_admin() or evaluare_in_locatia_mea(v_curs)) then
    raise exception 'Evaluarea nu e din locația ta.';
  end if;

  update evaluari
  set stare = 'respinsa', motiv_respingere = btrim(p_motiv),
      verificat_de = auth.uid(), verificat_la = now(), updated = now()
  where id = p_id;

  select auth_user_id into v_uid from teacheri where id = v_teacher;
  if v_uid is not null then
    insert into notifications (recipient_user_id, kind, title, body, payload, requires_action, status)
    values (
      v_uid, 'evaluare_respinsa',
      format('Evaluare de corectat: %s', coalesce(nullif(v_client,''), 'cursant')),
      format('%s — %s', coalesce(v_curs_nume, 'grupă'), btrim(p_motiv)),
      jsonb_build_object('evaluare', p_id, 'curs', v_curs),
      true, 'open'
    );
  end if;
end;
$$;

-- ============================================================
-- 4) Expediere + închidere (manager sau cron)
-- ============================================================

-- Trimite spre portal DOAR ce a aprobat managerul. Ce nu e aprobat rămâne pe loc:
-- cronul reintră zilnic și-l ia când apare aprobarea, până la data_inchidere.
create or replace function trimite_aprobate(p_sesiune uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_clienti  uuid[];
  v_n        int := 0;
  v_nume     text;
  v_anunt    uuid;
begin
  if auth.uid() is not null and not (is_admin() or is_manager()) then
    raise exception 'Doar managerul poate trimite evaluări.';
  end if;

  select nume into v_nume from sesiuni_evaluare where id = p_sesiune;
  if v_nume is null then
    raise exception 'Runda de evaluare nu există.';
  end if;

  with trimise as (
    update evaluari
    set stare = 'trimisa', trimis_la = now(), updated = now()
    where sesiune_id = p_sesiune and stare = 'aprobata'
    returning client
  )
  select coalesce(array_agg(distinct client), '{}') into v_clienti from trimise;

  v_n := coalesce(array_length(v_clienti, 1), 0);
  if v_n = 0 then
    return 0;
  end if;

  -- Notificarea părintelui trece prin canalul de anunțuri client existent, deci
  -- clopoțelul portalului o ia prin get_anunturi_client() fără nicio schimbare acolo.
  insert into anunturi (expeditor_user_id, canal, titlu, continut, audienta, nr_destinatari)
  values (
    auth.uid(), 'client',
    'Evaluare nouă de la instructor',
    format('Evaluarea din runda „%s" este disponibilă în contul tău, la secțiunea Grupa.', v_nume),
    jsonb_build_object('sesiune_evaluare', p_sesiune),
    v_n
  )
  returning id into v_anunt;

  insert into anunturi_clienti (anunt_id, client_id)
  select v_anunt, unnest(v_clienti)
  on conflict do nothing;

  -- Runda se închide singură doar dacă chiar n-a mai rămas nimic de lucru.
  update sesiuni_evaluare
  set stare = 'trimisa', trimisa_la = coalesce(trimisa_la, now()), updated = now()
  where id = p_sesiune
    and not exists (
      select 1 from evaluari e
      where e.sesiune_id = p_sesiune
        and e.stare in ('ciorna','de_verificat','aprobata','respinsa')
    );

  return v_n;
end;
$$;

-- Capătul rundei. Fără el, o evaluare pe care managerul n-o aprobă niciodată ține
-- runda vie la infinit și cronul o revizitează în fiecare zi, pe veci.
create or replace function inchide_sesiune(p_sesiune uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_trimise  int;
  v_expirate int;
  v_nume     text;
  v_grupe    text;
  v_uid      uuid;
begin
  if auth.uid() is not null and not (is_admin() or is_manager()) then
    raise exception 'Doar managerul poate închide o rundă de evaluare.';
  end if;

  select nume into v_nume from sesiuni_evaluare where id = p_sesiune;
  if v_nume is null then
    raise exception 'Runda de evaluare nu există.';
  end if;

  -- Ultima șansă pentru ce e aprobat dar încă netrimis.
  v_trimise := trimite_aprobate(p_sesiune);

  select string_agg(distinct c.numele, ', ') into v_grupe
  from evaluari e join cursuri c on c.id = e.cursul
  where e.sesiune_id = p_sesiune and e.stare in ('ciorna','de_verificat','respinsa');

  update evaluari
  set stare = 'expirata', updated = now()
  where sesiune_id = p_sesiune and stare in ('ciorna','de_verificat','respinsa');
  get diagnostics v_expirate = row_count;

  update sesiuni_evaluare
  set stare = 'inchisa', inchisa_la = now(), updated = now()
  where id = p_sesiune;

  -- Raportul: cine a rămas pe dinafară și de la ce grupe. Fără el, expirarea e mută.
  if v_expirate > 0 then
    for v_uid in
      select id from auth.users where raw_app_meta_data->>'role' in ('owner','admin','manager')
    loop
      insert into notifications (recipient_user_id, kind, title, body, payload, requires_action, status)
      values (
        v_uid, 'evaluari_expirate',
        format('Runda „%s" s-a închis cu %s neverificate', v_nume, v_expirate),
        format('%s %s nu au fost aprobate până la termen și NU au ajuns la părinți. Grupe: %s',
               v_expirate,
               case when v_expirate = 1 then 'evaluare' else 'evaluări' end,
               coalesce(v_grupe, '—')),
        jsonb_build_object('sesiune', p_sesiune, 'expirate', v_expirate),
        true, 'open'
      );
    end loop;
  end if;

  return jsonb_build_object('trimise', v_trimise, 'expirate', v_expirate);
end;
$$;

-- ============================================================
-- 5) Grants — authenticated DA, anon/public NU (vezi antetul fișierului)
-- ============================================================
do $$
declare
  v_sig text;
  v_sigs text[] := array[
    'poate_evalua_cursul(uuid)',
    'roster_evaluare(uuid, uuid)',
    'get_sesiune_activa()',
    'get_acoperire_sesiune(uuid)',
    'get_countdown_evaluari_teacher()',
    'get_roster_evaluare(uuid, uuid)',
    'exclude_cursant_evaluare(uuid, uuid, uuid, text)',
    'anuleaza_exceptie_evaluare(uuid, uuid, uuid)',
    'submit_grupa_evaluare(uuid, uuid)',
    'aproba_evaluari(uuid[])',
    'respinge_evaluare(uuid, text)',
    'trimite_aprobate(uuid)',
    'inchide_sesiune(uuid)'
  ];
begin
  foreach v_sig in array v_sigs loop
    execute format('revoke execute on function %s from anon, public', v_sig);
    execute format('grant execute on function %s to authenticated', v_sig);
  end loop;
end $$;
