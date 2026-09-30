# Review al revizuirii Claude — campania Valea Lupului

**Stare:** preluat de Claude 29.09.2026 — etapa 1 (preînscrieri, LP, decizie grupe) implementată; regulile în `docs/reguli-domeniu.md` §11. Etapa 2 (DEMO) și locația completă rămân deschise. Ultima verificare: 2026-09-29. Review de plan pe cod local și migrații; fără implementare sau interogarea producției.

**Plan analizat:** `/Users/alex_igi/.claude/plans/ce-parere-ai-despre-quirky-clock.md` (versiunea citită la review).
**Referință inițială:** `2026-09-29-campanie-valea-lupului.md`.

## Verdict

- **propunere:** păstrăm direcția lui Claude și corectăm contractul participanților, confirmarea disponibilității și calculul scenariilor înainte de implementare. Planul concretizează bine integrarea, însă nu este încă o specificație completă pentru programare și raportare corectă.
- **propunere:** acceptăm critica asupra dimensiunii planului inițial ca motiv de prioritizare, nu ca estimare de efort dovedită. Revizuirea include ecran nou, RPC de analiză, constructor de scenarii și algoritm automat; ea nu este în sine o versiune minimă. Automatizarea poate fi amânată, dar instrumentul manual de decizie asupra închirierii merită păstrat dacă această nevoie din discuția Claude–Alex este confirmată.

## Ce a îmbunătățit Claude

- **propunere:** păstrăm ferestrele 13–15 / 15–17 / 17–19 în locul orelor fixe, după clarificarea raportată în plan. Trebuie definit dacă acestea înseamnă începere ori participare integrală în fereastră.
- **propunere:** păstrăm folosirea DEMO Class-urilor existente, cu corecția de identitate de mai jos. Prima oră gratuită, promovarea în școală și accesul pentru publicul din afară sunt consemnate de Claude ca decizii ale lui Alex; în acest review le tratăm ca informații din planul lui, nu ca noi confirmări date direct lui Codex.
- **propunere:** păstrăm tabelul separat per participant, selecția multiplă, salvarea obligatorie și la contact existent, QR cu lot, blocarea SMS-urilor cu locație incompletă și integrarea exportului/anonimizării.
- **propunere:** separarea infrastructurii operaționale a locației de campanie este bună. Proiectul locației complete trebuie să aibă responsabil și termen anterior începerii cursurilor.

## 1. Blocant pentru DEMO: participantul nu este același lucru cu leadul părintelui

- **propunere — prioritate mare:** înlocuim presupunerea că toate preînscrierile familiei pot folosi direct același `lead_id` în `inscrie_la_demo`.
- **propunere — constatare verificată:** `20260831150000_inscrieri_demo.sql:88–92` are index unic pe `(lead, eveniment_programat)`. `20260901235700_demo_class_completa_notificare.sql:89+` caută programarea existentă pe aceeași pereche și o actualizează. Doi frați legați de același lead, înscriși la aceeași probă, produc un singur loc și o singură identitate în roster. La probe diferite pot exista rânduri, dar numele, prezențele și statusul rămân legate de aceeași persoană din leads. `inlocuieste_programari_lead` poate șterge alte programări viitoare ale leadului.
- **propunere:** contactul/familia rămâne comun, dar fiecare participant trebuie rezolvat la leadul său sau la clientul său real înainte de programare. Alternativa este extinderea întregului flux de demo cu identitate de participant; alegerea îi revine lui Claude după verificare. Preînscrierea păstrează separat legătura cu contactul și identitatea rezolvată a participantului, plus programarea și înrolarea rezultate. Un client existent folosește ramura `p_client`, nu leadul găsit doar după telefon.
- **propunere:** test obligatoriu complet: doi frați, același telefon, aceeași probă → două locuri și două nume → prezențe independente → conversii independente. Testăm și frate + părinte la Zumba, precum și reprogramarea unuia fără ștergerea programării celuilalt.

## 2. Idempotenta și actualizarea răspunsurilor nu au mecanism definit

- **propunere — prioritate mare:** adăugăm identificator de trimitere și identificator de participant în acea trimitere, cu unicitate în DB. Deduplicarea doar pe `lead_id` pierde frații; deduplicarea pe prenume/vârstă nu este identitate sigură.
- **propunere:** distingem retry-ul tehnic de o nouă cerere intenționată și de actualizarea preferințelor. Raportul folosește versiunea curentă pentru participantul rezolvat; istoricul rămâne accesibil.
- **propunere:** o trimitere cu mai mulți participanți se salvează integral sau deloc, ori are recuperare explicită a salvării parțiale. Un eșec după salvarea primului copil urmat de retry nu trebuie să-l dubleze. Tiparul recomandărilor arată unde se poate salva după deduplicare, dar nu rezolvă această problemă: `recomandari` are unicitate `(campanie_id, lead_id)`, nepotrivită pentru participanți multipli.

## 3. „Contactat” nu dovedește disponibilitate confirmată

- **propunere — prioritate mare pentru studiul de piață:** păstrăm statusul operațional și verificarea preferințelor separat. Planul afirmă că statusul `contactat` înseamnă „confirmat la telefon”, dar o discuție poate duce la retragere, indecizie sau program incompatibil. Trecerea la `programat_demo`/`inrolat` ar pierde această dovadă dacă verificarea este derivată doar din status.
- **propunere:** câmpuri persistente `disponibilitate_confirmata_la`, `confirmata_de`, preferințe confirmate per participant și o regulă de invalidare la modificarea preferințelor. Scenariile numără persoane confirmate compatibile cu combinația aleasă, nu orice cerere contactată.
- **propunere:** zilele și intervalele trebuie să fie per participant. Două liste independente presupun toate combinațiile: „luni, joi” și „13–15, 17–19” nu dovedesc că omul poate luni seara dacă el poate doar luni la prânz și joi seara. Pentru MVP, matricile sunt estimări declarate, iar combinația exactă se validează la apel; pentru confirmare păstrăm perechi zi–interval.

## 4. Pragul 8 și algoritmul nu demonstrează viabilitatea închirierii

- **propunere — prioritate mare dacă rezultatul se folosește la închiriere:** etichetăm 8 ca reper existent, nu ca prag dovedit de lansare. `docs/reguli-domeniu.md:51–52` definește 8 cursanți PLĂTITORI (6 într-o sală anume), cu trei luni încheiate sub prag pentru propunerea suspendării. Opt preînscrieri nu sunt opt plătitori.
- **propunere:** pragul de lansare ține cont de costul spațiului, instructor, capacitate și transformarea interesului în înscrieri; poate rămâne reglabil, explicit ca ipoteză.
- **propunere:** greedy este sugestie de acoperire, nu orar fezabil sau optim. Poate alege simultan mai multe grupe în aceeași sală, ignora capacitatea, disponibilitatea instructorilor și a doua ședință săptămânală. „Două grupe în două ore” necesită durată și timp de schimb confirmate.
- **propunere:** înainte de exportul pentru închiriere, constructorul manual verifică suprapunerile, numărul de săli, capacitățile, durata, schimbul și frecvența săptămânală. Exportul include data și ipotezele; chiar fără tabel nou, se păstrează un snapshot al scenariului ales, ca următoarele cereri să nu schimbe retrospectiv justificarea.
- **propunere:** acoperirea în persoane distincte și cererea pentru două abonamente se raportează separat. Eliminarea completă a participantului după prima alocare ascunde intenția reală de cross-sell; nu permitem două clase simultane.

## 5. Leadurile pot rămâne în Nou tehnic, dar nu fără consecințe

- **propunere — prioritate operațională:** corectăm justificarea bazată numai pe `prune_expired_leads`. `leads_de_flagat_seara` din `20260919140000_nu_a_venit_apel_in_loc_de_sms.sql:130+` marchează leadurile noi după termenul primului apel; există și plasa celor trei încercări fără răspuns. Planul nu poate deduce politica întregului flux dintr-un singur cron.
- **propunere:** responsabilul și termenul de contactare pot rămâne deschise în dezvoltare, dar trebuie stabilite înainte de distribuirea flyerelor/reclamelor. Neavând recepție locală, campania are nevoie de o listă de lucru și de o stare „așteaptă programul” după contact, fără resetarea istoricului unui lead vechi.
- **propunere:** nu considerăm „excluderea din KPI” dovedită pentru reaplicări. Un lead existent poate păstra locația Ștefan/Nicolina; cererea nouă aparține Valea Lupului. Raportarea campaniei se bazează pe cerere/participant și data ei; nu pe locația și data originală a leadului.
- **propunere:** `locatie_label_match` poate permite filtrarea noii etichete, dar nu rezolvă singur cohorta reaplicărilor, participanții multipli sau mutările clienților existenți. Funnelul campaniei trebuie definit explicit.

## 6. Detalii de contract de completat

- **propunere:** nu interpretăm primul stil dintr-o listă multiplă ca preferință principală; ordinea checkboxurilor nu este prioritatea omului. Lista completă este sursa studiului; interesul singular poate fi o proiecție tehnică etichetată ca atare, cu maparea `Gimnastica` → `Acrobatică` din intake.
- **propunere:** păstrăm și `utm_campaign` pe cerere, alături de source/medium/content, plus legătura clară cu campania comercială; nu rescriem sursa inițială a leadului.
- **propunere:** participanți/contacte distincte nu înseamnă familii validate. Gruparea pe telefon se etichetează „contacte distincte” până la rezolvarea familiei reale.
- **propunere:** RPC-ul read-only și tabelul primesc autorizare explicită pentru stafful desemnat; „read-only” nu înseamnă că numele copiilor sunt date publice. Planul conține deja gardurile de rol, dar trebuie definite RLS și granturile efective, nu doar refuzurile.
- **propunere:** exportul/anonimizarea se verifică și pentru participanții încă neconvertiți, nu doar pentru clientul legat de `lead.id_client`; altfel datele unui frate pot fi exportate sau anonimizate ca ale celuilalt.

## Ordine recomandată

- **propunere:** 1) contractul participanților + salvare sigură; 2) LP, QR și lista de lucru; 3) centralizare și scenarii manuale, cu disponibilitate verificată; 4) identități rezolvate și DEMO Class; 5) automatizarea sugestiilor numai după stabilirea constrângerilor. Infrastructura locației complete continuă separat cu termen înainte de deschidere.
- **propunere:** corecțiile de mai sus sunt review și necesită integrare în planul lui Claude; nu sunt implementate și nu modifică deciziile lui Alex.
