-- Conversie „ședință → abonament": mută și prezențele de pe ședință pe abonament.
--
-- Bug constatat (client e04c1eff): la conversie, prezența marcată pe înrolarea
-- „Per ședință" rămânea legată de înrolarea reziliată, iar bifările ulterioare
-- (după ce abonamentul devenea înrolarea curentă în roster) creau rânduri noi.
-- Cum `prezente` se deduplică pe (enrollment, data) — vezi uq_prezente_enrollment_data
-- — același client/curs/zi ajungea cu mai multe rânduri „Prezent" (unul orfan pe
-- ședință, unul pe abonament).
--
-- Fix: ca la `incasari`, mutăm prezențele de pe ședință pe abonamentul-țintă.
-- Dacă ținta are deja prezență pe acea dată (a doua bifare a creat-o), ștergem
-- rândul de pe ședință ca să nu încălcăm uq_prezente_enrollment_data.
--
-- Idempotent: dacă ședința e deja reziliată (re-submit), prezențele au fost deja
-- mutate la conversia anterioară → pașii (a)-(d) sunt no-op.

create or replace function converteste_sedinta_in_abonament(
  p_sedinta uuid,
  p_target  uuid,
  p_motiv   text default 'Convertit în abonament iulie (campanie)'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_already boolean;
begin
  if auth_role() not in ('admin', 'owner', 'manager', 'front_desk') then
    raise exception 'Acces refuzat.';
  end if;

  select reziliat into v_already from enrollments where id = p_sedinta;
  if v_already is null then
    raise exception 'Ședința nu există.';
  end if;
  if v_already then
    return jsonb_build_object('already_converted', true);
  end if;

  -- (a) mută orice încasare existentă pe abonament (FIFO se aplică la nivel de
  --     plata_inrolari pe rândul-țintă). No-op în campanie (nicio încasare).
  update incasari
    set inregistrare = p_target, updated = now()
  where inregistrare = p_sedinta;

  -- (b) prezențele: ștergem mai întâi rândurile de pe ședință care s-ar ciocni cu
  --     o prezență deja existentă pe abonament în aceeași zi, apoi le mutăm pe rest.
  delete from prezente
  where enrollment = p_sedinta
    and data in (select data from prezente where enrollment = p_target);

  update prezente
    set enrollment = p_target, updated = now()
  where enrollment = p_sedinta;

  -- (c) rezervarea OPEN devine gratuită; rămâne activă (prezență/roster păstrate).
  update open_rezervari
    set suma = 0
  where enrollment = p_sedinta;

  -- (d) void curat al înrolării „Per sedinta" → fără restanță.
  update enrollments
    set suma = 0,
        suma_baza = 0,
        reziliat = true,
        activ = false,
        motiv_reziliere = p_motiv,
        data_reziliere = now(),
        updated = now()
  where id = p_sedinta;

  return jsonb_build_object('converted', true, 'target', p_target);
end;
$$;

grant execute on function converteste_sedinta_in_abonament(uuid, uuid, text) to authenticated;
