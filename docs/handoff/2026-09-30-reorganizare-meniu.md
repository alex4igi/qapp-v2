# Reorganizarea meniului Qapp

**Stare:** parțial implementat de Claude 30.09.2026 (necomis) — etapa 1: Clienți+Familii sub un tab-bar, Rapoarte și Evenimente câte o intrare cu taburi, grup nou Echipă (Teacheri · Raport KPI · Scorecard CC · Salarizare), Prezențe/Evaluări la Cursuri, Opt-out ca tab lângă SMS. Owner/admin: 38 → 29 intrări, recepția 26 → 22. Rămân deschise: campaniile sezoniere, hub-ul Încasări, scurtăturile per rol, auditul Overview/Panou/Statistici. Ultima verificare: 2026-09-30.

## Mandat

- **confirmat de Alex:** dorește explorarea unui meniu mai compact și ușor de folosit, inclusiv pagini reunite și identificarea redundanțelor.
- **propunere:** structura și reunirile de mai jos. Alex nu a confirmat încă o variantă de implementat.

## Constatare și direcție

- **propunere — fundament observat în cod:** `navConfig.ts` conține 8 secțiuni și 40 de intrări înaintea filtrării pe rol/profil. Clienți și Rapoarte au câte 9. Administrare ascunde suplimentar 7 destinații în taburi. Numărul nu reprezintă toate rutele și nici meniul văzut de fiecare angajat.
- **propunere:** reducem numărul de alegeri concurente și clarificăm unde se găsesc lucrurile. Nu urmărim doar reducerea numărului de titluri de secțiuni. Meniul are deja acordeon; încă un nivel de acordeoane nu rezolvă orientarea.
- **propunere:** paginile reunite primesc navigare locală, păstrează URL-uri directe și încarcă doar vederea activă. Nu construim pagini lungi cu toate tabelele unul sub altul.

## Structură propusă

Fiecare rând este **propunere**. Destinațiile locale se deschid din pagina indicată; nu devin încă un nivel în meniul lateral.

| Secțiune | Intrări în meniul lateral | Destinații locale / observații |
|---|---|---|
| Azi | Acces direct la dashboard, deasupra secțiunilor | Scurtături la activitățile zilnice; păstrează grupele și rosterul actual |
| Clienți | Clienți; Înscrieri; De contactat | Clienți: Persoane, Familii, Contracte, Fișe incomplete. Înscrieri: Leads, Preînscrieri, Reînscrieri. De contactat: Absenți 21z, Feedback clienți |
| Cursuri | Grupe; Prezențe; Evaluări; Metodologie; Închirieri | „Grupe” este eticheta propusă pentru `/cursuri`; verificată cu vocabularul echipei înainte de schimbare |
| Bani | Încasări; Datorii; Facturare; Vouchere | Încasări reunește registrul Plăți și rapoartele operaționale descrise mai jos |
| Evenimente | O singură intrare | Navigare locală: Evenimente, Spectacole, Concursuri; procesele rămân distincte |
| Marketing | Campanii; Comunicare; Ofertă publică | Campanii: Campanii, Reconciliere ads, Recomandări. Comunicare: SMS, Opt-out |
| Echipă | Instructori; Pontaj; Salarizare și KPI | Instructori = Teacheri. Salarizare și KPI: salarii, raport KPI, grile KPI, activitate call-center, fiecare cu permisiunile proprii |
| Rapoarte | O singură intrare | Situația școlii (Overview), Evoluția sezonului (Panou), Statistici, Analiză financiară (CFO), Start de sezon |
| Administrare | O singură intrare | Setări, Inventar, Audit, Organizație |

- **propunere:** „Grupele mele” și „Salariul meu” rămân scurtături personale accesibile direct când sunt eligibile; nu obligăm instructorul să treacă prin meniul managementului. „Personal” poate deveni un mic bloc de scurtături, fără acordeon.
- **propunere:** toate destinațiile actuale sunt păstrate în această hartă; Anunțuri și Feedback aplicație rămân în meniul contului, notificările în accesul existent. Detaliile de client, familie, grupă, eveniment și editorii rămân accesibile contextual.
- **propunere:** structura are 8 domenii plus Azi, ca ordin de mărime apropiată de situația actuală. Beneficiul urmărit este micșorarea listelor din secțiuni, nu promisiunea că dispar modulele. Validăm în special secțiunea Echipă și vizibilitatea scurtăturilor zilnice.

## Ce reunim și ce nu este redundant

| Decizie | Pagini | Motiv și limită |
|---|---|---|
| **propunere:** un spațiu Clienți | Clienți + Familii + Contracte + Fișe incomplete | Aceleași dosare de lucru, perspective diferite. Familiile nu se elimină și nu se confundă cu persoanele. Fișele incomplete rămân manager+ |
| **propunere:** un spațiu Înscrieri | Leads + Preînscrieri + Reînscrieri | Un loc de intrare pentru înscrieri. Preînscrierile au și decizie de grupe, reînscrierile sunt campanie de sezon: nu sunt simple filtre pe leads. Agenția vede numai Leads |
| **propunere:** un spațiu Încasări | Plăți + Situație zilnică + Financiar | Navigare locală: Registru, Situație zilnică, Raport pe zile, Cash, Cheltuieli. Cheltuieli rămâne manager+. Datorii și Facturare rămân intrări directe |
| **propunere:** navigare comună Evenimente | Evenimente + Spectacole + Concursuri | Același domeniu, fluxuri diferite. Nu unificăm tabelele, producția spectacolului și înscrierea la eveniment |
| **propunere:** o intrare Rapoarte | Overview + Panou + Statistici + CFO + Start de sezon | Etichete clare și selecție locală. Statistici are deja 5 taburi: folosim selector de raport, fără încă un rând de taburi deasupra lor |
| **propunere:** o intrare Salarizare și KPI | Salarizare + Raport KPI + Grile KPI + Scorecard CC | Datele și acțiunile sunt distincte; raportul KPI și grilele nu sunt duplicate ale salariilor. Managerul păstrează raportul fără acces la salariile tuturor |

- **propunere — concluzie a inspecției:** nu există suficiente dovezi pentru a șterge acum o pagină ca redundantă. `/recuperare` este deja redirect către `/datorii`; `/contracte/sabloane` selectează deja un tab din Contracte. Sunt consolidări existente, nu economii noi.
- **propunere:** auditul redundanțelor reale începe cu Overview/Panou/Statistici și Situație zilnică/Raport pe zile/Cash. Comparăm întrebarea utilizatorului, acțiunile disponibile, sursa, perioada, locația și drepturile înainte de eliminarea unui tabel/card. Cifre asemănătoare nu dovedesc aceeași definiție.
- **propunere:** Overview rămâne situație operațională cu lucruri de urmărit; Panou este direcția sezonului; CFO include MRR, colectare, DSO și LTV. Putem unifica accesul fără să amestecăm aceste scopuri.

## Ușurință în folosire

- **propunere:** 3–4 scurtături fixe per rol deasupra meniului, păstrând explicit accesul la Situație zilnică și Datorii pentru recepție. Alegerea exactă se validează cu utilizatorii; nu avem telemetrie de utilizare în această analiză.
- **propunere:** păstrăm căutarea de clienți existentă; o căutare de pagini este un pas ulterior, dacă testarea arată că mai e necesară.
- **propunere:** maximum două alegeri din meniu până la o vedere frecventă, iar scurtăturile zilnice deschid direct vederea. Grupurile cu o singură destinație permisă nu cer un click intermediar.
- **propunere:** pe mobil păstrăm bara actuală de maximum 4 destinații + Meniu și lista explicită de pagini adaptate. Nu expunem toate noile grupări automat: `/situatie-zilnica` funcționează pe mobil, `/plati` nu este în lista actuală. Un hub comun nu trebuie să blocheze Situația sau să promită că întregul hub este adaptat.
- **propunere:** „De contactat” nu combină automat datele sau statusurile din absenți și feedback. Prima etapă este o intrare comună cu vederi separate; dacă echipa nu le percepe ca aceeași activitate, Feedback rămâne acces contextual în Clienți.

## Ordine de implementare după confirmare

1. **propunere:** începe cu trei schimbări ușor de evaluat: Clienți/Familii/Contracte, hub-ul Încasări și mutarea Pontaj/Salarizare/KPI în Echipă. Păstrează intrările actuale pentru celelalte domenii până la validare.
2. **propunere:** validează cu recepția găsirea unui client/familiei, contractele, situația zilei, datoriile și contactarea unui absent; cu managerul raportul KPI; cu instructorul prezența și salariul propriu. Acestea sunt scenarii de verificare, nu acțiuni de executat pe date reale.
3. **propunere:** aplică restul hărții dacă orientarea este mai bună. Abia după comparația datelor și funcțiilor elimină eventualele rapoarte duplicate.
4. **propunere:** la implementare, păstrează linkurile vechi, istoricul Back, tabul în URL, filtrele relevante și încărcarea la cerere. Testează desktop, mobil și modul „doar azi”. Păstrează separat restricțiile de rol, profil de instructor și fiecare acțiune; vizibilitatea hub-ului nu acordă drepturi la toate paginile sale. Landing-ul alege prima vedere permisă și compatibilă cu dispozitivul.

## Dovezi și limite

- **propunere — bază de verificare pentru Claude:** `src/components/layout/navConfig.ts`, `Rail.tsx`, `AdministrareLayout.tsx`, `src/App.tsx`, `src/lib/rolesMatrix.ts`, `src/lib/mobileMatrix.ts`, `mobile/MenuSheet.tsx`, `mobile/BottomNav.tsx`.
- **propunere — bază funcțională:** paginile din `features/financiar`, `cfo`, `analytics`, `ansamblu`, `statistici`, plus titlurile și structurile din `plati`, `situatie-zilnica`, `preinscrieri`, `reinscrieri`, `salarizare`, `raport-kpi`, `scorecard`; reguli de domeniu din `docs/reguli-domeniu.md`.
- **propunere — limită:** analiza este structurală, pe codul local. Nu am măsurat frecvența folosirii, verificat vizual aplicația, demonstrat echivalența rapoartelor sau modificat codul aplicației. Claude verifică structura reală și permisiunile înainte de implementare.
