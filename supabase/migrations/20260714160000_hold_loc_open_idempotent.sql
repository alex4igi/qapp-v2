-- hold_loc_open — idempotent pe hold viu.
--
-- Bug: dacă un membru pornea plata unei sesiuni OPEN, era redirecționat la Netopia
-- și abandona (fără să plătească), hold-ul 'rezervat' rămânea până la sweep-ul cronului
-- (`expire_open_holds`, ~30 min). Un retry în fereastra aceea făcea un INSERT nou care
-- lovea indexul unic parțial `uq_open_rez_client_active` → 23505 → edge function 400 →
-- portalul afișa doar „Edge Function returned a non-2xx status code".
--
-- Fix: dacă există deja un hold viu (status <> 'anulat') pentru (client, sesiune), îl
-- reutilizăm în loc să dublăm: 'platit' → mesaj clar (deja plătit); 'rezervat' → reluăm
-- hold-ul și resetăm fereastra de expirare. Restul (capacitate + INSERT) rămâne pentru
-- cazul „niciun hold viu".
create or replace function hold_loc_open(p_client uuid, p_sesiune uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
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
    raise exception 'forbidden';
  end if;
  if p_client not in (select client_member_ids()) then
    raise exception 'forbidden: clientul nu aparține familiei contului';
  end if;

  -- blochează rândul sesiunii → serializează rezervările concurente
  select s.capacitate, s.status, s.curs, s.data::date into v_cap, v_status, v_curs, v_data
  from open_sesiuni s where s.id = p_sesiune for update;
  if not found then
    raise exception 'Sesiunea nu există.';
  end if;
  if v_status = 'anulata' then
    raise exception 'Sesiunea este anulată.';
  end if;

  -- preț din curs + validare facultativ + bifa de rezervări online
  select c.pret_sedinta into v_pret
  from cursuri c
  where c.id = v_curs
    and coalesce(c.facultativ, false)
    and coalesce(c.rezervari_online, false);
  if not found then
    raise exception 'Cursul nu permite rezervări online.';
  end if;
  if v_pret is null or v_pret <= 0 then
    raise exception 'Sesiunea nu are un preț valid.';
  end if;

  -- reutilizează un hold viu existent (retry după abandon la Netopia) → nu dubla (23505)
  select id, status into v_rez, v_status
  from open_rezervari
  where sesiune = p_sesiune and client = p_client and status <> 'anulat'
  limit 1;
  if found then
    if v_status = 'platit' then
      raise exception 'Ai deja o rezervare plătită pentru această sesiune.';
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
    raise exception 'Sesiune completă (% / %). Nu mai sunt locuri.', v_count, v_cap;
  end if;

  -- creează HOLD fără bani. uq_open_rez_client_active prinde dublarea (23505).
  insert into open_rezervari (sesiune, client, status, suma)
  values (p_sesiune, p_client, 'rezervat', v_pret)
  returning id into v_rez;

  return jsonb_build_object('rezervare_id', v_rez, 'amount', v_pret);
end;
$$;

revoke all on function hold_loc_open(uuid, uuid) from public;
grant execute on function hold_loc_open(uuid, uuid) to authenticated;
