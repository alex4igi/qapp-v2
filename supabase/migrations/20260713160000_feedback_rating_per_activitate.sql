-- Rating pe activitate individuală (curs recurent, curs OPEN, eveniment).
-- Înainte: membrul evalua o CATEGORIE globală (curs_recurent/open/eveniment), fără legătură
-- la o activitate anume. Acum fiecare review e legat de un curs (feedback.cursul) sau un
-- eveniment (feedback.eveniment nou), ca staff-ul să vadă media pe fișa cursului / evenimentului.
-- /feedback rămâne doar pentru Sesizări (reviews nu se mai adună acolo).

alter table feedback
  add column if not exists eveniment uuid references evenimente(id) on delete set null;

-- Un singur review per (membru, curs) și per (membru, eveniment) — permite upsert & media curată.
create unique index if not exists uq_feedback_review_curs
  on feedback (autor, cursul) where tip = 'Review' and cursul is not null;
create unique index if not exists uq_feedback_review_eveniment
  on feedback (autor, eveniment) where tip = 'Review' and eveniment is not null;

-- Lista activităților evaluabile ale membrului + ratingul lui curent (dacă a lăsat deja unul).
create or replace function get_ratable_activities_client(p_client uuid)
returns table (kind text, id uuid, nume text, context text, rating integer, detalii text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_parinte() or p_client not in (select client_member_ids()) then
    raise exception 'forbidden';
  end if;

  return query
  with activitati as (
    -- cursuri recurente: înrolare nereziliată care acoperă azi
    select c.id as cid, c.numele as nume_a,
           case when coalesce(c.facultativ, false) then 'open' else 'curs_recurent' end as ctx
    from enrollments e
    join cursuri c on c.id = e.cursul
    where e.client = p_client
      and e.reziliat = false
      and e.data_incepere <= current_date
      and (e.data_final is null or e.data_final >= current_date)
    union
    -- cursuri OPEN: rezervări plătite
    select c.id, c.numele, 'open'
    from open_rezervari r
    join open_sesiuni s on s.id = r.sesiune
    join cursuri c on c.id = s.curs
    where r.client = p_client and r.status = 'platit'
  )
  select 'curs'::text, a.cid, a.nume_a, min(a.ctx), f.rating, f.detalii
  from activitati a
  left join feedback f
    on f.tip = 'Review' and f.autor = p_client and f.cursul = a.cid
  group by a.cid, a.nume_a, f.rating, f.detalii
  union all
  select 'eveniment'::text, ev.id, ev.nume_eveniment, 'eveniment', f.rating, f.detalii
  from evenimente ev
  left join feedback f
    on f.tip = 'Review' and f.autor = p_client and f.eveniment = ev.id
  where p_client = any(ev.participant)
    and (ev.data is null or ev.data <= current_date);
end;
$$;

grant execute on function get_ratable_activities_client(uuid) to authenticated;

-- Vechea semnătură (rating pe categorie) — o eliminăm ca să nu mai producă review-uri orfane.
drop function if exists submit_rating_client(uuid, text, integer, text);

-- Evaluare scopată pe o activitate anume (curs SAU eveniment), cu upsert (un rating/membru/activitate).
create or replace function submit_rating_client(
  p_client uuid,
  p_context text,
  p_rating integer,
  p_detalii text default null,
  p_curs uuid default null,
  p_eveniment uuid default null
)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_nume text;
  v_detalii text := nullif(btrim(p_detalii), '');
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
  if (p_curs is null) = (p_eveniment is null) then
    raise exception 'trebuie exact o activitate (curs sau eveniment)';
  end if;

  if p_curs is not null then
    if not exists (
      select 1 from enrollments e
      where e.client = p_client and e.cursul = p_curs and e.reziliat = false
      union all
      select 1 from open_rezervari r
      join open_sesiuni s on s.id = r.sesiune
      where r.client = p_client and s.curs = p_curs and r.status = 'platit'
    ) then
      raise exception 'curs neevaluabil';
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
    update feedback
      set rating = p_rating, detalii = v_detalii, context_achizitie = p_context,
          nume = v_nume, updated = now()
      where tip = 'Review' and autor = p_client and cursul = p_curs;
    if not found then
      insert into feedback (tip, autor, reprezentant, nume, rating, context_achizitie, detalii, cursul)
      values ('Review', p_client, current_familie(), v_nume, p_rating, p_context, v_detalii, p_curs);
    end if;
  else
    update feedback
      set rating = p_rating, detalii = v_detalii, context_achizitie = 'eveniment',
          nume = v_nume, updated = now()
      where tip = 'Review' and autor = p_client and eveniment = p_eveniment;
    if not found then
      insert into feedback (tip, autor, reprezentant, nume, rating, context_achizitie, detalii, eveniment)
      values ('Review', p_client, current_familie(), v_nume, p_rating, 'eveniment', v_detalii, p_eveniment);
    end if;
  end if;
end;
$$;

grant execute on function submit_rating_client(uuid, text, integer, text, uuid, uuid) to authenticated;
