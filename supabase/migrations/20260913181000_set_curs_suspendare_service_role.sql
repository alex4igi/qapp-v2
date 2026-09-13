-- Garda din set_curs_suspendare bloca `service_role`: `auth_role()` cade pe
-- `front_desk` pentru requesturile fără rol de utilizator, deci scripturile de
-- verificare și orice job de întreținere se loveau de ea. Aceeași excepție ca în
-- calculeaza_salariu_teacher. Restul funcției e neschimbat față de 20260913180000.

create or replace function set_curs_suspendare(
  p_curs     uuid,
  p_suspenda boolean,
  p_din_luna date,
  p_motiv    text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_luna     date := date_trunc('month', p_din_luna)::date;
  v_acum     date := date_trunc('month', current_date)::date;
  v_deschisa cursuri_suspendari;
  v_curs     cursuri;
  v_locatie  uuid;
  v_motiv    text := nullif(btrim(coalesce(p_motiv, '')), '');
begin
  -- `service_role` rămâne permis, ca la calculeaza_salariu_teacher: cheia de
  -- serviciu e oricum god-mode (poate scrie direct în `cursuri`), iar scripturile
  -- de verificare din scripts/ o folosesc. `auth_role()` cade pe `front_desk`
  -- pentru requesturile fără rol, deci fără excepția asta scriptul se lovea de gard.
  if not (
    (select auth_role()) in ('owner', 'admin', 'manager')
    or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
  ) then
    raise exception 'Doar managerii pot suspenda sau re-activa cursuri.'
      using errcode = '42501';
  end if;

  select * into v_curs from cursuri where id = p_curs;
  if not found then
    raise exception 'Cursul nu există.' using errcode = 'QD404';
  end if;

  select * into v_deschisa
  from cursuri_suspendari
  where curs = p_curs and pana_luna is null;

  if p_suspenda then
    if v_motiv is null then
      raise exception 'Motivul e obligatoriu la suspendare.' using errcode = 'QD400';
    end if;
    if found then
      raise exception 'Cursul e deja suspendat din %.',
        to_char(v_deschisa.din_luna, 'YYYY-MM') using errcode = 'QD409';
    end if;
    insert into cursuri_suspendari (curs, din_luna, motiv, suspendat_de)
    values (p_curs, v_luna, v_motiv, auth.uid());
  else
    if not found then
      raise exception 'Cursul nu e suspendat.' using errcode = 'QD409';
    end if;
    -- Re-activarea din luna suspendării (sau dinainte) ar anula suspendarea, nu ar
    -- încheia-o: intervalul ar fi gol sau negativ.
    if v_luna <= v_deschisa.din_luna then
      raise exception 'Re-activarea trebuie să fie dintr-o lună de după suspendare (%).',
        to_char(v_deschisa.din_luna, 'YYYY-MM') using errcode = 'QD400';
    end if;
    update cursuri_suspendari
       set pana_luna = v_luna,
           motiv_reactivare = v_motiv,
           reactivat_de = auth.uid(),
           reactivat_la = now()
     where id = v_deschisa.id;
  end if;

  -- Flagul urmărește LUNA CURENTĂ, nu luna aleasă: o suspendare programată din
  -- noiembrie lasă grupa activă până atunci (cronul o preia la 1 noiembrie).
  update cursuri
     set suspendat = not curs_activ_in_luna(p_curs, v_acum),
         updated = now()
   where id = p_curs;

  if v_curs.sala is not null then
    select locatie into v_locatie from sali where id = v_curs.sala;
  end if;
  v_locatie := coalesce(v_curs.locatie, v_locatie);

  perform audit_log_record(
    'curs_archived',
    'curs',
    p_curs,
    jsonb_build_object('suspendat', v_curs.suspendat),
    jsonb_build_object(
      'suspendat', p_suspenda,
      'din_luna', to_char(v_luna, 'YYYY-MM')
    ),
    coalesce(v_motiv, case when p_suspenda then null else 'Re-activat' end),
    v_locatie
  );
end;
$$;

revoke execute on function set_curs_suspendare(uuid, boolean, date, text) from anon, public;
grant execute on function set_curs_suspendare(uuid, boolean, date, text) to authenticated;
