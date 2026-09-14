-- Reprogramarea unui lead din LeadModal INLOCUIESTE programarea veche.
--
-- Pana acum salvarea doar insera un rand nou in `programari_leads`; cel vechi
-- ramanea pe 'programat'. Reminderul din cron-morning citeste programarile zilei,
-- deci trimitea „AZI" pentru data veche (Petra Grosu, 14.09: mutata de pe 14 pe
-- 15 septembrie, a primit reminder pe 14). La noapte `prune_expired_leads` marca
-- randul vechi 'absent' => neprezentare falsa, iar a doua duce leadul direct in
-- Nurture. O programare veche viitoare mai tinea si leadul pe „Programat" dupa ce
-- lipsea de la cea reala.
--
-- RPC, nu delete din client: RLS-ul pe programari_leads da DELETE doar adminului,
-- deci pentru receptie un delete direct ar fi trecut in tacere cu 0 randuri.
--
-- Se sterg doar programarile neconsumate (azi sau in viitor, inca 'programat').
-- Cele trecute raman: sunt istoricul de prezenta si le inchide `prune_expired_leads`.

create or replace function inlocuieste_programari_lead(
  p_lead      uuid,
  p_pastreaza uuid
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sterse int;
begin
  if auth_role() not in ('owner', 'admin', 'manager', 'front_desk') then
    raise exception 'Acces interzis.';
  end if;
  -- Gard: fara o programare noua valida a ACESTUI lead nu stergem nimic.
  if not exists (
    select 1 from programari_leads where id = p_pastreaza and lead = p_lead
  ) then
    raise exception 'Programarea noua nu apartine leadului.';
  end if;

  delete from programari_leads
   where lead = p_lead
     and id <> p_pastreaza
     and prezenta = 'programat'
     and data_programarii >= (now() at time zone 'Europe/Bucharest')::date;
  get diagnostics v_sterse = row_count;
  return v_sterse;
end;
$$;

revoke execute on function inlocuieste_programari_lead(uuid, uuid) from anon, public;
grant  execute on function inlocuieste_programari_lead(uuid, uuid) to authenticated;
