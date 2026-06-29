-- Conversie „ședință → abonament" (campania iulie 2026).
--
-- Context: în campanie, recepția a înregistrat unii clienți ca rezervări OPEN
-- „Per ședință" de 50 RON, FĂRĂ plată (zilele 29-30 iunie sunt gratuite, abonamentul
-- de iulie începe astăzi). Dacă clientul alege abonamentul, abonamentul de iulie se
-- creează separat (în TS via createInrolari, care gestionează prorata/voucher/politică/
-- multi-rând), iar acest RPC face curat partea de ședință:
--
--   (a) mută orice încasare existentă pe abonament (no-op în campanie: nu există);
--   (b) zerează prețul rezervării OPEN 29-30 iun (rămâne activă → prezență/roster
--       păstrate, dar fără 50 RON);
--   (c) void curat al înrolării „Per sedinta" (suma=suma_baza=0, reziliat) → nu lasă
--       restanță (view-urile de restanțe exclud reziliat=true; vezi invariant suma_baza).
--
-- Idempotent: dacă ședința e deja reziliată, conversia s-a făcut (re-submit nu dublează).
-- Authz: front_desk și mai sus (recepția face conversia la ghișeu).

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

  -- (b) rezervarea OPEN devine gratuită; rămâne activă (prezență/roster păstrate).
  update open_rezervari
    set suma = 0
  where enrollment = p_sedinta;

  -- (c) void curat al înrolării „Per sedinta" → fără restanță.
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
