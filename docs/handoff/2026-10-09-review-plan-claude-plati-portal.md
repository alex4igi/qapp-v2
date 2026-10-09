# Review plan Claude — reproiectare plăți portal

**Stare:** deschis — 2026-10-09. Review pe planul `/Users/alex_igi/.claude/plans/in-baza-claritatii-platilor-crispy-engelbart.md` și codul local; fără acces la DB/live, fără modificări de cod.

- **confirmat de Alex:** solicită părerea Codex despre plan. Deciziile anterioare de plată unică pe familie și prototip sunt consemnate de Claude în plan; review-ul le tratează ca scop declarat, fără a pretinde reconfirmare directă în această conversație.
- **propunere — verdict:** direcție bună; se poate continua cu prototipul, după clarificările UX de mai jos. Etapa financiară B necesită completarea contractului de intrare și a testelor înainte de implementare.

## 1. Restanța din badge nu este totalul coșului

- **propunere — prioritate ridicată:** elimină cerința „Acasă = badge = coș” din C și verificare. Badge-ul din `AppLayout.tsx` citește restanța, conform regulii de domeniu. Totalul coșului poate include următorul termen și rânduri nescadente incluse prin FIFO. Egalitatea corectă: restanța din Acasă = restanța din Plăți = badge; suma de pe butonul Acasă = coșul inițial corespunzător aceleiași selecții/date. După editarea coșului, totalul se schimbă legitim.

## 2. Preselecția trebuie definită, nu dedusă la implementare

- **propunere — prioritate ridicată:** definește dacă „următoarea plată” înseamnă primul termen al familiei sau primul termen al fiecărui membru. Exemplu obligatoriu: Ana are de achitat pe 15 octombrie, Mihai este achitat până în februarie. Coșul nu trebuie să includă automat februarie doar fiindcă este următoarea lui rată. Precizează și cazul în care toată familia este achitată cu luni în avans.
- **propunere:** recomand primul termen al familiei pentru secțiunea „Următoarea plată”, iar un termen îndepărtat să fie informativ, cu plată explicită în avans. Regula exactă a preselecției să fie vizibilă în prototip și aprobată, inclusiv obligațiile one-off.
- **propunere:** nu promite absolut „avans numai dacă îl bifezi” în condițiile în care FIFO poate adăuga rânduri nescadente. Distinge avansul ales de rândurile incluse obligatoriu în selecție: „Pentru a achita această ședință se include și abonamentul din aceeași lună: 180 lei, cu termen 15 octombrie”. Afișează-le chiar dacă secțiunea viitoare este închisă. Motorul include și rândurile cu aceeași dată ca limita, nu doar date strict mai vechi (`build_fifo_plan_membru`, migrația `20260713120000`).

## 3. Contractul plății pe familie trebuie să excludă dublurile și ambiguitățile

- **propunere — prioritate ridicată:** `p_selectie` trebuie să valideze lista nevidă, client nenul și unic, apartenența fiecărui client la familia apelantului și referințele selectate. Un copil repetat nu trebuie să concateneze de două ori același plan. Fiecare enrollment/datorie apare cel mult o dată. Totalul comenzii = suma articolelor; `client_id` pe articol este produs de server, nu acceptat ca dovadă de proprietate din browser.
- **propunere:** definește selecția goală explicit. În funcția existentă, `p_pana_la = null` și `include_inrolari = true` înseamnă toate ratele, nu zero rate. Wrapperul trebuie să păstreze distincția. Respinge combinații ambigue între `membri`, fluxul vechi, rezervări/bilete și plata integrală.
- **propunere:** previzualizarea și inițierea folosesc același motor; dacă suma/articolele se modifică între ele, clientul vede noul coș înainte să continue spre procesator. Nu presupune că aceeași funcție garantează același rezultat la două momente diferite.

## 4. Verificarea financiară trebuie extinsă

- **propunere — prioritate ridicată:** pe lângă două încasări corect atribuite, testează: copil din altă familie; copil duplicat; selecție goală; datorie/înrolare străină; webhook repetat; comandă veche; schimbarea soldului după preview; restituire parțială și integrală pe comandă cu doi copii; factură și storno cu atribuirea corectă a liniilor. Include în testul real/sandbox comanda multi-membru, nu doar o plată generică de 1 leu.
- **propunere:** faptul că `netopia_orders.client_id` rămâne primul copil păstrează forma schemei, dar nu dovedește corectitudinea tuturor consumatorilor. Verifică autorizarea citirii comenzii, factura, restituirile și rapoartele pentru întreaga familie. Planul identifică deja câțiva consumatori; tratează verificarea ca obligatorie, nu ca simplă schimbare de etichetă.
- **propunere:** date sintetice în prototip. Testele care confirmă comenzi și inserează încasări să fie în mediu izolat; nu adăuga bani fictivi în rapoartele live. Cei 923 lei existenți sunt menționați în plan, nu verificați de acest review; Claude trebuie să verifice și efectele auxiliare ale curățeniei (facturare, audit, notificări), nu doar ștergerea familiei.

## 5. Ajustări de limbaj și acoperire

- **propunere:** „membru” în loc de „copil” ca termen universal: portalul include și adulți. Textul permanent despre rate trebuie adaptat pentru abonamente „Per an” și facultative.
- **propunere:** la facultative, „Total rămas până la finalul sezonului” poate sugera că sunt incluse cursuri încă necumpărate; precizează „Pentru înscrierile existente” sau separă abonamentele sezoniere de facultative.
- **propunere:** grupează reducerile doar dacă membrul, cursul, prețul, reducerea și intervalul sunt compatibile; nu ascunde luni cu sume diferite sub un singur tarif lunar.
- **propunere:** păstrează verificările din handoff-ul inițial omise din scenariile prototipului: credit/reducere integrală (nu pretinde încasare), istoric achitat după reziliere, familie cu adult și copil și scadențe diferite. Plata integrală per membru rămâne o excepție explicită la promisiunea coșului unic; prototipul trebuie să arate dacă aceasta este o tranzacție separată.
