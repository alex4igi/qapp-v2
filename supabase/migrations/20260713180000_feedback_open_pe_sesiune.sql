-- OPEN class: feedback-ul e pe SESIUNE (open_sesiuni), nu pe cursul-șablon.
-- Doar membrii cu rezervare la acea sesiune o pot evalua. Recurentele rămân pe curs,
-- evenimentele pe eveniment.

alter table feedback
  add column if not exists open_sesiune uuid references open_sesiuni(id) on delete set null;

create unique index if not exists uq_feedback_review_open_sesiune
  on feedback (autor, open_sesiune) where tip = 'Review' and open_sesiune is not null;

-- Lista activităților evaluabile: cursuri recurente (pe curs), sesiuni OPEN trecute
-- rezervate (pe sesiune), evenimente (pe eveniment) — cu ratingul curent al membrului.
create or replace function get_ratable_activities_client(p_client uuid)
returns table (kind text, id uuid, nume text, context text, rating integer, detalii text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_parinte() or p_client not in (select client_member_ids()) then
    raise exception 'forbidden';
  end if;

  return query
  -- cursuri recurente (nefacultative) → rating pe curs
  select 'curs'::text, c.id, c.numele, 'curs_recurent'::text, f.rating, f.detalii
  from enrollments e
  join cursuri c on c.id = e.cursul
  left join feedback f
    on f.tip = 'Review' and f.autor = p_client and f.cursul = c.id
  where e.client = p_client
    and e.reziliat = false
    and coalesce(c.facultativ, false) = false
    and e.data_incepere <= current_date
    and (e.data_final is null or e.data_final >= current_date)
  group by c.id, c.numele, f.rating, f.detalii
  union all
  -- sesiuni OPEN trecute, rezervate → rating pe sesiune
  select 'open_sesiune'::text, s.id,
         c.numele || ' · ' || to_char(s.data, 'DD.MM.YYYY'), 'open'::text,
         f.rating, f.detalii
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
  select 'eveniment'::text, ev.id, ev.nume_eveniment, 'eveniment'::text, f.rating, f.detalii
  from evenimente ev
  left join feedback f
    on f.tip = 'Review' and f.autor = p_client and f.eveniment = ev.id
  where p_client = any(ev.participant)
    and (ev.data is null or ev.data <= current_date);
end;
$$;

grant execute on function get_ratable_activities_client(uuid) to authenticated;

-- Semnătura veche (fără sesiune) — o eliminăm.
drop function if exists submit_rating_client(uuid, text, integer, text, uuid, uuid);

-- Evaluare scopată pe curs / sesiune OPEN / eveniment (exact una), cu upsert.
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

  if p_curs is not null then
    if not exists (
      select 1 from enrollments e
      where e.client = p_client and e.cursul = p_curs and e.reziliat = false
    ) then
      raise exception 'curs neevaluabil';
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

grant execute on function submit_rating_client(uuid, text, integer, text, uuid, uuid, uuid) to authenticated;
