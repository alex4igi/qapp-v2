-- Familii generate automat pentru clienții fără familie.
--
-- Contractul se trimite mereu unei familii (contracte.familie_id e obligatoriu), dar
-- 165 de cursanți activi n-aveau familie (2026-09-16), deși toți aveau telefonul
-- părintelui pe fișă. Numele reprezentantului nu e necesar la trimitere: părintele îl
-- completează singur la semnare. Deci familia se poate construi din fișa clientului.
--
-- O singură regulă, în asigura_familie_client, folosită de: butonul „Generează familiile
-- lipsă" (Familii), trimiterea contractelor (individual și în bulk) și conversia leadului.
--   1. telefonul (sau, în lipsă, emailul) e deja pe o familie existentă → clientul se
--      adaugă acolo (frate/soră), nu se creează dublură;
--   2. client major → familie proprie, el reprezentant (creeaza_familie_proprie);
--   3. altfel → familie cu numele de familie al copilului, contactul copiat de pe fișă,
--      reprezentantul luat din leadul din care a venit (nume_parinte), dacă există.

create or replace function tel9(p_telefon text)
returns text
language sql
immutable
as $$
  select case
    when length(regexp_replace(coalesce(p_telefon, ''), '\D', '', 'g')) >= 9
      then right(regexp_replace(coalesce(p_telefon, ''), '\D', '', 'g'), 9)
  end;
$$;

revoke execute on function tel9(text) from anon, public;
grant execute on function tel9(text) to authenticated;

-- „Ionita Oana" / „Oana Olaru" / „Adriana" → (nume, prenume). Cuvântul egal cu numele
-- copilului e numele de familie; altfel presupunem „Prenume Nume". Un singur cuvânt e
-- prenumele, cu numele copilului drept nume de familie.
create or replace function familie_reprezentant_din_text(
  p_text text,
  p_nume_copil text,
  out nume text,
  out prenume text
)
language plpgsql
immutable
as $$
declare
  w text[];
  n int;
  i int;
  idx int := 0;
  v_copil text := lower(split_part(trim(coalesce(p_nume_copil, '')), ' ', 1));
begin
  w := regexp_split_to_array(trim(coalesce(p_text, '')), '\s+');
  n := coalesce(array_length(w, 1), 0);
  if n = 0 or w[1] = '' then
    return;
  end if;
  if n = 1 then
    prenume := w[1];
    nume := nullif(trim(coalesce(p_nume_copil, '')), '');
    return;
  end if;
  for i in 1..n loop
    if lower(w[i]) = v_copil then
      idx := i;
      exit;
    end if;
  end loop;
  if idx > 0 then
    nume := w[idx];
    prenume := nullif(array_to_string(w[1:idx - 1] || w[idx + 1:n], ' '), '');
  else
    nume := w[n];
    prenume := nullif(array_to_string(w[1:n - 1], ' '), '');
  end if;
end;
$$;

revoke execute on function familie_reprezentant_din_text(text, text) from anon, public;
grant execute on function familie_reprezentant_din_text(text, text) to authenticated;

-- security invoker: RLS pe familii/clienti decide cine poate (aceleași roluri de staff
-- care creează familii de mână). p_dry_run doar spune ce ar face.
create or replace function asigura_familie_client(p_client_id uuid, p_dry_run boolean default false)
returns table (
  actiune            text,
  familie_id         uuid,
  familie_nume       text,
  reprezentant       text,
  sursa_reprezentant text,
  motiv              text
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  c            clienti%rowtype;
  v_tel        text[];
  v_email      text;
  v_ids        uuid[];
  v_nume       text[];
  v_fam_id     uuid;
  v_fam_nume   text;
  v_major      boolean;
  v_parinte    text;
  v_repr_nume  text;
  v_repr_pren  text;
  v_sursa      text;
begin
  if p_dry_run then
    select * into c from clienti where id = p_client_id;
  else
    select * into c from clienti where id = p_client_id for update;
  end if;
  if not found then
    raise exception 'Clientul nu există.';
  end if;

  if c.familia is not null then
    select f.nume_familie into v_fam_nume from familii f where f.id = c.familia;
    return query select 'are_familie'::text, c.familia, v_fam_nume, null::text, null::text, null::text;
    return;
  end if;

  v_tel := array_remove(array[tel9(c.telefon), tel9(c.telefonul_2)], null);
  v_email := nullif(lower(trim(c.email)), '');
  v_major := c.data_nasterii is not null
         and c.data_nasterii <= (current_date - interval '18 years')::date;

  -- 1) familie existentă cu același telefon; în lipsă de telefon potrivit, același email
  if cardinality(v_tel) > 0 then
    select array_agg(f.id), array_agg(f.nume_familie) into v_ids, v_nume
      from familii f
     where tel9(f.telefon) = any(v_tel) or tel9(f.telefon_2) = any(v_tel);
  end if;
  if coalesce(cardinality(v_ids), 0) = 0 and v_email is not null then
    select array_agg(f.id), array_agg(f.nume_familie) into v_ids, v_nume
      from familii f
     where lower(trim(f.email)) = v_email;
  end if;

  if coalesce(cardinality(v_ids), 0) > 1 then
    return query select 'sare'::text, null::uuid, null::text, null::text, null::text,
      ('contactul e pe ' || cardinality(v_ids) || ' familii: ' || array_to_string(v_nume, ', '))::text;
    return;
  end if;

  if coalesce(cardinality(v_ids), 0) = 1 then
    v_fam_id := v_ids[1];
    v_fam_nume := v_nume[1];
    if not p_dry_run then
      update clienti set familia = v_fam_id where id = c.id;
    end if;
    return query select 'ataseaza'::text, v_fam_id, v_fam_nume, null::text, null::text, null::text;
    return;
  end if;

  if nullif(trim(c.telefon), '') is null and nullif(trim(c.email), '') is null then
    return query select 'sare'::text, null::uuid, null::text, null::text, null::text,
      'fără telefon și email pe fișă'::text;
    return;
  end if;

  -- 2) major: familie proprie, el reprezentant
  if v_major then
    v_fam_nume := trim(c.nume || ' ' || coalesce(c.prenume, ''));
    if not p_dry_run then
      select p.familie_id, p.familie_nume into v_fam_id, v_fam_nume
        from creeaza_familie_proprie(c.id) p;
    end if;
    return query select 'familie_proprie'::text, v_fam_id, v_fam_nume, v_fam_nume, 'client'::text, null::text;
    return;
  end if;

  -- 3) minor sau fără dată de naștere: familia copilului, reprezentantul din lead
  select l.nume_parinte into v_parinte
    from leads l
   where nullif(trim(l.nume_parinte), '') is not null
     and (l.id_client = c.id
          or (cardinality(v_tel) > 0 and tel9(l.telefon) = any(v_tel)))
   order by (l.id_client is not distinct from c.id) desc, l.created desc
   limit 1;

  if v_parinte is not null then
    select r.nume, r.prenume into v_repr_nume, v_repr_pren
      from familie_reprezentant_din_text(v_parinte, c.nume) r;
    v_sursa := 'lead';
  end if;

  v_fam_nume := trim(c.nume);
  if not p_dry_run then
    insert into familii (
      nume_familie, nume_reprezentant, prenume_reprezentant, telefon, email,
      opt_out_marketing, opt_out_la, opt_out_motiv
    )
    values (
      v_fam_nume, v_repr_nume, v_repr_pren,
      nullif(trim(c.telefon), ''), nullif(trim(c.email), ''),
      c.opt_out_marketing, c.opt_out_la, c.opt_out_motiv
    )
    returning id into v_fam_id;

    update clienti set familia = v_fam_id where id = c.id;
  end if;

  return query select 'familie_noua'::text, v_fam_id, v_fam_nume,
    nullif(trim(concat_ws(' ', v_repr_nume, v_repr_pren)), ''), v_sursa, null::text;
end;
$$;

grant execute on function asigura_familie_client(uuid, boolean) to authenticated;
revoke execute on function asigura_familie_client(uuid, boolean) from anon, public;

-- Ce ar face butonul „Generează familiile lipsă": clienții cu înrolare în curs sau
-- viitoare (nereziliată = data_reziliere null, nu steagul `reziliat`) și fără familie.
-- Doi candidați cu același telefon sunt frați: al doilea intră în familia primului.
create or replace function familii_lipsa_preview()
returns table (
  client_id          uuid,
  client_nume        text,
  data_nasterii      date,
  categorie          text,
  telefon            text,
  email              text,
  grupe              text[],
  actiune            text,
  familie_id         uuid,
  familie_nume       text,
  reprezentant       text,
  sursa_reprezentant text,
  motiv              text
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  r record;
  a record;
  p record;
begin
  for r in
    with cand as (
      select cl.id,
             trim(cl.nume || ' ' || coalesce(cl.prenume, '')) as nume,
             cl.data_nasterii,
             cl.telefon,
             cl.email,
             tel9(cl.telefon) as t9,
             array_agg(distinct c.numele order by c.numele) as grupe
        from clienti cl
        join enrollments e on e.client = cl.id
         and e.data_reziliere is null
         and (e.data_final is null or e.data_final >= current_date)
        join cursuri c on c.id = e.cursul
       where cl.familia is null
       group by cl.id
    )
    select cand.*,
           case when t9 is not null
                then first_value(id) over (partition by t9 order by nume, id) end as primul_id,
           case when t9 is not null
                then first_value(nume) over (partition by t9 order by nume, id) end as primul_nume
      from cand
     order by nume, id
  loop
    select * into a from asigura_familie_client(r.id, true);

    client_id          := r.id;
    client_nume        := r.nume;
    data_nasterii      := r.data_nasterii;
    categorie          := case
                            when r.data_nasterii is null then 'fara_data'
                            when r.data_nasterii <= (current_date - interval '18 years')::date then 'adult'
                            else 'minor'
                          end;
    telefon            := nullif(trim(r.telefon), '');
    email              := nullif(trim(r.email), '');
    grupe              := r.grupe;
    actiune            := a.actiune;
    familie_id         := a.familie_id;
    familie_nume       := a.familie_nume;
    reprezentant       := a.reprezentant;
    sursa_reprezentant := a.sursa_reprezentant;
    motiv              := a.motiv;

    if a.actiune in ('familie_noua', 'familie_proprie')
       and r.primul_id is not null and r.primul_id <> r.id then
      select * into p from asigura_familie_client(r.primul_id, true);
      actiune      := 'frate';
      familie_nume := p.familie_nume;
      reprezentant := p.reprezentant;
      sursa_reprezentant := p.sursa_reprezentant;
      motiv        := 'același telefon cu ' || r.primul_nume;
    end if;

    return next;
  end loop;
end;
$$;

grant execute on function familii_lipsa_preview() to authenticated;
revoke execute on function familii_lipsa_preview() from anon, public;

-- Rulează regula pentru clienții bifați, în ordinea dată (frații: primul creează
-- familia, al doilea o găsește după telefon). O eroare pe un client nu oprește restul.
create or replace function genereaza_familii_lipsa(p_client_ids uuid[])
returns table (
  client_id    uuid,
  actiune      text,
  familie_id   uuid,
  familie_nume text,
  motiv        text
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  r record;
  a record;
begin
  for r in
    select u.id, u.ord from unnest(p_client_ids) with ordinality as u(id, ord) order by u.ord
  loop
    begin
      select * into a from asigura_familie_client(r.id, false);
      client_id    := r.id;
      actiune      := a.actiune;
      familie_id   := a.familie_id;
      familie_nume := a.familie_nume;
      motiv        := a.motiv;
    exception when others then
      client_id    := r.id;
      actiune      := 'eroare';
      familie_id   := null;
      familie_nume := null;
      motiv        := sqlerrm;
    end;
    return next;
  end loop;
end;
$$;

grant execute on function genereaza_familii_lipsa(uuid[]) to authenticated;
revoke execute on function genereaza_familii_lipsa(uuid[]) from anon, public;

-- Țintele pentru bulk primesc și contactul clientului: un client fără familie e
-- eligibil dacă are telefon/email, familia i se creează la trimitere.
drop function if exists list_targets_contracte(uuid, uuid, uuid);

create function list_targets_contracte(
  p_sezon   uuid default null,
  p_locatie uuid default null,
  p_curs    uuid default null
)
returns table (
  client_id      uuid,
  client_nume    text,
  familie_id     uuid,
  familie_nume   text,
  telefon        text,
  email          text,
  client_telefon text,
  client_email   text,
  locatie_nume   text,
  cursuri        text[]
)
language sql
stable
security invoker
set search_path = public
as $$
  with elig as (
    select distinct
      e.client,
      c.numele as curs_nume,
      l.nume as locatie_nume
    from enrollments e
    join cursuri c on c.id = e.cursul
    left join sali s on s.id = c.sala
    left join locatii l on l.id = coalesce(s.locatie, c.locatie)
    where e.client is not null
      and e.data_reziliere is null
      and (e.data_final is null or e.data_final >= current_date)
      and (p_sezon is null or coalesce(e.sezon_id, c.sezon) = p_sezon)
      and (p_curs is null or c.id = p_curs)
      and (p_locatie is null or coalesce(s.locatie, c.locatie) = p_locatie)
  )
  select
    cl.id,
    trim(cl.nume || ' ' || coalesce(cl.prenume, ''))::text,
    f.id,
    f.nume_familie,
    nullif(trim(f.telefon), ''),
    nullif(trim(f.email), ''),
    nullif(trim(cl.telefon), ''),
    nullif(trim(cl.email), ''),
    max(el.locatie_nume),
    array_agg(distinct el.curs_nume order by el.curs_nume)
  from elig el
  join clienti cl on cl.id = el.client
  left join familii f on f.id = cl.familia
  group by cl.id, cl.nume, cl.prenume, cl.telefon, cl.email, f.id, f.nume_familie, f.telefon, f.email
  order by f.nume_familie nulls last, cl.nume, cl.prenume;
$$;

grant execute on function list_targets_contracte(uuid, uuid, uuid) to authenticated;
revoke execute on function list_targets_contracte(uuid, uuid, uuid) from anon, public;
