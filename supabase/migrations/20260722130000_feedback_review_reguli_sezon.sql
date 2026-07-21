-- Reguli de eligibilitate pentru review-ul membrului despre o grupă (feedback tip='Review').
--
-- Pana acum: orice inrolare nereziliata care acoperea ziua curenta dadea drept de vot,
-- iar `submit_rating_client` nu verifica deloc datele — cine apela RPC-ul direct putea
-- vota pe un curs facut acum doi ani. In plus votul era editabil la nesfarsit, deci
-- concluziile trase la finalul sezonului se puteau schimba sub noi.
--
-- Trei reguli noi:
--   1. minim 3 luni ACHITATE CONSECUTIV la acea grupa (luna in curs se numara);
--   2. votul se ingheata cand sezonul se incheie — pe parcurs poate fi schimbat;
--   3. comentariul devine obligatoriu la 1-3 stele (la 4-5 ramane optional).
--
-- Nu e nevoie de `sezon_id` pe feedback: `cursuri` se CLONEAZA per sezon (clone_sezon
-- insereaza randuri noi, legate prin `cursul_original`), deci un rand `cursuri` apartine
-- unui singur sezon si indexul unic existent `uq_feedback_review_curs (autor, cursul)`
-- inseamna deja „un review per grupa per sezon".
--
-- Regulile se aplica DOAR cursurilor recurente. Sesiunile OPEN si evenimentele raman
-- neschimbate — acolo participarea e punctuala, vechimea n-are sens.

-- Cea mai lunga serie de luni consecutive ACHITATE la o grupa.
--
-- Randurile de inrolare se genereaza in avans pentru tot sezonul, deci fara
-- `data_incepere <= current_date` orice inscris nou ar avea instant 10 luni.
-- `Per an` = un singur rand pe tot sezonul, expandat aici in luni ca sa nu fie penalizat.
-- Achitat = `rest <= 0`, predicatul canonic din `plati_inrolari` — nu `= 0`, pentru ca
-- supraplata (credit din ajustari de pret / conversii) inseamna tot „achitat", si nu
-- „exista incasare", pentru ca lunile legitim 0 lei (voucher 100%, prorata 0 sedinte)
-- n-au niciun rand in `incasari`.
create or replace function _luni_achitate_curs(p_client uuid, p_curs uuid)
returns integer
language sql stable security definer set search_path = public as $$
  with luni as (
    select distinct g.luna::date as luna
    from enrollments e
    cross join lateral generate_series(
      date_trunc('month', e.data_incepere),
      date_trunc('month', least(coalesce(e.data_final, current_date), current_date)),
      interval '1 month'
    ) as g(luna)
    where e.client = p_client
      and e.cursul = p_curs
      and e.reziliat = false
      and e.data_incepere <= current_date
      and coalesce(e.suma, 0)
          - coalesce((select sum(i.suma) from incasari i where i.inregistrare = e.id), 0) <= 0
  ),
  serii as (
    -- luni consecutive => (index absolut al lunii - row_number) e constant
    select (extract(year from luna) * 12 + extract(month from luna))
             - row_number() over (order by luna) as serie
    from luni
  )
  select coalesce(max(cnt), 0)::integer
  from (select count(*) as cnt from serii group by serie) t;
$$;

revoke execute on function _luni_achitate_curs(uuid, uuid) from anon, public;

-- Sezonul grupei s-a incheiat => votul e fixat.
-- Curs fara sezon (anomalie de date: `cursuri.sezon` e nullable, iar FK-ul e
-- `on delete set null`) => null => false, adica ramane editabil. Fail-open deliberat:
-- a bloca pe baza unei date lipsa ar ascunde un review legitim.
create or replace function _sezon_curs_inchis(p_curs uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(s.stare = 'arhivat' or s.data_final < current_date, false)
  from cursuri c
  left join sezoane s on s.id = c.sezon
  where c.id = p_curs;
$$;

revoke execute on function _sezon_curs_inchis(uuid) from anon, public;

-- Tipul returnat se schimba (3 coloane noi) => drop, nu replace.
drop function if exists get_ratable_activities_client(uuid);

create or replace function get_ratable_activities_client(p_client uuid)
returns table (
  kind text,
  id uuid,
  nume text,
  context text,
  rating integer,
  detalii text,
  poate_evalua boolean,
  luni_achitate integer,
  blocat boolean
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_parinte() or p_client not in (select client_member_ids()) then
    raise exception 'forbidden';
  end if;

  return query
  -- cursuri recurente (nefacultative) → rating pe curs
  -- Randurile sub prag se intorc totusi, cu poate_evalua=false, ca portalul sa poata
  -- arata progresul („mai ai nevoie de N luni") in loc sa ascunda grupa fara explicatie.
  select 'curs'::text, x.id, x.numele, 'curs_recurent'::text, f.rating, f.detalii,
         (x.luni >= 3 and not x.inchis), x.luni, x.inchis
  from (
    select distinct c.id, c.numele,
           _luni_achitate_curs(p_client, c.id) as luni,
           _sezon_curs_inchis(c.id) as inchis
    from enrollments e
    join cursuri c on c.id = e.cursul
    where e.client = p_client
      and e.reziliat = false
      and coalesce(c.facultativ, false) = false
      and e.data_incepere <= current_date
      and (e.data_final is null or e.data_final >= current_date)
  ) x
  left join feedback f
    on f.tip = 'Review' and f.autor = p_client and f.cursul = x.id
  union all
  -- sesiuni OPEN trecute, rezervate → rating pe sesiune
  select 'open_sesiune'::text, s.id,
         c.numele || ' · ' || to_char(s.data, 'DD.MM.YYYY'), 'open'::text,
         f.rating, f.detalii, true, null::integer, false
  from open_rezervari r
  join open_sesiuni s on s.id = r.sesiune
  join cursuri c on c.id = s.curs
  left join feedback f
    on f.tip = 'Review' and f.autor = p_client and f.open_sesiune = s.id
  where r.client = p_client
    and r.status <> 'anulat'
    and s.status <> 'anulata'
    and s.data <= current_date
  union all
  -- evenimente (participant) → rating pe eveniment
  select 'eveniment'::text, ev.id, ev.nume_eveniment, 'eveniment'::text,
         f.rating, f.detalii, true, null::integer, false
  from evenimente ev
  left join feedback f
    on f.tip = 'Review' and f.autor = p_client and f.eveniment = ev.id
  where p_client = any(ev.participant)
    and (ev.data is null or ev.data <= current_date);
end;
$$;

revoke execute on function get_ratable_activities_client(uuid) from anon, public;
grant execute on function get_ratable_activities_client(uuid) to authenticated;

-- Aceleasi verificari ca la citire — inainte lipseau complet aici, deci un apel direct
-- la RPC ocolea eligibilitatea afisata in UI.
create or replace function submit_rating_client(
  p_client uuid,
  p_context text,
  p_rating integer,
  p_detalii text default null,
  p_curs uuid default null,
  p_eveniment uuid default null,
  p_sesiune uuid default null
)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_nume text;
  v_detalii text := nullif(btrim(p_detalii), '');
  v_targets int := (p_curs is not null)::int + (p_eveniment is not null)::int + (p_sesiune is not null)::int;
  v_luni integer;
begin
  if not is_parinte() or p_client not in (select client_member_ids()) then
    raise exception 'forbidden';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'rating invalid';
  end if;
  if p_context not in ('curs_recurent', 'open', 'eveniment') then
    raise exception 'context invalid';
  end if;
  if v_targets <> 1 then
    raise exception 'trebuie exact o activitate (curs, sesiune sau eveniment)';
  end if;

  -- Nota mica fara explicatie nu e actionabila pentru instructor.
  if p_rating <= 3 and (v_detalii is null or length(v_detalii) < 10) then
    raise exception 'la 3 stele sau mai putin, comentariul e obligatoriu (minim 10 caractere)';
  end if;

  if p_curs is not null then
    if not exists (
      select 1 from enrollments e
      where e.client = p_client and e.cursul = p_curs and e.reziliat = false
    ) then
      raise exception 'curs neevaluabil';
    end if;

    v_luni := _luni_achitate_curs(p_client, p_curs);
    if v_luni < 3 then
      raise exception 'ai nevoie de minim 3 luni achitate consecutiv la aceasta grupa (ai %)', v_luni;
    end if;

    if _sezon_curs_inchis(p_curs) then
      raise exception 'sezonul s-a incheiat; evaluarea ramane fixata';
    end if;
  elsif p_sesiune is not null then
    if not exists (
      select 1 from open_rezervari r
      where r.client = p_client and r.sesiune = p_sesiune and r.status <> 'anulat'
    ) then
      raise exception 'sesiune neevaluabilă';
    end if;
  else
    if not exists (
      select 1 from evenimente ev where ev.id = p_eveniment and p_client = any(ev.participant)
    ) then
      raise exception 'eveniment neevaluabil';
    end if;
  end if;

  select nume || coalesce(' ' || prenume, '') into v_nume from clienti where id = p_client;

  if p_curs is not null then
    update feedback set rating = p_rating, detalii = v_detalii, context_achizitie = p_context,
                        nume = v_nume, updated = now()
      where tip = 'Review' and autor = p_client and cursul = p_curs;
    if not found then
      insert into feedback (tip, autor, reprezentant, nume, rating, context_achizitie, detalii, cursul)
      values ('Review', p_client, current_familie(), v_nume, p_rating, p_context, v_detalii, p_curs);
    end if;
  elsif p_sesiune is not null then
    update feedback set rating = p_rating, detalii = v_detalii, context_achizitie = 'open',
                        nume = v_nume, updated = now()
      where tip = 'Review' and autor = p_client and open_sesiune = p_sesiune;
    if not found then
      insert into feedback (tip, autor, reprezentant, nume, rating, context_achizitie, detalii, open_sesiune)
      values ('Review', p_client, current_familie(), v_nume, p_rating, 'open', v_detalii, p_sesiune);
    end if;
  else
    update feedback set rating = p_rating, detalii = v_detalii, context_achizitie = 'eveniment',
                        nume = v_nume, updated = now()
      where tip = 'Review' and autor = p_client and eveniment = p_eveniment;
    if not found then
      insert into feedback (tip, autor, reprezentant, nume, rating, context_achizitie, detalii, eveniment)
      values ('Review', p_client, current_familie(), v_nume, p_rating, 'eveniment', v_detalii, p_eveniment);
    end if;
  end if;
end;
$$;

revoke execute on function submit_rating_client(uuid, text, integer, text, uuid, uuid, uuid) from anon, public;
grant execute on function submit_rating_client(uuid, text, integer, text, uuid, uuid, uuid) to authenticated;

-- `_luni_achitate_curs` filtreaza pe (client, cursul); indexurile existente sunt separate.
create index if not exists idx_enrollments_client_curs on enrollments(client, cursul);
