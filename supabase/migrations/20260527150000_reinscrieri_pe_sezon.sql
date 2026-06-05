-- Qapp v2 — Reînscriere pe sezon țintă (în plus față de activate_reinscriere clasic).
--
-- Flow nou: pagina /reinscrieri afișează cursurile dintr-un sezon `planificat`.
-- La butonul „Activează" se invocă activate_reinscriere_pe_sezon(client, curs_țintă):
--   - dacă există deja înrolare la (client, curs_țintă, reziliat=false): UPDATE promo + este_reinscriere=true
--   - dacă nu există: CREATE înrolare nouă cu data sezonului, tip_plata=lunar, suma=pret_lunar_promo
--
-- Cursul țintă trebuie să fie clonat (cursul_original setat) și să aibă pret_lunar_promo.

create or replace function activate_reinscriere_pe_sezon(
  p_client_id uuid,
  p_curs_tinta_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_promo numeric;
  v_sezon_id uuid;
  v_sezon_start date;
  v_sezon_end date;
  v_existing_id uuid;
  v_count int := 0;
begin
  select pret_lunar_promo, sezon
    into v_promo, v_sezon_id
  from cursuri
  where id = p_curs_tinta_id;

  if v_promo is null then
    raise exception 'Cursul țintă nu are preț promo configurat (pret_lunar_promo).';
  end if;
  if v_sezon_id is null then
    raise exception 'Cursul țintă nu este asociat unui sezon.';
  end if;

  select data_incepere, data_final
    into v_sezon_start, v_sezon_end
  from sezoane
  where id = v_sezon_id;

  -- Caută înrolare existentă pe sezonul țintă
  select id into v_existing_id
  from enrollments
  where client = p_client_id
    and cursul = p_curs_tinta_id
    and sezon_id = v_sezon_id
    and reziliat = false
  order by created desc
  limit 1;

  if v_existing_id is not null then
    update enrollments
    set suma = v_promo,
        este_reinscriere = true,
        activ = true,
        updated = now()
    where id = v_existing_id;
    v_count := 1;
  else
    insert into enrollments (
      client, cursul, sezon_id, tip_plata, suma,
      data_incepere, data_final, activ, este_reinscriere
    )
    values (
      p_client_id, p_curs_tinta_id, v_sezon_id, 'lunar', v_promo,
      v_sezon_start, v_sezon_end, true, true
    );
    v_count := 1;
  end if;

  return v_count;
end;
$$;

grant execute on function activate_reinscriere_pe_sezon(uuid, uuid) to authenticated;

-- RPC helper: pentru un curs țintă, listează clienții eligibili (activi pe cursul_original)
-- cu starea reînscrierii (deja activată sau nu).
create or replace function list_reinscrieri_clienti(p_curs_tinta_id uuid)
returns table (
  client_id     uuid,
  nume          text,
  prenume       text,
  telefon       text,
  email         text,
  activata      boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with target as (
    select id, sezon, cursul_original
    from cursuri
    where id = p_curs_tinta_id
  ),
  eligibili as (
    select distinct e.client
    from enrollments e
    join target t on e.cursul = t.cursul_original
    where t.cursul_original is not null
      and e.activ = true
      and e.reziliat = false
      and (e.data_incepere is null or e.data_incepere <= current_date)
      and (e.data_final is null or e.data_final >= current_date)
  ),
  activate as (
    select distinct e.client
    from enrollments e, target t
    where e.cursul = t.id
      and e.sezon_id = t.sezon
      and e.este_reinscriere = true
      and e.reziliat = false
  )
  select
    c.id,
    c.nume,
    c.prenume,
    c.telefon,
    c.email,
    (a.client is not null) as activata
  from eligibili el
  join clienti c on c.id = el.client
  left join activate a on a.client = el.client
  order by c.nume, c.prenume;
$$;

grant execute on function list_reinscrieri_clienti(uuid) to authenticated;
