-- Mesajele de eroare din funcțiile chemate DOAR de portalul de membri (docs/inventar-mesaje-eroare.md §8):
-- ce s-a întâmplat + ce poate face părintele, cu diacritice, la persoana a doua ca restul portalului.
-- Aceeași tehnică ca 20261003201000: doar textul se schimbă pe definiția LIVE; un text negăsit
-- oprește migrația. Excepție: la hold_bilete se schimbă și argumentele mesajului (locuri rămase).

do $$
declare
  r     record;
  v_oid oid;
  v_def text;
  c_membru constant text := 'Cursantul ales nu mai apare în familia contului tău. Reîncarcă pagina și alege-l din nou din partea de sus a ecranului; dacă lipsește, scrie-ne la office@quasardance.ro.';
  c_reincarca constant text := 'Evaluarea nu s-a putut trimite. Reîncarcă pagina și încearcă din nou.';
begin
  for r in
    select fn, old, new from (values
    ('build_fifo_plan_membru', '''Cursantul ales nu face parte din familia contului.''', quote_literal(c_membru)),
    ('build_fifo_plan_membru', 'Înrolarea selectată nu există sau e deja achitată.', 'Luna aleasă e deja achitată sau nu mai e de plată. Reîncarcă pagina ca să vezi soldul la zi.'),
    ('plan_plata_integrala_sezon', '''Cursantul ales nu face parte din familia contului.''', quote_literal(c_membru)),

    ('hold_bilete', '''Cursantul ales nu face parte din familia contului.''', quote_literal(c_membru)),
    ('hold_bilete', 'Număr de bilete invalid (1-10).', 'Poți cumpăra între 1 și 10 bilete într-o comandă. Pentru mai multe, fă încă o comandă.'),
    ('hold_bilete', 'Evenimentul nu există.', 'Evenimentul nu mai este în listă. Reîncarcă pagina ca să vezi evenimentele la zi.'),
    ('hold_bilete', 'Evenimentul este anulat.', 'Evenimentul a fost anulat, așa că nu se mai vând bilete. Detalii la recepție.'),
    ('hold_bilete', 'Evenimentul nu are un preț de bilet valid.', 'Biletele pentru acest eveniment nu sunt încă puse în vânzare online. Revino mai târziu sau întreabă la recepție.'),
    ('hold_bilete', '''Locuri insuficiente (% / % ocupate).'', v_count, v_cap', '''Nu mai sunt destule locuri: au rămas % libere. Alege mai puține bilete.'', greatest(v_cap - v_count, 0)'),

    ('hold_loc_open', '''Cursantul ales nu face parte din familia contului.''', quote_literal(c_membru)),
    ('hold_loc_open', 'Sesiunea nu există.', 'Ședința nu mai este în program. Reîncarcă pagina și alege altă dată.'),
    ('hold_loc_open', 'Sesiunea este anulată.', 'Ședința a fost anulată. Alege altă dată din listă.'),
    ('hold_loc_open', 'Sesiunea nu mai este disponibilă online.', 'Grupa nu se mai ține în ziua acestei ședințe. Reîncarcă pagina și alege altă dată.'),
    ('hold_loc_open', 'Cursul nu permite rezervări online.', 'Acest curs nu se rezervă online. Pentru un loc, sună la recepția locației.'),
    ('hold_loc_open', 'Grupa este suspendată în luna acestei sesiuni.', 'Grupa nu are ședințe în luna aceasta (e suspendată). Alege o ședință din altă lună sau altă grupă.'),
    ('hold_loc_open', 'Sesiunea nu are un preț valid.', 'Ședința nu are încă preț stabilit, deci nu se poate plăti online. Sună la recepție pentru rezervare.'),
    ('hold_loc_open', 'Ai deja o rezervare plătită pentru această sesiune.', 'Ai deja o rezervare plătită pentru această ședință — o găsești în Calendar. Pentru alt copil, schimbă membrul din partea de sus a ecranului.'),
    ('hold_loc_open', 'Sesiune completă (% / %). Nu mai sunt locuri.', 'Ședința e completă (% / % locuri). Alege altă dată din listă.'),

    ('submit_app_feedback_portal', 'tip invalid', 'Alege tipul mesajului (problemă, idee sau întrebare).'),
    ('submit_app_feedback_portal', 'Ai trimis deja mai multe mesaje in ultima ora. Revino putin mai tarziu.', 'Ai trimis deja 5 mesaje în ultima oră. Încearcă din nou peste o oră; dacă e urgent, sună la recepție.'),

    ('submit_rating_client', '''rating invalid''', '''Alege câte stele dai (de la 1 la 5).'''),
    ('submit_rating_client', '''context invalid''', quote_literal(c_reincarca)),
    ('submit_rating_client', '''trebuie exact o activitate (curs, sesiune sau eveniment)''', quote_literal(c_reincarca)),
    ('submit_rating_client', 'la 3 stele sau mai putin, comentariul e obligatoriu (minim 10 caractere)', 'La 3 stele sau mai puțin, scrie-ne și ce n-a mers (minim 10 caractere), ca instructorul să știe ce să îmbunătățească.'),
    ('submit_rating_client', '''curs neevaluabil''', '''Poți evalua doar grupele la care cursantul e înscris acum. Dacă tocmai a fost înscris sau mutat, reîncarcă pagina.'''),
    ('submit_rating_client', 'ai nevoie de minim 3 luni achitate consecutiv la aceasta grupa (ai %)', 'Poți evalua grupa după 3 luni achitate la rând (acum sunt %). Revino după următoarea plată.'),
    ('submit_rating_client', 'sezonul s-a incheiat; evaluarea ramane fixata', 'Sezonul s-a încheiat, așa că evaluarea dată rămâne cea finală. Vei putea evalua din nou în sezonul următor.'),
    ('submit_rating_client', '''sesiune neevaluabilă''', '''Poți evalua doar ședințele OPEN rezervate pentru acest cursant. O rezervare anulată nu se mai poate evalua.'''),
    ('submit_rating_client', '''eveniment neevaluabil''', '''Poți evalua doar evenimentele la care cursantul apare ca participant. Dacă a participat și nu apare, scrie-ne la office@quasardance.ro.'''),

    ('update_profil_client', 'Membru în afara familiei.', 'Cursantul ales nu mai apare în familia contului tău. Reîncarcă pagina și alege-l din nou din partea de sus a ecranului.'),
    ('update_profil_client', 'CNP invalid (13 cifre).', 'CNP-ul trebuie să aibă exact 13 cifre, fără spații. Îl găsești pe buletin sau pe certificatul de naștere.'),
    ('update_profil_familie', 'Contul nu e legat de o familie.', 'Contul tău nu e legat încă de o familie în evidența școlii, deci datele nu se pot salva aici. Scrie-ne la office@quasardance.ro și îl legăm.')
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
