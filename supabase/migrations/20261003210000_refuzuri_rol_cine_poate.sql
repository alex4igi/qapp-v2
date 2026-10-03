-- Refuzurile de rol spun CINE are voie (docs/inventar-mesaje-eroare.md §6, cerut de Alex 03.10).
-- Înainte: „Acces refuzat." / „Acces interzis" / „forbidden" în 75 de funcții, fără să spună cine poate.
-- Textul urmează garda din fața lui: listă albă (admin / manager+ / recepție+ / + instructori / + agenție),
-- funcție de staff (oprește portalul, agenția, uneori instructorii) sau funcție de portal (cere cont de părinte).
-- Rămân neatinse: `inregistreaza_utilizare` (contor trimis în fundal, eroarea nu ajunge la nimeni) și
-- `anuleaza_rezervare_open`, redefinită în paralel de 20261003213000; textul propus pentru ea:
-- „Doar recepția și managerii pot anula rezervări OPEN."
-- Același mecanism ca 20261003201000: doar textul, pe definiția live; text negăsit = migrația se oprește.
-- În aplicație, `humanizeError` lasă acum să treacă textul unui 42501 venit dintr-o gardă (vezi errorMessage.ts).

do $$
declare
  r     record;
  v_oid oid;
  v_def text;
begin
  for r in
    select fn, old, new from (values
    ('_analytics_indicatori', '''Acces refuzat.''', '''Doar adminii văd indicatorii de analiză.'''),
    ('get_analytics_sezon', '''Acces refuzat.''', '''Doar adminii văd statisticile sezonului.'''),
    ('get_cursanti_lunar', '''Acces refuzat.''', '''Doar adminii văd cursanții pe luni.'''),
    ('adauga_grupe_noi_in_pool', '''Acces refuzat.''', '''Doar adminii pot adăuga grupe noi în capacitate.'''),
    ('calculeaza_salariu_manager', '''Acces refuzat.''', '''Doar adminii văd salarizarea managerilor.'''),
    ('calculeaza_salariu_receptie', '''Acces refuzat.''', '''Doar adminii văd salarizarea recepției.'''),
    ('confirma_salariu_staff', '''Acces refuzat.''', '''Doar adminii pot confirma salarii.'''),
    ('get_salarizare_luna', '''Acces refuzat.''', '''Doar adminii văd salarizarea.'''),
    ('audit_digest_dispatch_weekly', '''Acces refuzat.''', '''Doar adminii pot porni manual această rulare automată.'''),
    ('job_absente_21z', '''Acces refuzat.''', '''Doar adminii pot porni manual această rulare automată.'''),
    ('pontaj_auto_close_open_sessions', '''Acces refuzat.''', '''Doar adminii pot porni manual această rulare automată.'''),
    ('proceseaza_sesiuni_evaluare', '''Acces refuzat.''', '''Doar adminii pot porni manual această rulare automată.'''),
    ('pontaj_sterge', '''Acces refuzat.''', '''Doar adminii pot șterge ture din pontaj.'''),
    ('gdpr_clienti_de_anonimizat', '''Acces refuzat.''', '''Doar adminii văd lista de anonimizare GDPR.'''),
    ('seteaza_campanie_preinscriere', '''Acces refuzat.''', '''Doar adminii pot porni sau opri campaniile de preînscriere.'''),
    ('pontaj_confirma', '''Acces refuzat.''', '''Doar managerii și adminii pot confirma ture.'''),
    ('pontaj_upsert_manual', '''Acces refuzat.''', '''Doar managerii și adminii pot corecta pontajul.'''),
    ('anuleaza_recomandare', '''Acces refuzat.''', '''Doar managerii și adminii pot anula o recomandare.'''),
    ('delete_incasare', '''Acces refuzat.''', '''Doar managerii și adminii pot șterge încasări.'''),
    ('edit_incasare', '''Acces refuzat.''', '''Doar managerii și adminii pot modifica încasări.'''),
    ('add_eveniment_participant', '''Acces interzis''', '''Doar recepția și managerii pot adăuga participanți.'''),
    ('remove_eveniment_participant', '''Acces interzis''', '''Doar recepția și managerii pot scoate participanți.'''),
    ('anonimizeaza_client', '''Acces refuzat.''', '''Doar recepția și managerii pot anonimiza un client.'''),
    ('anuleaza_inscriere_demo', '''Acces interzis.''', '''Doar recepția și managerii pot anula înscrieri la demo.'''),
    ('creeaza_lead_si_inscrie_la_demo', '''Acces interzis.''', '''Doar recepția și managerii pot înscrie la demo.'''),
    ('inscrie_la_demo', '''Acces interzis.''', '''Doar recepția și managerii pot înscrie la demo.'''),
    ('inlocuieste_programari_lead', '''Acces interzis.''', '''Doar recepția și managerii pot schimba programările unui lead.'''),
    ('rezerva_bonus_open', '''Acces refuzat.''', '''Doar recepția și managerii pot face rezervări OPEN.'''),
    ('rezerva_loc_open', '''Acces refuzat.''', '''Doar recepția și managerii pot face rezervări OPEN.'''),
    ('atribuie_recomandare', '''Acces refuzat.''', '''Doar recepția și managerii pot atribui recomandări.'''),
    ('consuma_credit_familie', '''Acces refuzat.''', '''Doar recepția și managerii pot folosi creditul familiei.'''),
    ('converteste_abonament_in_sedinte', '''Acces refuzat.''', '''Doar recepția și managerii pot converti înrolări.'''),
    ('converteste_sedinte_in_abonament', '''Acces refuzat.''', '''Doar recepția și managerii pot converti înrolări.'''),
    ('corecteaza_metoda_incasare', '''Acces refuzat.''', '''Doar recepția și managerii pot corecta forma de plată.'''),
    ('gdpr_export_client', '''Acces refuzat.''', '''Doar recepția și managerii pot exporta datele unui client.'''),
    ('get_clienti_pending_incasari', '''Acces refuzat.''', '''Doar recepția și managerii văd încasările în așteptare.'''),
    ('list_vouchere_aplicabile', '''Acces refuzat.''', '''Doar recepția și managerii pot aplica vouchere.'''),
    ('marcheaza_contact_absenta', '''Acces refuzat.''', '''Doar recepția și managerii pot marca contactarea unui absent.'''),
    ('raport_recomandari', '''Acces refuzat.''', '''Doar recepția și managerii văd raportul de recomandări.'''),
    ('get_ocupare_inchirieri', '''Acces refuzat.''', '''Doar echipa școlii vede ocuparea sălilor.'''),
    ('get_vine_la', '''Acces refuzat.''', '''Doar echipa școlii vede cine vine la grupe.'''),
    ('marcheaza_prezenta_client_demo', '''Acces interzis.''', '''Doar echipa școlii poate marca prezența.'''),
    ('marcheaza_prezenta_lead_curs', '''Acces interzis.''', '''Doar echipa școlii poate marca prezența.'''),
    ('marcheaza_prezenta_lead_demo', '''Acces interzis.''', '''Doar echipa școlii poate marca prezența.'''),
    ('get_lead_funnel', '''Acces refuzat.''', '''Doar recepția, managerii și agenția de marketing văd rapoartele de leaduri.'''),
    ('get_lead_motive', '''Acces refuzat.''', '''Doar recepția, managerii și agenția de marketing văd rapoartele de leaduri.'''),
    ('get_marketing_reconciliere', '''Acces refuzat.''', '''Doar recepția, managerii și agenția de marketing văd rapoartele de leaduri.'''),
    ('activate_reinscriere', '''Acces refuzat.''', '''Doar recepția și managerii lucrează cu reînscrierile.'''),
    ('activate_reinscriere_pe_sezon', '''Acces refuzat.''', '''Doar recepția și managerii lucrează cu reînscrierile.'''),
    ('record_taxa_rezervare', '''Acces refuzat.''', '''Doar recepția și managerii lucrează cu reînscrierile.'''),
    ('set_act_aditional_manual', '''Acces refuzat.''', '''Doar recepția și managerii lucrează cu reînscrierile.'''),
    ('clear_opt_out', '''Acces refuzat.''', '''Doar recepția și managerii pot schimba opt-out-ul.'''),
    ('mark_opt_out', '''Acces refuzat.''', '''Doar recepția și managerii pot schimba opt-out-ul.'''),
    ('enqueue_confirmare_programare', '''Acces refuzat.''', '''Doar recepția și managerii trimit confirmările de programare.'''),
    ('get_istoric_comunicari', '''Acces refuzat.''', '''Doar recepția și managerii văd istoricul comunicărilor.'''),
    ('leaga_click_whatsapp', '''Acces refuzat.''', '''Doar recepția și managerii pot lega clicurile WhatsApp de leaduri.'''),
    ('notify_enrollment_move', '''Acces refuzat.''', '''Doar recepția și managerii pot trimite notificarea.'''),
    ('notify_price_change', '''Acces refuzat.''', '''Doar recepția și managerii pot trimite notificarea.'''),
    ('prune_expired_leads', '''Acces refuzat.''', '''Doar recepția și managerii pot curăța leadurile expirate.'''),
    ('use_client_credit', '''Acces refuzat.''', '''Doar recepția și managerii pot folosi creditul clientului.'''),
    ('valideaza_bilet', '''Acces refuzat.''', '''Doar recepția și managerii validează biletele.'''),
    ('valideaza_bilet', '''forbidden''', '''Doar recepția și managerii validează biletele.'''),
    ('validate_voucher_code', '''Acces refuzat.''', '''Doar recepția și managerii aplică vouchere.'''),
    ('adjust_inchiriere_price', '''Acces refuzat.''', '''Acțiunea e doar pentru echipa școlii.'''),
    ('audit_log_record', '''Acces refuzat.''', '''Acțiunea e doar pentru echipa școlii.'''),
    ('send_anunt_staff', '''Acces refuzat.''', '''Acțiunea e doar pentru echipa școlii.'''),
    ('update_profil_client', '''Acces refuzat.''', '''Profilul se modifică din contul de portal al familiei.'''),
    ('update_profil_familie', '''Acces refuzat.''', '''Profilul se modifică din contul de portal al familiei.'''),
    ('hold_bilete', '''forbidden''', '''Rezervarea online se face din contul de portal al familiei.'''),
    ('hold_loc_open', '''forbidden''', '''Rezervarea online se face din contul de portal al familiei.'''),
    ('build_fifo_plan_membru', '''forbidden: clientul nu aparține familiei contului''', '''Cursantul ales nu face parte din familia contului.'''),
    ('hold_bilete', '''forbidden: clientul nu aparține familiei contului''', '''Cursantul ales nu face parte din familia contului.'''),
    ('hold_loc_open', '''forbidden: clientul nu aparține familiei contului''', '''Cursantul ales nu face parte din familia contului.'''),
    ('plan_plata_integrala_sezon', '''forbidden: clientul nu aparține familiei contului''', '''Cursantul ales nu face parte din familia contului.'''),
    ('get_ratable_activities_client', '''forbidden''', '''Evaluarea se face din contul de portal al familiei, doar pentru cursanții ei.'''),
    ('submit_rating_client', '''forbidden''', '''Evaluarea se face din contul de portal al familiei, doar pentru cursanții ei.'''),
    ('submit_app_feedback_portal', '''forbidden''', '''Feedbackul se trimite din contul de portal activ al familiei, doar pentru cursanții ei.''')
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
