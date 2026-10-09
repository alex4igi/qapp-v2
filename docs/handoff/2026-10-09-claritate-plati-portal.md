# Claritatea plăților în portalul de membri

**Stare:** deschis — 2026-10-09. Analiză pe codul local; fără verificare în producție sau pe contul clientului. Nicio modificare de aplicație/DB.

## Cerință

- **confirmat de Alex:** un client a înțeles că trebuie să achite toate ratele până la sfârșitul sezonului; Alex cere propuneri pentru a diferenția ce e achitat, restant și încă nescadent. Soluția de mai jos nu este încă aprobată.

## Constatări care fundamentează propunerea

- **propunere — diagnostic din cod:** `../qapp-membri/src/features/plati/PlatiPage.tsx` separă deja în „Sold familie” restanțele, următorul termen și ratele ulterioare. Totuși, antetul listei pe sezon însumează toate ratele neplătite în „rest”; colorează întregul total roșu când măcar un rând este restant. Aceasta este o posibilă sursă de confuzie, nu o cauză verificată pe contul clientului.
- **propunere — diagnostic din cod:** `SezonulMeu.tsx` prezintă „Cost sezon / Plătit / Rămas”, deasupra listei de plată. „Rămas” include viitorul. Ratele viitoare nu au o etichetă explicită de status. La plata parțială, explicația „rest din…” înlocuiește data-limită în acest card.
- **propunere — diagnostic din cod:** oferta „Plătește tot sezonul dintr-o dată”, când este eligibilă, apare înaintea fluxului obișnuit de plată; poate întări impresia că plata integrală e așteptată.

## Prezentare recomandată

- **propunere:** prima zonă răspunde la „Ce am de achitat și până când?”. Afișează separat „Restanțe — termen depășit” (roșu, doar restanța reală) și „Următoarea plată — până la [data]” (neutru). În ziua scadenței: „De achitat azi”. Fără restanțe: „Nu ai restanțe”, chiar dacă există rate viitoare. Nu utiliza „Nu ai nimic de plată” când există obligații viitoare.
- **propunere:** text permanent lângă rezumat: „Abonamentul se achită în rate, la termenele afișate. Nu trebuie să achiți acum toate ratele sezonului.” Pentru înrolările „Per an”, folosește un text adaptat, fără promisiunea plății lunare.
- **propunere:** liste distincte: (1) Restanțe; (2) Următoarea plată; (3) Rate viitoare — nu sunt de achitat acum, restrâns implicit; (4) Achitate, cu acces vizibil la istoric. Ratele viitoare includ doar rândurile de după următorul termen, fără dublarea acestuia. Suma întregului sezon rămâne în detaliul „Vezi situația sezonului”, cu eticheta „Total rămas până la finalul sezonului — include rate viitoare”.
- **propunere:** fiecare rând arată membru, curs, perioada, termenul exact și suma rămasă. Înlocuiește „100 / 270 lei” cu „Achitat: 100 lei · Mai ai de achitat: 170 lei”. Păstrează termenul vizibil inclusiv la plăți parțiale.
- **propunere:** statusurile principale sunt „Achitat”, „Restant”, „De achitat azi”, „Urmează până la [data]”, „Rată viitoare”. „Achitat parțial” este o informație suplimentară: aceeași rată poate fi parțial achitată și restantă. Nu ascunde întârzierea sub statusul „Parțial”. Pentru sold zero din credit/reducere, nu pretinde că s-au încasat bani: „Acoperit integral”, cu explicația disponibilă în date.
- **propunere:** etichetele exprimă statusul și fără culoare; roșu numai pentru sumele efectiv restante. „Restant din [scadență]” devine „Termen depășit · scadență [data]”, deoarece scadența însăși nu este zi de întârziere.
- **propunere:** plata integrală devine o opțiune secundară, „Opțional: achită sezonul în avans”, sub plata obișnuită sau într-un panou restrâns. Eligibilitatea/reducerea rămân cele calculate de server.

## Selecție și coerență

- **propunere:** rezumatul familiei și plata membrului trebuie delimitate explicit: „Situația familiei” vs. „Plătești pentru [nume]”. Nu pune un buton pentru un singur membru lângă totalul familiei fără această precizare.
- **propunere:** înainte de trimiterea la Netopia arată „Vei plăti X lei pentru [nume]”, cu defalcare restanțe / următorul termen / avans, numai din rândurile selectate. Plata în avans se include doar după acțiunea explicită a clientului. Dacă următorul termen este îndepărtat (de exemplu toate lunile apropiate sunt achitate), prezintă-l informativ și oferă „Plătește în avans”; nu îl prezenta ca datorat acum. Pragul pentru eventuala preselectare trebuie decis separat; nu inventa unul la implementare.
- **propunere:** respectă FIFO din server. Separarea vizuală nu schimbă ordinea de alocare. Când alegerea unei rate adaugă alte rânduri obligatorii (inclusiv alte cursuri sau secțiuni ascunse), prezintă explicit toate rândurile și noul total înainte de plată. Nu promite plata izolată a unei categorii dacă motorul nu permite acest lucru.
- **propunere:** include taxele, biletele și celelalte obligații în aceleași categorii de termen; păstrează regulile lor de plată integrală. Erorile/încărcarea nu trebuie afișate ca „Nu ai restanțe”. O plată online în curs nu este „Achitat” până la confirmarea serverului.

## Implementare etapizată și verificare

- **propunere:** prima intervenție: elimină „rest” global colorat roșu, redenumește „Rămas”, adaugă explicația despre rate și etichetele viitoare, păstrează termenul la plata parțială, mută oferta integrală în secundar. A doua intervenție: reorganizarea listelor și a selecției conform propunerii aprobate.
- **propunere:** Claude verifică RPC-urile și datele reale înainte de implementare. Scadențele și sumele rămân canonice în DB; fără calcule financiare alternative în browser. Aplică regulile din `docs/reguli-domeniu.md` §4, inclusiv scadență strict anterioară zilei curente pentru restanță, fus Europe/Bucharest și istoricul achitat după reziliere.
- **propunere:** verificare pe mobil: fără restanțe + rata lunii; restanță + rata lunii + viitor; ziua scadenței; plată parțială înainte/după termen; luni achitate în avans; tot sezonul achitat; doi membri și mai multe cursuri; taxe one-off; credit; istoric după reziliere; eroare de încărcare; plată online în curs. Verifică acordul sumelor între Acasă, meniu, rezumat și checkout. După implementare: type-check, build și smoke test conform instrucțiunilor repo-ului.
