-- Ștergere fizică a unei înrolări create din greșeală (ex: dublu-submit pe
-- formular → 2-3 înrolări pe același curs). Spre deosebire de reziliere (care
-- păstrează rândul cu reziliat=true, pentru anulări reale de contract), aici
-- înlăturăm rândul complet ca să nu umfle restanța per client în roster și
-- sumele din rapoarte.
--
-- Două gărzi, server-side ca sursă de adevăr:
--   1. rol: doar manager/admin/owner (auth_role()).
--   2. bani: refuză dacă există încasări legate — FK incasari.inregistrare e
--      ON DELETE SET NULL, deci ștergerea ar orfana banii. Înrolările cu plată
--      se rezolvă prin Mută/Reziliază, nu prin ștergere.

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

  delete from enrollments where id = p_enrollment;
end;
$$;

grant execute on function sterge_inrolare(uuid, text) to authenticated;
