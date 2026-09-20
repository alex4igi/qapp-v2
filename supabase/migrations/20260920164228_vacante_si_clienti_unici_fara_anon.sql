-- Ultimele două lucruri citibile cu cheia publică, găsite lovind API-ul cu cheia
-- din browser (audit 2026-09-20, `scripts/check-citire-anon.mjs`).
--
-- `vacante`: politica era `for select using (true)` fără `to authenticated`, deci se
-- aplica rolului `public` — adică și lui `anon`. Calendarul de vacanțe nu e dată
-- personală, dar nu are ce căuta pe cheia publică; în aplicație îl citește doar
-- staff-ul (VacantaWarning, /metodologic, Setări → Sezoane). Portalul nu-l atinge.
--
-- `clienti_unici`: view rămas din schema inițială, nefolosit nicăieri în cod. E
-- `security_invoker`, deci anonimului îi întoarce agregatul peste zero rânduri
-- vizibile — fără date — dar tot nu are de ce să fie ajuns de pe cheia publică.
-- Candidat la ștergere, la o curățenie separată.

drop policy if exists vacante_select on vacante;
create policy vacante_select on vacante
  for select to authenticated
  using (true);

revoke select on vacante from anon;
revoke select on clienti_unici from anon;
