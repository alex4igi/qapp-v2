-- Promo iulie 2026: rezervări OPEN bonus (gratuite) pe ședințe specifice, legate
-- de o înrolare facultativă „Per lună" EXISTENTĂ.
--
-- Context: abonamentele de iulie vândute pe 29-30 iunie includ, ca bonus, ședințele
-- din acele 2 zile. Înrolarea de iulie rămâne curată (data_incepere = 1 iulie → valoarea
-- cade pe iulie în statistici/financiar); accesul la cele 2 zile de iunie se acoperă cu
-- rezervări OPEN gratuite, exact mecanismul prin care rosterul facultativ pe zi afișează
-- un client (getOpenRosterForDate).
--
-- Spre deosebire de rezerva_loc_open: NU creează înrolare nouă și NU încasează nimic
-- (suma = 0, incasare = null). Idempotentă: re-rularea nu dublează rezervările.

create or replace function rezerva_bonus_open(
  p_enrollment uuid,
  p_date_list  date[]
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_curs    uuid;
  v_client  uuid;
  v_tip     text;
  v_rez     boolean;
  v_fac     boolean;
  v_cap     integer;
  d         date;
  v_sesiune uuid;
  v_exists  boolean;
  v_created integer := 0;
begin
  -- 0) authz
  if auth_role() not in ('admin', 'owner', 'manager', 'front_desk') then
    raise exception 'Acces refuzat.';
  end if;

  -- 1) citește + validează înrolarea
  select e.cursul, e.client, e.tip_plata::text, e.reziliat,
         coalesce(c.facultativ, false), coalesce(c.capacitate_maxima, 35)
    into v_curs, v_client, v_tip, v_rez, v_fac, v_cap
  from enrollments e
  join cursuri c on c.id = e.cursul
  where e.id = p_enrollment;
  if not found then
    raise exception 'Înrolarea nu există.';
  end if;
  if v_rez then
    raise exception 'Înrolarea este reziliată.';
  end if;
  if v_tip <> 'Per luna' then
    raise exception 'Bonusul se aplică doar înrolărilor „Per lună".';
  end if;
  if not v_fac then
    raise exception 'Bonusul se aplică doar cursurilor facultative.';
  end if;

  -- 2) pentru fiecare dată: upsert sesiune + rezervare gratuită idempotentă.
  -- Fără verificare de capacitate (bonus promis de owner).
  foreach d in array p_date_list loop
    insert into open_sesiuni (curs, data, capacitate)
    values (v_curs, d, v_cap)
    on conflict (curs, data) do nothing;

    select id into v_sesiune
    from open_sesiuni
    where curs = v_curs and data = d;

    select exists(
      select 1 from open_rezervari
      where sesiune = v_sesiune and client = v_client and status <> 'anulat'
    ) into v_exists;
    if v_exists then
      continue;
    end if;

    insert into open_rezervari (sesiune, client, enrollment, incasare, status, suma)
    values (v_sesiune, v_client, p_enrollment, null, 'platit', 0);
    v_created := v_created + 1;
  end loop;

  return v_created;
end;
$$;

grant execute on function rezerva_bonus_open(uuid, date[]) to authenticated;
