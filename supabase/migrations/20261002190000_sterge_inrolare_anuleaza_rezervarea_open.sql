-- Ștergerea unei înrolări OPEN lăsa rezervarea vie: FK open_rezervari.enrollment
-- e ON DELETE SET NULL, iar rândul rămânea `platit`, fără înrolare. Rezervarea
-- orfană ocupa locul în sesiune și, prin uq_open_rez_client_active, bloca orice
-- reînscriere a clientului la aceeași ședință (OPEN 02.10.2026: Onea, Pricop,
-- Mironescu, Stejar — înrolați fără plată, șterși, apoi imposibil de reînrolat).
-- Acum rezervarea se anulează în aceeași tranzacție cu ștergerea.

create or replace function sterge_inrolare(p_enrollment uuid, p_motiv text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth_role() not in ('manager', 'admin', 'owner') then
    raise exception 'Doar manager+ poate șterge înrolări.';
  end if;

  if exists (select 1 from incasari where inregistrare = p_enrollment) then
    raise exception 'Înrolarea are încasări — folosește Mută sau Reziliază.';
  end if;

  update open_rezervari
     set status = 'anulat',
         anulat_at = now(),
         anulat_motiv = 'înrolare ștearsă: ' || coalesce(nullif(btrim(p_motiv), ''), '—')
   where enrollment = p_enrollment
     and status <> 'anulat';

  delete from enrollments where id = p_enrollment;
end;
$$;

revoke execute on function sterge_inrolare(uuid, text) from anon, public;
grant execute on function sterge_inrolare(uuid, text) to authenticated;

-- Rezervările rămase orfane înainte de fix (toate din sterge_inrolare, iul.–oct. 2026).
-- Rosterul le ignora deja (cere enrollment), dar umflau ocuparea sesiunilor.
-- Doar `platit`: hold-ul de pe portal (hold_loc_open) e legitim `rezervat` fără înrolare.
update open_rezervari
   set status = 'anulat',
       anulat_at = now(),
       anulat_motiv = 'înrolarea fusese ștearsă (rezervare orfană, curățată 02.10.2026)'
 where enrollment is null
   and incasare is null
   and status = 'platit';
