-- Părintele poate descărca o ciornă a contractului înainte să semneze; descărcarea
-- intră în jurnalul probatoriu (și pe certificatul de finalizare).
alter table contract_events drop constraint if exists contract_events_tip_check;
alter table contract_events add constraint contract_events_tip_check check (tip = any (array[
  'creat', 'trimis', 'retrimis', 'sms_pus_in_coada', 'sms_trimis', 'sms_amanat',
  'email_trimis', 'deschis', 'ciorna_descarcata', 'consimtamant', 'semnat', 'pdf_generat',
  'sigilat', 'drive_upload', 'gate_semnat', 'reminder', 'expirat', 'respins', 'anulat',
  'descarcat', 'eroare'
]));
