-- #49 Evaluare experiență — rating 5 stele dat de client din portal, per tip de achiziție
-- (curs recurent / OPEN class / eveniment). Reutilizăm tabelul `feedback` (tip='Review'),
-- adăugând rating + contextul achiziției. Staff-ul le vede în /feedback ca review-uri.

alter table feedback add column if not exists rating integer
  check (rating is null or rating between 1 and 5);
alter table feedback add column if not exists context_achizitie text
  check (context_achizitie is null or context_achizitie in ('curs_recurent', 'open', 'eveniment'));

-- RPC client-facing: inserează un review scopat la membrul familiei contului.
create or replace function submit_rating_client(
  p_client uuid,
  p_context text,
  p_rating integer,
  p_detalii text default null
)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_nume text;
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

  select nume || coalesce(' ' || prenume, '') into v_nume from clienti where id = p_client;

  insert into feedback (tip, autor, reprezentant, nume, rating, context_achizitie, detalii)
  values ('Review', p_client, current_familie(), v_nume, p_rating, p_context, nullif(btrim(p_detalii), ''));
end;
$$;

grant execute on function submit_rating_client(uuid, text, integer, text) to authenticated;
