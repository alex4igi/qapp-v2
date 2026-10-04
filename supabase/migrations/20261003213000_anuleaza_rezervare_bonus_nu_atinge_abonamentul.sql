-- Anularea unei rezervări OPEN dezactiva înrolarea legată, oricare ar fi ea. La o
-- înrolare „Per sedinta" e corect: înrolarea ESTE ședința (1 rezervare ↔ 1 înrolare,
-- 1.273 de cazuri, niciunul cu două). Dar rezerva_bonus_open (promo iulie 2026) leagă
-- ședințele gratuite din 29–30 iunie de abonamentul „Per luna" de iulie; butonul
-- „Anulează" din tabul OPEN al cursului ar fi scos tot abonamentul din roster și
-- datorii. Acum anularea unei rezervări bonus atinge doar rezervarea.

create or replace function public.anuleaza_rezervare_open(p_rezervare uuid, p_motiv text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r open_rezervari%rowtype;
begin
  if auth_role() not in ('admin', 'owner', 'manager', 'front_desk') then
    raise exception 'Doar recepția și managerii pot anula rezervări OPEN.';
  end if;

  select * into r from open_rezervari where id = p_rezervare for update;
  if not found then
    raise exception 'Rezervarea nu există.';
  end if;
  if r.status = 'anulat' then
    return;
  end if;

  update open_rezervari
  set status = 'anulat', anulat_at = now(), anulat_motiv = p_motiv
  where id = p_rezervare;

  -- scoate înrolarea din roster / datorii; incasari rămâne intact
  if r.enrollment is not null then
    update enrollments set activ = false
     where id = r.enrollment and tip_plata = 'Per sedinta';
  end if;
end;
$$;
