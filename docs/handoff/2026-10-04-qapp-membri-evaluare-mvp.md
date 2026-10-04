# qapp-membri — evaluare MVP pentru Quasar Dance

**Stare:** parțial implementat (Claude, 04.10.2026) — punctele 1–6 livrate local, 7–8 rămân deschise.

## Rezultat (Claude, 04.10.2026)

Plan revizuit de Codex în `2026-10-04-review-plan-claude-mvp-membri.md`, `…-review-update-plan-mvp-membri.md`,
`…-verdict-plan-mvp-membri.md`. Implementat:

- **1 + 5 Calendar și „Ce urmează” pe Acasă:** RPC nou `get_sedinte_membru` (migrația `20261004220000`). Exclude
  vacanțele, lunile suspendate și ce e după `data_reziliere`, folosește ora pe zi și pune OPEN-urile confirmate o singură
  dată. Calendarul face un apel pe sezon. Acasă arată următoarele ședințe pe 14 zile, pentru toată familia.
- **2 Stări pe Acasă:** încărcare / eroare cu „Reîncearcă” / gol, distincte; la eroare nu mai scrie „achitat”.
- **3 Rezultatul plății:** componentă comună `RezultatComanda` (/plati + /rezervari). Stările tratate: confirmată,
  în procesare, eșuată, eroare la citire, comandă negăsită. Referința rămâne în URL până la starea finală.
- **4 Prezențe:** procentul scos; rămâne numărul de prezențe bifate.
- **6 Bani:** RPC nou `get_rezumat_plati_familie` (rate + datorii one-off, scadență canonică). „Restant” e doar termen
  trecut; următorul termen și ratele viitoare apar separat. /plati arată perioada și scadența pe fiecare rând.
  `get_plati_client` are coloana `scadenta`.

**Verificat:**
- **Securitate:** `check-anon-rpc`, `check-rls-*` verzi. Teacher, marketing, front_desk și anon sunt refuzați
  (42501). Izolarea a fost verificată pe toate cele 9 familii cu cont: zero rânduri străine.
- **SQL:**
  - zero ședințe în cele 4 vacanțe ale sezonului;
  - `ore_pe_zi` respectat;
  - OPEN suprapus pe abonament afișat o singură dată;
  - clientul cu datorie one-off și sold 0 apare acum restant.
- **Playwright:** pe fixture-ul ZZTEST, șters la final.

**Rămân deschise:** 7 (ajutor/contact în aplicație; Valea Lupului nu are telefon — nu e defect), 8 (anunțuri pe Acasă).

**confirmat de Alex:** solicitarea este compararea portalului existent cu nevoile unui MVP pentru studioul nostru. Nicio funcție nouă sau prioritate de implementare nu este încă aprobată.

**propunere:** toate constatările și prioritățile de mai jos sunt pentru validare de către Alex și verificare de către Claude înainte de implementare. „Observat” înseamnă citit în codul local, nu testat în producție. Nu am autentificat conturi, executat tranzacții, verificat DB live sau făcut smoke test vizual. Documentația spune că portalul este în producție; echivalența cu checkout-ul local nu a fost verificată.

## Verdict

**propunere:** nucleul MVP este suficient de bogat. Pentru familii și adulți, portalul acoperă deja gestionarea relației cu școala: acces, copii, cursuri, bani, documente, rezervări și evenimente. Următorul pas util este claritatea și încrederea în aceste fluxuri, înaintea extinderii numărului de module. Criteriul: părintele află când vine copilul, ce are de achitat, dacă plata a reușit și cui cere ajutor.

## Ce există efectiv

Fiecare rând: **propunere** — inventar observat în cod, de validat în mediul live.

| Nevoie | Acoperire în cod | Evaluare MVP |
|---|---|---|
| Acces familie / adult | Login, resetare, schimbare parolă temporară, selecție membru | Suficient; lipsește explicația accesului pentru cine nu are cont |
| Cursurile copilului | Grupe, instructori, sală, program, valabilitate, istoric pe sezoane | Bun |
| Evoluția copilului | Prezențe, activitate, evaluări pe abilități și feedback | Deja peste strictul minim; corectat sensul ratei de prezență |
| Bani | Sold familie/membru, rate, achitat/rest, FIFO, datorii separate, reduceri, ofertă sezon integral | Bogat; scadențele și confirmarea tranzacției trebuie explicate mai bine |
| OPEN | Locuri disponibile, rezervare, voucher, plată, urmărirea stării comenzii | Bun; traseu de ajutor pentru anulare/incident |
| Evenimente | Cumpărare bilete și lista biletelor membrului | Există deja, deși inventarul din AGENTS nu o reflectă complet |
| Program | Calendar sezon, vacanțe, evenimente și rezervări | Corectitudinea zilelor fără curs este prioritară |
| Documente | Semnare, descărcare documente, adeverință | Suficient; actele de semnat ar merita aduse pe Acasă |
| Profil | Date familie/membru, date de firmă pentru facturare, opt-out | Facturarea lunară/la altă persoană este explicit dezactivată, nu funcție lipsă de construit |
| Comunicare | Clopoțel, anunțuri, contact public, feedback portal | Există; ajutorul operațional poate fi mai ușor de găsit |

Surse: `../qapp-membri/src/features/`, `src/App.tsx`, `src/components/layout/AppLayout.tsx`, `src/hooks/useActiveMember.tsx`.

## Prioritatea 1 — corectitudine înainte de extindere

### 1. Calendar fără ședințe fictive

**propunere:** remediere prioritară. `features/calendar/api.ts:buildItems` generează recurențe din zilele grupei și intervalul înrolării, fără să primească vacanțele. `CalendarPage.tsx` marchează separat vacanța, dar afișează în continuare elementele zilei. O zi poate arăta simultan vacanță și curs obișnuit. Rezervările OPEN au `time: null` și apar fără oră.

Acceptare: o zi de vacanță nu afișează automat curs recurent; un eveniment sau OPEN organizat explicit în vacanță rămâne vizibil; o rezervare arată ora și locul. Claude verifică și sursa pentru anulări/mutări punctuale înainte de a introduce alt mecanism. Nu presupunem că vacanța anulează orice eveniment.

### 2. Date neîncărcate ≠ totul achitat

**propunere:** remediere prioritară. `features/dashboard/AcasaPage.tsx` reduce `sold.data ?? []` la zero și afișează „Totul e achitat” inclusiv înaintea încărcării sau după un eșec fără date. Există toast global de eroare în `main.tsx`, dar mesajul pozitiv rămâne contradictoriu. Model asemănător pentru lipsa ședințelor disponibile și unele stări goale.

Acceptare: încărcare, eroare și rezultat gol sunt distincte în cardurile relevante; la eroare există reîncercare și nu se afirmă că soldul este zero.

### 3. Rezultatul real al plății abonamentelor

**propunere:** aliniere cu fluxul OPEN deja existent. `features/plati/PlatiPage.tsx` detectează `order`, invalidează query-urile, elimină parametrul și arată mesaj generic „Plata a fost inițiată”. Nu folosește urmărirea stării comenzii din `features/rezervari/RezervariPage.tsx` / `api.ts`. Dacă webhook-ul vine după recitirea soldului, mesajul nu rezolvă singur incertitudinea.

Acceptare: confirmată / în procesare / eșuată / anulată, referință pentru recepție, actualizarea soldului după confirmare și instrucțiune clară când confirmarea întârzie. Reutilizat contractul existent de status unde backend-ul permite; fără a deduce succesul numai din redirect.

### 4. Prezențe care nu induc în eroare

**propunere:** afișarea prezențelor înregistrate este utilă, dar „Rată prezență” din `features/prezente/PrezenteSection.tsx` este calculată numai din rândurile Prezent + Absent. `docs/reguli-domeniu.md` precizează că absențele sunt incomplet bifate. 100% nu dovedește participare la toate ședințele.

Acceptare MVP: eliminarea procentului sau etichetă explicită „din ședințele cu prezența înregistrată”; fără transformarea automată a lipsurilor de date în absențe. Nu este necesar un motor statistic nou.

## Prioritatea 2 — completări mici cu utilitate zilnică

### 5. Acasă: următoarea ședință și acțiunile importante

**propunere:** în loc ca programul propriu să fie doar un link către calendar, afișăm următoarea ședință reală: copil, zi, oră, sală, locație. Pentru familii, rezumat cu numele copilului pe fiecare intrare. Alături: de achitat la următorul termen, document de semnat dacă există și anunț important. OPEN rămâne disponibil, dar nu înlocuiește programul la care familia este deja înscrisă.

Acceptare: un părinte cu doi copii poate afla programul apropiat fără comutări repetate. Folosim aceeași sursă de calendar corectată la punctul 1.

### 6. Cât plătesc și până când

**propunere:** separăm „restant”, „de achitat până la [data]” și „rate viitoare”. Modelul `PlataRow` și rândurile UI arată data începerii, nu scadența fiecărei rate. Soldul global nu răspunde singur la întrebarea „ce trebuie plătit acum?”. Nu afirmăm că toate sumele din sold sunt restante.

Acceptare: scadențe calculate de backend cu regulile comune; ratele viitoare nu apar ca întârziate; perioada, copilul și alocarea sumei sunt clare înainte de plată. Datele și reducerile nu se recalculează separat în browser.

### 7. Ajutor operațional și intrarea în cont

**propunere:** text scurt pe login: cine primește cont, cum îl solicită și ce face dacă lipsește un copil. În cont: acces evident la recepția potrivită, cu copilul/cursul precompletat în mesaj unde este posibil. Feedback-ul actual este orientat spre problemele portalului, nu înlocuiește întrebări despre absență, schimbare grupă ori rezervare.

Acceptare MVP: telefon/WhatsApp/email și un mesaj pregătit sunt suficiente; fără sistem nou de chat sau ticketing. Anunțarea absenței este o informare, fără promisiune implicită de recuperare sau reducere. Legarea unui copil la familie rămâne validată de staff.

### 8. Anunțurile importante trebuie observate

**propunere:** expunerea anunțului relevant pe Acasă, mai ales pentru schimbări de program. Clopoțelul există deja. Pentru urgențe se păstrează canalul operațional existent; nu presupunem că părinții deschid zilnic portalul și nu cerem push nativ în MVP.

## Limita MVP

**propunere:** nu includem în acest lot galerie/video, mesagerie proprie, fidelizare, checkout merch, suspendare automată ori gestionarea liberă a familiei. Acestea extind suportul, regulile și mentenanța. Există deja idei similare în `docs/idei-versiuni-viitoare.md`; prezentul handoff nu le aprobă și nu le schimbă starea. Reînscrierea self-service trebuie evaluată la pregătirea următorului sezon, nu să blocheze folosirea actuală.

**propunere:** pentru trupe, verificăm cu recepția dacă informațiile pentru concurs/spectacol sunt suficient acoperite de evenimente și anunțuri (oră sosire, loc, echipament, termen de plată). Nu presupunem necesitatea unui modul nou de concursuri sau costume în MVP.

## Validare înainte de a declara MVP suficient

**propunere:** probă ghidată cu părinte cu doi copii, adult individual și familie de trupă; verificat pe telefon: primul login/resetare, schimbarea membrului, zi de vacanță, program OPEN, plată confirmată/eșuată/cu confirmare întârziată, document și cerere de ajutor. Izolarea între două familii și lipsa dublării încasărilor rămân verificări obligatorii ale fluxurilor existente, nu funcții noi.

**propunere:** ordinea predării către Claude: punctele 1–4, apoi 5–8. Alex aprobă scope-ul; Claude verifică situația live și implementarea existentă. Evaluăm rezultatul prin întrebările rămase la recepție și capacitatea familiilor de a finaliza aceste sarcini, fără a inventa procente de adopție sau estimări de efort nevalidate.
