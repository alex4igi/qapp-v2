-- Facultative: abonatul lunii nu plătește în plus ședința la aceeași grupă, iar un abonament nu se pune peste
-- ședințe deja plătite în luna lui (pentru asta există conversia „Abonează": ședințele devin avans).
-- Până acum garda stătea doar în formular și nu prindea două recepții simultane; 7 perechi plătite de două ori
-- din iulie încoace (Alex, 05.10: se ignoră).
--
-- Trigger de constrângere AMÂNAT: verifică starea de la finalul tranzacției. Ambele conversii
-- (converteste_sedinte_in_abonament / converteste_abonament_in_sedinte) inserează rândul nou înainte să-l
-- anuleze pe cel vechi — la commit perechea nu mai există, deci trec fără excepții speciale.
-- Lacătul pe (client, curs) serializează două tranzacții simultane: a doua citește după commitul primei.
--
-- Apelurile service_role (IPN Netopia, cron) nu sunt oprite: confirm_netopia_payment creează ședința DUPĂ ce
-- banii au fost luați — un refuz acolo ar pierde plata. Portalul e oprit înainte de plată, în hold_loc_open.

create or replace function _garda_abonament_sedinta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_e enrollments%rowtype;
begin
  if coalesce((select current_setting('request.jwt.claims', true))::jsonb ->> 'role', '') = 'service_role' then
    return null;
  end if;

  select * into v_e from enrollments where id = new.id;
  if not found or v_e.reziliat or coalesce(v_e.suma_baza, 0) <= 0
     or v_e.client is null or v_e.data_incepere is null then
    return null;
  end if;
  if not exists (select 1 from cursuri c where c.id = v_e.cursul and coalesce(c.facultativ, false)) then
    return null;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('abonament_sedinta:' || v_e.client || ':' || v_e.cursul, 0));

  if v_e.tip_plata = 'Per sedinta' then
    if exists (
      select 1 from enrollments a
      where a.client = v_e.client and a.cursul = v_e.cursul and a.id <> v_e.id
        and a.tip_plata <> 'Per sedinta' and not a.reziliat and coalesce(a.suma_baza, 0) > 0
        and a.data_incepere <= v_e.data_incepere
        and (a.data_final is null or a.data_final >= v_e.data_incepere)
    ) then
      raise exception 'Cursantul are deja abonament pe luna aceasta la grupă — ședința din % e inclusă, nu se plătește separat.',
        to_char(v_e.data_incepere, 'DD.MM.YYYY')
        using errcode = '23514';
    end if;
  else
    if exists (
      select 1 from enrollments s
      where s.client = v_e.client and s.cursul = v_e.cursul and s.id <> v_e.id
        and s.tip_plata = 'Per sedinta' and not s.reziliat and coalesce(s.suma_baza, 0) > 0
        and s.data_incepere >= v_e.data_incepere
        and (v_e.data_final is null or s.data_incepere <= v_e.data_final)
    ) then
      raise exception 'Cursantul are deja ședințe plătite în luna aceasta la grupă. Folosește „Abonează” — ședințele plătite devin avans pe abonament.'
        using errcode = '23514';
    end if;
  end if;

  return null;
end;
$$;

revoke execute on function _garda_abonament_sedinta() from public, anon, authenticated;

drop trigger if exists trg_garda_abonament_sedinta on enrollments;
create constraint trigger trg_garda_abonament_sedinta
  after insert on enrollments
  deferrable initially deferred
  for each row
  when (new.reziliat = false)
  execute function _garda_abonament_sedinta();

-- Portalul: refuz înainte de plată (definiția live din 13.09 + mesajele din 03.10, plus garda nouă).
create or replace function public.hold_loc_open(p_client uuid, p_sesiune uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_cap     integer;
  v_status  text;
  v_curs    uuid;
  v_data    date;
  v_count   integer;
  v_pret    numeric;
  v_rez     uuid;
begin
  -- authz: doar conturi parinte, doar pentru membrii propriei familii
  if not is_parinte() then
    raise exception 'Rezervarea online se face din contul de portal al familiei.';
  end if;
  if p_client not in (select client_member_ids()) then
    raise exception 'Cursantul ales nu mai apare în familia contului tău. Reîncarcă pagina și alege-l din nou din partea de sus a ecranului; dacă lipsește, scrie-ne la office@quasardance.ro.';
  end if;

  -- blochează rândul sesiunii → serializează rezervările concurente
  select s.capacitate, s.status, s.curs, s.data::date into v_cap, v_status, v_curs, v_data
  from open_sesiuni s where s.id = p_sesiune for update;
  if not found then
    raise exception 'Ședința nu mai este în program. Reîncarcă pagina și alege altă dată.';
  end if;
  if v_status = 'anulata' then
    raise exception 'Ședința a fost anulată. Alege altă dată din listă.';
  end if;
  -- Aceeași regulă ca list_open_sesiuni_client: din portal nu se rezervă o
  -- sesiune pe o zi în care grupa nu se ține (sesiune-fantomă).
  if not exists (
    select 1 from cursuri c
     where c.id = v_curs
       and (array['Duminica','Luni','Marti','Miercuri','Joi','Vineri','Sambata']::zi_saptamana[])[extract(dow from v_data)::int + 1] = any (coalesce(c.zile, '{}'))
  ) then
    raise exception 'Grupa nu se mai ține în ziua acestei ședințe. Reîncarcă pagina și alege altă dată.';
  end if;

  -- preț din curs + validare facultativ + bifa de rezervări online
  select c.pret_sedinta into v_pret
  from cursuri c
  where c.id = v_curs
    and coalesce(c.facultativ, false)
    and coalesce(c.rezervari_online, false);
  if not found then
    raise exception 'Acest curs nu se rezervă online. Pentru un loc, sună la recepția locației.';
  end if;
  -- Grupa suspendată în luna sesiunii nu mai poate fi rezervată din portal.
  if not curs_activ_in_luna(v_curs, (select s.data::date from open_sesiuni s where s.id = p_sesiune)) then
    raise exception 'Grupa nu are ședințe în luna aceasta (e suspendată). Alege o ședință din altă lună sau altă grupă.';
  end if;
  if v_pret is null or v_pret <= 0 then
    raise exception 'Ședința nu are încă preț stabilit, deci nu se poate plăti online. Sună la recepție pentru rezervare.';
  end if;

  -- abonatul lunii are deja ședința inclusă — fără plată în plus
  if exists (
    select 1 from enrollments e
    where e.client = p_client and e.cursul = v_curs
      and e.tip_plata <> 'Per sedinta' and not e.reziliat and coalesce(e.suma_baza, 0) > 0
      and e.data_incepere <= v_data
      and (e.data_final is null or e.data_final >= v_data)
  ) then
    raise exception 'Ai abonament pe luna aceasta la grupă, deci ședința e deja inclusă — nu trebuie rezervată sau plătită separat.';
  end if;

  -- reutilizează un hold viu existent (retry după abandon la Netopia) → nu dubla (23505)
  select id, status into v_rez, v_status
  from open_rezervari
  where sesiune = p_sesiune and client = p_client and status <> 'anulat'
  limit 1;
  if found then
    if v_status = 'platit' then
      raise exception 'Ai deja o rezervare plătită pentru această ședință — e marcată pe cardul ședinței, în Rezervări, și apare în Plăți. Pentru alt copil, schimbă membrul din partea de sus a ecranului.';
    end if;
    -- 'rezervat': locul e deja al lui → reia hold-ul, resetează fereastra de expirare
    update open_rezervari set created = now() where id = v_rez;
    return jsonb_build_object('rezervare_id', v_rez, 'amount', v_pret);
  end if;

  -- capacitate strictă: rezervări vii ∪ abonați activi (formula din list_open_sesiuni_client)
  select count(*) into v_count from (
    select r.client from open_rezervari r
    where r.sesiune = p_sesiune and r.status <> 'anulat'
    union
    select e.client from enrollments e
    where e.cursul = v_curs
      and e.client is not null
      and e.reziliat = false
      and e.tip_plata in ('Per luna', 'Per an')
      and e.data_incepere <= v_data
      and (e.data_final is null or e.data_final >= v_data)
  ) occupants;
  if v_count >= v_cap then
    raise exception 'Ședința e completă (% / % locuri). Alege altă dată din listă.', v_count, v_cap;
  end if;

  -- creează HOLD fără bani. uq_open_rez_client_active prinde dublarea (23505).
  insert into open_rezervari (sesiune, client, status, suma)
  values (p_sesiune, p_client, 'rezervat', v_pret)
  returning id into v_rez;

  return jsonb_build_object('rezervare_id', v_rez, 'amount', v_pret);
end;
$function$;

revoke execute on function public.hold_loc_open(uuid, uuid) from anon, public;
grant execute on function public.hold_loc_open(uuid, uuid) to authenticated, service_role;
