-- Neprezentarile se decid dintr-un singur loc: `prune_expired_leads`.
--
-- Erau doua implementari paralele: RPC-ul asta (rulat la deschiderea /leads,
-- corect — se uita la PROGRAMARI) si pasul 1 din cron-evening (se uita la
-- `leads.status` + `leads.data_programare`). A doua rata exact cazurile pentru
-- care s-a reparat si reminderul pe 09-08: cine e inscris la o clasa demo din
-- rosterul evenimentului nu primeste mereu data pe cartonas, deci programarea
-- lui expira fara sa fie inchisa. In practica ii prindea RPC-ul la urmatoarea
-- deschidere de /leads, dar asta face rezultatul sa depinda de cine intra in
-- aplicatie si cand.
--
-- Aici RPC-ul primeste ce avea in plus cronul (gardul `leaduriProtejate`) si
-- intoarce contoare, iar cron-evening ajunge sa-l cheme in loc sa duplice logica.
--
-- Gardul: un lead legat de un client inca Activ/Inactiv e de obicei o conversie
-- neinregistrata, nu un om de reactivat — nu are ce cauta in nurture. Cade in
-- 'nu_a_venit' ca sa nu ramana blocat in 'programat' cu programarea consumata.

drop function if exists prune_expired_leads();

create or replace function prune_expired_leads()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_absente int := 0;
  v_nurture int := 0;
  v_navenit int := 0;
begin
  -- 1. Programarile trecute se inchid ca 'absent' (triggerul recalculeaza
  --    nr_neprezentari). Doar cele expirate: o programare viitoare a aceluiasi
  --    lead ramane atinsa.
  update programari_leads
     set prezenta = 'absent',
         updated  = now()
   where prezenta = 'programat'
     and data_programarii < current_date;
  get diagnostics v_absente = row_count;

  -- 2a. A 2-a neprezentare → nurture, fara SMS. Exceptie: protejatii.
  update leads l
     set status = 'nurture',
         sub_status = null,
         flag_reminder = false,
         flag_streak = 0,
         flag_reminder_at = null
   where l.status = 'programat'
     and exists (select 1 from programari_leads pl where pl.lead = l.id)
     and not exists (
       select 1 from programari_leads pl
        where pl.lead = l.id and pl.data_programarii >= current_date
     )
     and l.nr_neprezentari >= 2
     and not exists (
       select 1 from clienti c
        where c.id = l.id_client and c.status <> 'EXclient'
     );
  get diagnostics v_nurture = row_count;

  -- 2b. Restul (prima neprezentare, sau protejat) → nu_a_venit.
  update leads l
     set status = 'nu_a_venit'
   where l.status = 'programat'
     and exists (select 1 from programari_leads pl where pl.lead = l.id)
     and not exists (
       select 1 from programari_leads pl
        where pl.lead = l.id and pl.data_programarii >= current_date
     );
  get diagnostics v_navenit = row_count;

  return jsonb_build_object(
    'absente', v_absente,
    'nurture', v_nurture,
    'nu_a_venit', v_navenit
  );
end;
$$;

grant  execute on function prune_expired_leads() to authenticated;
revoke execute on function prune_expired_leads() from anon, public;
