-- Ștergerea refuza orice înrolare cu rânduri în `incasari`, chiar dacă plata fusese
-- restituită integral (+280 / −280). Modalul arată butonul (suma netă = 0), RPC-ul
-- răspundea „are încasări”, iar recepția rămânea cu înrolarea pe grupa greșită și,
-- după ce reseta prețul, cu o restanță fantomă (Duca Ivona, Kpop, 26.09 și 03.10.2026).
-- Acum gardul e pe suma netă: banii încasați și restituiți rămân în registru
-- (FK on delete set null), doar legătura cu înrolarea ștearsă dispare.

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

  if coalesce((select sum(suma) from incasari where inregistrare = p_enrollment), 0) <> 0 then
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
