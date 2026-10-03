-- Mesajele de eroare din funcții (docs/inventar-mesaje-eroare.md §1, §5, §7; aprobat de Alex 03.10):
--   §1 „cere unui manager" acolo unde managerul primea exact același refuz → cine poate rezolva de fapt;
--   §5 texte tehnice / în engleză („Access denied", „forbidden:", nume de coloane);
--   §7 pasul următor lipsă.
-- Doar textul se schimbă, nu logica: definiția LIVE a funcției (pg_get_functiondef) primește
-- înlocuirea și e recreată. Un text negăsit oprește migrația (nimic aplicat), ca o funcție
-- modificată între timp să nu treacă nevăzută. Numărul de `%` din fiecare mesaj e păstrat.

do $$
declare
  r     record;
  v_oid oid;
  v_def text;
begin
  for r in
    select fn, old, new from (values
    ('muta_incasare_la_alt_client', 'Plățile online (Netopia) le face părintele din portal și au factură automată — nu se mută de aici. Cere unui manager.', 'Plățile online (Netopia) au factură automată pe familia care a plătit și nu se mută din aplicație. Scrie-i lui Alex clientul și luna pe care trebuia să intre.'),
    ('muta_incasare_la_alt_client', 'Factura nu se mută și nu se împarte — trebuie stornată în FGO înainte. Cere unui manager.', 'Factura nu se mută și nu se împarte, iar din aplicație plata nu se poate corecta. Stornează factura în FGO și scrie-i lui Alex.'),
    ('muta_incasare_la_alt_client', 'Luna face parte dintr-o plată integrală de sezon (−5%%) — nu se mută. Cere unui manager.', 'Luna face parte dintr-o plată integrală de sezon (−5%%) și nu se mută: s-ar strica reducerea pe tot sezonul. Scrie-i lui Alex.'),
    ('corecteaza_data_inrolare', 'Înrolarea are % rezervări OPEN active pe alte zile — cere unui manager.', 'Înrolarea are % rezervări OPEN active pe alte zile, iar corectarea automată merge doar cu una. Scrie-i lui Alex.'),
    ('muta_inrolare_curs', 'Înrolarea are % rezervări OPEN active — cere unui manager.', 'Înrolarea are % rezervări OPEN active, iar mutarea automată merge doar cu una. Scrie-i lui Alex.'),
    ('audit_digest_dispatch_weekly', '''Access denied''', '''Acces refuzat.'''),
    ('job_absente_21z', '''Access denied''', '''Acces refuzat.'''),
    ('marcheaza_contact_absenta', '''Access denied''', '''Acces refuzat.'''),
    ('pontaj_auto_close_open_sessions', '''Access denied''', '''Acces refuzat.'''),
    ('pontaj_confirma', '''Access denied''', '''Acces refuzat.'''),
    ('pontaj_sterge', '''Access denied''', '''Acces refuzat.'''),
    ('pontaj_upsert_manual', '''Access denied''', '''Acces refuzat.'''),
    ('proceseaza_sesiuni_evaluare', '''Access denied''', '''Acces refuzat.'''),
    ('audit_log_record', '''Not authenticated''', '''Sesiunea a expirat. Intră din nou în cont.'''),
    ('notify_enrollment_move', '''Not authenticated''', '''Sesiunea a expirat. Intră din nou în cont.'''),
    ('notify_price_change', '''Not authenticated''', '''Sesiunea a expirat. Intră din nou în cont.'''),
    ('pontaj_check_in', '''Not authenticated''', '''Sesiunea a expirat. Intră din nou în cont.'''),
    ('pontaj_check_out', '''Not authenticated''', '''Sesiunea a expirat. Intră din nou în cont.'''),
    ('aproba_motivare_absenta', 'forbidden: doar managerul poate aproba motivări de absență', 'Doar managerii pot aproba motivări de absență.'),
    ('adjust_enrollment_price', 'forbidden: doar managerul+ poate ajusta prețul înrolării', 'Doar managerii pot ajusta prețul înrolării.'),
    ('corecteaza_data_inrolare', 'forbidden: doar recepția+ poate corecta data înrolării', 'Doar recepția și managerii pot corecta data înrolării.'),
    ('muta_inrolare_curs', 'forbidden: doar recepția+ poate muta înrolări între cursuri', 'Doar recepția și managerii pot muta înrolări între cursuri.'),
    ('incaseaza_plata_integrala_sezon', 'forbidden: rol fără drept de încasare', 'Rolul tău nu are drept de încasare.'),
    ('plan_plata_integrala_staff', 'forbidden: rol fără drept de încasare', 'Rolul tău nu are drept de încasare.'),
    ('clone_sezon', 'data_final nu poate fi înainte de data_incepere.', 'Data de final nu poate fi înaintea datei de început.'),
    ('create_campanie_reinscriere', 'data_final nu poate fi înainte de data_incepere.', 'Data de final nu poate fi înaintea datei de început.'),
    ('activate_reinscriere', 'Cursul nu are preț promo configurat (pret_lunar_promo).', 'Cursul nu are „Preț lunar PROMO". Setează-l în fișa cursului.'),
    ('converteste_abonament_in_sedinte', 'Abonamentul nu are lună (data_incepere).', 'Abonamentul nu are dată de început. Corectează data din fișa clientului.'),
    ('aproba_motivare_absenta', 'Înrolarea nu are lună (data_incepere).', 'Înrolarea nu are dată de început. Corectează data din fișa clientului.'),
    ('adjust_enrollment_price', '''Tip țintă invalid: %''', '''Eroare internă (anunță-l pe Alex): Tip țintă invalid: %'''),
    ('use_client_credit', '''Tip țintă invalid: %''', '''Eroare internă (anunță-l pe Alex): Tip țintă invalid: %'''),
    ('clear_opt_out', '''p_entity trebuie să fie client | lead | familie (primit: %)''', '''Eroare internă (anunță-l pe Alex): p_entity trebuie să fie client | lead | familie (primit: %)'''),
    ('mark_opt_out', '''p_entity trebuie să fie client | lead | familie (primit: %)''', '''Eroare internă (anunță-l pe Alex): p_entity trebuie să fie client | lead | familie (primit: %)'''),
    ('use_client_credit', '''Acțiune invalidă: %''', '''Eroare internă (anunță-l pe Alex): Acțiune invalidă: %'''),
    ('seteaza_campanie_preinscriere', '''Acțiune necunoscută: %''', '''Eroare internă (anunță-l pe Alex): Acțiune necunoscută: %'''),
    ('adjust_enrollment_price', '''Acțiune surplus invalidă: %''', '''Eroare internă (anunță-l pe Alex): Acțiune surplus invalidă: %'''),
    ('kpi_dispecer', '''KPI auto fără implementare: %''', '''Eroare internă (anunță-l pe Alex): KPI auto fără implementare: %'''),
    ('_calcul_salariu_staff', '''Post necunoscut: %''', '''Eroare internă (anunță-l pe Alex): Post necunoscut: %'''),
    ('muta_inrolare_curs', 'Înrolarea e reziliată — nu se mai mută.', 'Înrolarea e reziliată — nu se mai mută. Fă o înrolare nouă pe grupa nouă.'),
    ('corecteaza_data_inrolare', 'Clientul are deja o înrolare pe acest curs în luna țintă.', 'Clientul are deja o înrolare pe acest curs în luna țintă. Șterge sau mută întâi dublura (tabul Înrolări din fișa clientului).'),
    ('creeaza_familie_proprie', 'linkul de semnare n-ar avea unde să plece.', 'linkul de semnare n-ar avea unde să plece. Completează telefonul în fișa clientului.'),
    ('rezerva_loc_open', 'Sesiune completă (% / %). Nu mai sunt locuri.', 'Sesiune completă (% / %). Mărește limita din fișa cursului → tabul OPEN.'),
    ('muta_inrolare_curs', 'Ședința din % a cursului nou e completă (% / %).', 'Ședința din % a cursului nou e completă (% / %). Mărește limita din fișa cursului → tabul OPEN.'),
    ('corecteaza_data_inrolare', 'Ședința din % e completă (% / %).', 'Ședința din % e completă (% / %). Mărește limita din fișa cursului → tabul OPEN.'),
    ('rezerva_loc_open', 'Grupa este suspendată în luna acestei sesiuni.', 'Grupa este suspendată în luna acestei sesiuni. Alege altă dată.'),
    ('corecteaza_data_inrolare', 'Grupa este suspendată în luna datei noi.', 'Grupa este suspendată în luna datei noi. Alege altă dată.'),
    ('muta_inrolare_curs', 'Grupa nouă este suspendată în luna ședinței (%).', 'Grupa nouă este suspendată în luna ședinței (%). Alege altă grupă.'),
    ('rezerva_loc_open', 'Cursul nu este facultativ — rezervările OPEN sunt doar pe cursuri facultative.', 'Cursul nu este facultativ — rezervările OPEN sunt doar pe cursuri facultative. Pentru o grupă recurentă folosește Înrolare nouă.'),
    ('sterge_inrolare', 'Doar manager+ poate șterge înrolări.', 'Doar managerii pot șterge înrolări. Recepția poate folosi Mută sau Reziliază.'),
    ('trg_enrollment_voucher_valid', 'Voucherul nu se combină cu prețul de reînscriere — reducerile nu se cumulează.', 'Voucherul nu se combină cu prețul de reînscriere — reducerile nu se cumulează. Scoate voucherul.'),
    ('corecteaza_metoda_incasare', '''Încasarea nu există.''', '''Încasarea nu mai există — probabil a fost ștearsă între timp. Reîncarcă pagina.'''),
    ('delete_incasare', '''Încasarea nu există.''', '''Încasarea nu mai există — probabil a fost ștearsă între timp. Reîncarcă pagina.'''),
    ('edit_incasare', '''Încasarea nu există.''', '''Încasarea nu mai există — probabil a fost ștearsă între timp. Reîncarcă pagina.'''),
    ('record_taxa_rezervare', '''Încasarea nu există.''', '''Încasarea nu mai există — probabil a fost ștearsă între timp. Reîncarcă pagina.'''),
    ('adjust_enrollment_price', '''Înrolarea nu există.''', '''Înrolarea nu mai există — probabil a fost ștearsă între timp. Reîncarcă pagina.'''),
    ('aproba_motivare_absenta', '''Înrolarea nu există.''', '''Înrolarea nu mai există — probabil a fost ștearsă între timp. Reîncarcă pagina.'''),
    ('converteste_abonament_in_sedinte', '''Înrolarea nu există.''', '''Înrolarea nu mai există — probabil a fost ștearsă între timp. Reîncarcă pagina.'''),
    ('corecteaza_data_inrolare', '''Înrolarea nu există.''', '''Înrolarea nu mai există — probabil a fost ștearsă între timp. Reîncarcă pagina.'''),
    ('muta_inrolare_curs', '''Înrolarea nu există.''', '''Înrolarea nu mai există — probabil a fost ștearsă între timp. Reîncarcă pagina.'''),
    ('rezerva_bonus_open', '''Înrolarea nu există.''', '''Înrolarea nu mai există — probabil a fost ștearsă între timp. Reîncarcă pagina.'''),
    ('delete_curs_safe', 'Cursul nu poate fi șters: are % . ', 'Cursul nu poate fi șters: are %. '),
    ('delete_teacher_safe', 'Instructorul nu poate fi șters: are % . ', 'Instructorul nu poate fi șters: are %. ')
    ) t(fn, old, new)
  loop
    select p.oid into strict v_oid
    from pg_proc p
    where p.proname = r.fn and p.pronamespace = 'public'::regnamespace;

    v_def := pg_get_functiondef(v_oid);
    if position(r.old in v_def) = 0 then
      raise exception 'Mesaj negăsit în %: %', r.fn, r.old;
    end if;
    execute replace(v_def, r.old, r.new);
  end loop;
end;
$$;
