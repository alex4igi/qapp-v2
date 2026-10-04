-- Portal / Rezervări: cardul ședinței știe dacă membrul activ are deja loc, iar întoarcerea
-- de la Netopia spune rezultatul comenzii, nu doar „plata a fost inițiată".
--
-- Cazul din 4 oct. 2026 (Alexandru Simiuc): după plată, cardul arăta tot „Rezervă" și omul
-- nu avea unde să vadă că rezervarea a mers.

-- 1) list_open_sesiuni_client primește p_client și întoarce starea rezervării lui
--    ('rezervat' = plata în curs, 'platit'). Ședința rezervată rămâne în listă și când e plină.
--    p_client contează doar dacă e în familia contului (client_member_ids); altfel e ignorat.
drop function if exists public.list_open_sesiuni_client(uuid);

create function public.list_open_sesiuni_client(p_locatie uuid default null, p_client uuid default null)
 returns table(sesiune_id uuid, curs_id uuid, curs_nume text, data date, locuri_ramase integer,
               capacitate integer, pret numeric, instructor_nume text, rezervare_status text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with membru as (
    select p_client as id where p_client in (select client_member_ids())
  )
  select s.id, c.id, c.numele, s.data::date,
         greatest(s.capacitate - occ.n, 0)::integer,
         s.capacitate,
         c.pret_sedinta,
         coalesce(t.nume, s.instructor_manual),
         rez.status::text
  from open_sesiuni s
  join cursuri c on c.id = s.curs
    and coalesce(c.facultativ, false)
    and coalesce(c.rezervari_online, false)
    -- Grupa suspendată nu se mai vinde. Verificarea e pe DATA sesiunii, nu pe
    -- „acum": o sesiune dintr-o lună dinaintea opririi rămâne validă.
    and curs_activ_in_luna(c.id, s.data::date)
    -- Doar zilele din orar: o sesiune-fantomă (dată greșită la recepție) nu se
    -- vinde online. Asumat: o ședință reprogramată pe altă zi nu apare în portal.
    and (array['Duminica','Luni','Marti','Miercuri','Joi','Vineri','Sambata']::zi_saptamana[])[extract(dow from s.data)::int + 1] = any (coalesce(c.zile, '{}'))
  left join teacheri t on t.id = s.instructor
  cross join lateral (
    select count(*) as n from (
      select r.client from open_rezervari r
      where r.sesiune = s.id and r.status <> 'anulat'
      union
      select e.client from enrollments e
      where e.cursul = c.id
        and e.client is not null
        and e.reziliat = false
        and e.tip_plata in ('Per luna', 'Per an')
        and e.data_incepere <= s.data::date
        and (e.data_final is null or e.data_final >= s.data::date)
    ) occupants
  ) occ
  left join lateral (
    select r.status from open_rezervari r
    where r.sesiune = s.id and r.client = (select id from membru) and r.status <> 'anulat'
    limit 1
  ) rez on true
  where s.data >= current_date
    and s.status <> 'anulata'
    and (p_locatie is null or c.locatie = p_locatie)
    and ((s.capacitate - occ.n) > 0 or rez.status is not null)
  order by s.data asc;
$function$;

revoke execute on function public.list_open_sesiuni_client(uuid, uuid) from anon, public;
grant execute on function public.list_open_sesiuni_client(uuid, uuid) to authenticated, service_role;

-- 2) Rezultatul unei comenzi Netopia, pentru pagina pe care se întoarce omul.
--    Scopat pe familia contului: o comandă străină răspunde null, ca una inexistentă.
create or replace function public.portal_status_comanda(p_order_ref text)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select jsonb_build_object(
    'status', o.status,
    'order_type', o.order_type,
    'rezervare_status', r.status::text,
    'curs_nume', c.numele,
    'data', s.data::date
  )
  from netopia_orders o
  left join open_rezervari r on r.id = o.rezervare_id
  left join open_sesiuni s on s.id = r.sesiune
  left join cursuri c on c.id = s.curs
  where o.order_ref = p_order_ref
    and (o.client_id in (select client_member_ids()) or o.auth_user_id = auth.uid());
$function$;

revoke execute on function public.portal_status_comanda(text) from anon, public;
grant execute on function public.portal_status_comanda(text) to authenticated, service_role;

-- 3) Mesajul de dublură trimitea la un „Calendar" care nu există în portal.
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
