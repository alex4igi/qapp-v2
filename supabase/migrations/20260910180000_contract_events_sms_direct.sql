-- Contractul se notifică pe UN SINGUR canal (SMS dacă familia are telefon, altfel
-- email), iar SMS-ul pleacă direct în loc să aștepte în coada `situatie_sms_uri`.
-- Jurnalul are nevoie de tipurile noi: 'sms_trimis' (a plecat efectiv) și
-- 'sms_amanat' (prins de zona interzisă, pleacă din sms_amanate după ora `end`).
-- 'sms_pus_in_coada' rămâne în listă pentru cele 88 de rânduri istorice.
alter table contract_events drop constraint if exists contract_events_tip_check;
alter table contract_events add constraint contract_events_tip_check
  check (tip in (
    'creat', 'trimis', 'sms_pus_in_coada', 'sms_trimis', 'sms_amanat',
    'email_trimis', 'deschis', 'consimtamant', 'semnat', 'pdf_generat',
    'sigilat', 'drive_upload', 'gate_semnat', 'reminder', 'expirat',
    'respins', 'anulat', 'eroare'
  ));
