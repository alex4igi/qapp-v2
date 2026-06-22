-- Q-bot — seed inițial qbot_kb. Generat din qbot/kb-seed/seed.sql (idempotent).
-- La re-editarea seed-ului, adaugă o nouă migrație cu conținutul actualizat.

insert into qbot_kb (audienta, categorie, titlu, continut, rol_necesar, pagina) values

-- ===== STAFF — workflow =====
('staff','workflow','Mutarea unui client între grupe',
 'Mutarea unei înrolări de pe un curs pe altul se face din profilul clientului → înrolarea respectivă → acțiunea de mutare. Se păstrează istoricul; managerul primește notificare. Recalcularea se face automat după regulile cursului nou.',
 'manager','/clienti'),

('staff','workflow','Schimbarea metodei de plată la o încasare greșită (cash/card)',
 'Dacă ai selectat greșit metoda (ex: cash în loc de card), corecția se face editând încasarea respectivă din Financiar → Încasări (sau din profilul clientului). Editarea încasărilor este disponibilă pentru manager și mai sus; front_desk cere managerului corecția.',
 'manager','/financiar'),

('staff','workflow','Aplicarea unui voucher după ce înrolarea a fost făcută fără el',
 'Voucherul se poate aplica și ulterior, la nivelul plății/înrolării: deschizi înrolarea și selectezi codul de voucher valid. Prețul vine din curs; voucherul este singura cale de reducere la casă. Crearea/administrarea voucherelor e în pagina Vouchere (manager+).',
 'manager','/vouchere'),

('staff','workflow','Marcarea prezenței',
 'Prezența se bifează din cardul grupei (click pe poză comută Prezent ↔ Absent) sau din pagina Prezențe. Statusuri: Prezent, Absent, Motivat. Salvarea e instantanee.',
 null,'/prezente'),

('staff','workflow','Programarea unei ședințe gratuite pentru un lead',
 'În Kanban-ul de leads muți lead-ul în coloana „Programat"; se cere data+ora și se trimite automat SMS de confirmare. Prezența la ședință se marchează apoi din roster sau prin mutarea în „A venit"/„Nu a venit".',
 null,'/leads'),

-- ===== STAFF — politică =====
('staff','politica','Adeverința medicală și motivarea absențelor',
 'Părintele aduce adeverința; recepția o încarcă pe Google Drive. Managerul aprobă motivarea în profilul clientului. Peste pragul de absențe (2 × ședințe/săptămână într-o lună) luna poate deveni 0 lei (scutire / credit). Salariul profesorului nu este afectat.',
 'manager','/clienti'),

('staff','politica','Prorata la înscriere târzie',
 'Prorata se aplică DOAR la prima lună, când înscrierea e la mijlocul lunii: plătești nr. ședințe rămase × preț/ședință. Lunile următoare se plătesc integral. Înscrierea pe 1 ale lunii = lună întreagă (fără prorata). Cursurile facultative lunare = acces nelimitat în luna calendaristică, fără prorata.',
 null,null),

('staff','politica','Reducerea automată de familie (10%)',
 'La 2+ abonamente în aceeași familie (frați sau 2 cursuri diferite), cel mai scump abonament e preț întreg, restul −10%. Se aplică pe fiecare lună neplătită. Reducerile nu se cumulează: un voucher manual pe o lună dezactivează reducerea automată pe tot poolul familiei în acea lună.',
 null,null),

('staff','politica','Anularea/rezilierea unei înrolări',
 'Rezilierea o face doar managerul și afectează doar lunile viitoare; luna curentă rămâne de plată (opțional recalculată la ședințele făcute). Trupele NU se reziliază. La reziliere poți reintegra clientul ca lead Nurture.',
 'manager','/clienti'),

-- ===== STAFF — contract / abonamente =====
('staff','contract','Abonamente copii: număr de ședințe',
 'Full copii = 70 de ședințe (septembrie–iunie, 2×/săptămână). Part-time copii = 35 de ședințe (septembrie–iunie, 1×/săptămână). Ambele: plată integrală (−10%) sau în tranșe (preț anual ÷ 10 rate lunare).',
 null,null),

('staff','contract','Scadențe și rate',
 'Abonamentul lunar se achită până pe 15 ale lunii. Septembrie (început de sezon) și iunie (final) pot avea scadențe speciale setate pe sezon. Restul lunilor: scadență pe 15, 10 rate lunare egale.',
 null,null),

('staff','glosar','Statusuri prezență',
 'Prezent = a venit; Absent = nu a venit; Motivat = absență justificată (adeverință). Pentru salariu: la recurent contează nr. cursanți activi, la facultativ contează nr. de prezențe „Prezent".',
 null,null),

('staff','politica','Cum se calculează salariul profesorului',
 'Salariul se calculează lunar pe praguri, per grupă: recurent = în funcție de numărul de cursanți activi (grupele 1×/săptămână se împart la 2); facultativ = în funcție de numărul de prezențe „Prezent"; trupele se trec manual. După plată, snapshot-ul devine imutabil. Profesorul își vede defalcarea în „Salariul meu".',
 null,'/salariul-meu'),

-- ===== MEMBRI =====
('membri','workflow','Cum plătesc online',
 'Din pagina Plăți vezi ce ai de achitat și poți plăti cu cardul (Netopia). Poți plăti integral sau o lună anume. După plată, soldul se actualizează automat.',
 null,'/plati'),

('membri','workflow','Unde văd cursurile copilului meu',
 'În „Grupa mea" vezi cursurile active ale fiecărui copil: zilele, ora, locația, sala și instructorii. Dacă ai mai mulți copii, comuți între ei din selectorul de membru din antet.',
 null,'/grupa'),

('membri','workflow','Cum rezerv o ședință (open class)',
 'În „Rezervări" vezi sesiunile disponibile și poți rezerva un loc. Locurile sunt limitate per sesiune; plata se face în avans.',
 null,'/rezervari'),

('membri','workflow','Unde găsesc documentele și adeverința',
 'Documentele (contracte, adeverințe) sunt în pagina „Documente". Adeverința de participare se descarcă din pagina „Adeverință".',
 null,'/documente'),

('membri','workflow','Cât am de plată',
 'Soldul familiei apare în pagina Plăți (total și pe fiecare copil). Întreabă-mă „cât am de plată" și îți spun cifra curentă.',
 null,'/plati'),

('ambele','contract','Abonamente: Full vs Part-time',
 'Full copii = 70 de ședințe pe sezon (sept–iunie), 2×/săptămână. Part-time copii = 35 de ședințe, 1×/săptămână. Plata: integral (−10%) sau în tranșe lunare.',
 null,null)

on conflict (audienta, titlu) do update
  set continut = excluded.continut,
      categorie = excluded.categorie,
      rol_necesar = excluded.rol_necesar,
      pagina = excluded.pagina,
      activ = true,
      updated_at = now();
