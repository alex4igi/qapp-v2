-- Parchează `mesaj_liber` — SMS-ul cu text scris de operator. Decizie Alex, 20.09.2026.
--
-- De ce: e singura cale de SMS a cărei categorie NU se poate deduce din cod (textul
-- îl scrie omul la trimitere), deci gardul de opt-out adăugat azi nu o acoperă.
-- Măsurat în momentul deciziei: 665 de destinatari ar prinde un mesaj liber, dintre
-- care 116 clienți ACTIVI cu `opt_out_marketing = true` — oameni care ceruseră
-- explicit să nu mai primească promovare. Varianta corectă (selector obligatoriu
-- Operațional/Marketing, cu excluderea automată a celor cu opt-out) nu e făcută, așa
-- că până atunci calea stă închisă, nu deschisă pe încredere.
--
-- Costul parcării e zero: `situatie_sms_uri` n-a avut NICIODATĂ un rând cu
-- `cod_mesaj = 'mesaj_liber'` (verificat 20.09.2026, 0 din toate rândurile).
--
-- PARCAT, nu șters — la fel ca „Nu a venit" (vezi 20260919140000): builderul
-- `buildBulkSms('mesaj_liber', …)`, formularul „+ SMS manual" (`SmsQueueForm.tsx`) și
-- ramura `p_cod = 'mesaj_liber'` din `get_sms_recipients` rămân pe loc.
--
-- CA SĂ-L REPORNEȘTI: readu politica la varianta din 20260606210000 (ultima linie
-- comentată mai jos) și scoate codul din `SMS_BULK_PARCATE` în
-- `src/features/notificari-sms/templates.ts`. Nimic altceva.

drop policy if exists situatie_sms_uri_adhoc_restrict on situatie_sms_uri;
create policy situatie_sms_uri_adhoc_restrict on situatie_sms_uri
  as restrictive for insert to authenticated
  with check (
    cod_mesaj is distinct from 'mesaj_liber'
    -- pornit înapoi: or (select auth_role()) in ('owner', 'admin', 'manager')
  );

comment on policy situatie_sms_uri_adhoc_restrict on situatie_sms_uri is
  'mesaj_liber PARCAT 20.09.2026 — nicio categorie deductibilă din cod, deci gardul de opt-out nu-l acoperă. Vezi migrația 20260920200000.';
