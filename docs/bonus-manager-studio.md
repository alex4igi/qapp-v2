# Salarizarea managerului de studio — bază fixă + bonus pe încasări + bonus pe ocupare

> **Stare:** reguli decise de Alex pe 14 sept. 2026, revizuite pe **17 sept. 2026**
> (capacitatea se fixează la începutul sezonului) și pe **25 sept. 2026**. **IMPLEMENTAT în aplicație
> pe 25 sept. 2026, în test** — vezi §9.
>
> ⭐ **Deciziile din 25 sept. 2026** (Alex): **Q4K rămâne fără manager deocamdată** · **septembrie 2026:
> ocuparea la standard** (2 lei × locuri), ca la instructori · capacitatea = grupele sezonului care au
> funcționat măcar o lună de la start, **păstrată efectiv** într-un pool (§3).
>
> ⭐ **SUMELE SUNT NETE** (Alex, 23 sept. 2026) — ca la [instructori](./grila-salarizare-instructori.md)
> și la [recepție](./grila-front-desk.md). Materialele care scriau „brute" au fost corectate.
> Înlocuiește complet simularea din 9 sept. (bonusul ca procent din KPI-ul instructorilor, fără bază).
> Documentul e sursa de adevăr — orice decizie nouă se scrie aici.

## Cine e manager

| Locație | Manager |
|---|---|
| Galeriile Ștefan cel Mare | Andrei Chiriac |
| Nicolina | Alin Stoleru — **doar Nicolina** |
| Quasar 4 Kids | **fără manager deocamdată** (Alex, 25 sept. 2026) |

Managerii care predau își iau salariul de instructor separat, după
[grila instructorilor](./grila-salarizare-instructori.md). Salariul de manager se adaugă peste.

## 1. Baza fixă

**Punctul de lucru = locația**, nu sala. Primul punct aduce 1.000 lei, al 2-lea și al 3-lea câte 70%,
al 4-lea și al 5-lea câte 50%.

| Puncte de lucru | Calcul | Bază |
|---|---|---|
| 1 | 1.000 | 1.000 |
| 2 | 1.000 + 700 | 1.700 |
| 3 | 1.000 + 700 + 700 | 2.400 |
| 4 | 1.000 + 700 + 700 + 500 | 2.900 |
| 5 | 1.000 + 700 + 700 + 500 + 500 | 3.400 |

Baza se plătește **12 luni pe an**, inclusiv vara.

## 2. Bonusul pe încasări

**Rata de încasare a lunii M** = banii plătiți **până la finalul lunii M+1** pentru ratele lunii M,
împărțiți la ratele lunii M. Exemplu: la 31 octombrie se verifică septembrie, iar bonusul pentru
septembrie se dă atunci.

- **Ratele lunii** = înrolările cu `data_incepere` în luna M, `suma > 0`, nereziliate înainte de
  începutul lunii. Rezilierea se citește pe `data_reziliere`, **nu** pe flagul `reziliat` (e bifat și
  pe lunile încheiate — vezi §5 din grila instructorilor).
- **Suma pe care se aplică procentul** = **toate încasările din luna M la locație**
  (`incasari.locatie`, după data plății): abonamente (inclusiv restanțe vechi recuperate și plăți în
  avans), bilete la evenimente, workshop-uri, audiții, taxe, închirieri, merchandise.
  Scopul declarat: managerul e încurajat să recupereze datoriile.

| Treaptă | Rata de încasare | Bonus |
|---|---|---|
| Peste standard | ≥ 95,01% | 1% din încasări |
| În standard | 92,00% – 95,00% | 0,7% din încasări |
| Sub standard | 90,00% – 91,99% | 0,5% din încasări |
| Insuficient | ≤ 89,99% | 0 |

⚠️ Rata și suma nu măsoară aceiași bani, iar diferența e voită. Rata privește doar ratele lunii,
suma cuprinde tot ce a intrat. Dacă și rata s-ar calcula pe tot ce a intrat, ar ieși mereu în jur de
98–102% (restanțele și avansurile acoperă golurile), deci treapta n-ar mai spune nimic.

## 3. Bonusul pe ocupare

**Ocuparea lunii M** = clienți / capacitatea totală, pe locație.

- **Clienți = locuri ocupate:** se adună locurile ocupate ale fiecărei grupe în luna M — un copil
  înscris la 2 grupe se numără **de 2 ori**. Definiția e una singură în SQL: `locuri_ocupate`
  (lunar: `cursanti_platitori_luna`).
- **Ședința se numără o singură dată, în luna în care a fost ținută** (Alex, 16 sept. 2026: „nu vreau
  să plătesc 2 luni pentru 1 ședință facultativă"). Regula de 30 de zile — ședința ține locul 30 de
  zile de la data ei — rămâne doar la ocuparea de AZI, de pe Overview și din liste; bonusul se
  calculează pe lună. Abonamentul intră în fiecare lună pe care o acoperă fereastra lui. Rezervările
  anulate și rezilierile nu se numără.
- ⭐ **Capacitatea totală se fixează la începutul sezonului** (Alex, 17 sept. 2026) — „bonusul pe
  capacitate se face pe numărul de clienți, stabilit la începutul sezonului". Se calculează o dată,
  ca sumă a `cursuri.capacitate_maxima` a grupelor locației la începutul sezonului, și **rămâne
  același numitor în toate lunile sezonului**. NU se mai recalculează lunar. Grupele goale intră și
  ele în capacitate.
- **O grupă nouă deschisă pe parcurs se adaugă la pool**, din luna în care pornește (Alex, 17 sept.).
  O grupă închisă pe parcurs **nu scade pool-ul** — vezi nota internă de mai jos.
- **Open Class** intră ca orice curs facultativ: fiecare rezervare plătită se numără în luna ședinței,
  iar capacitatea lui (30) intră la capacitate. Regula veche — media participanților pe ședință — a
  fost înlocuită pe 15 sept.
- Intră trupele și cursurile facultative. Cursurile one-time nu intră.
- Același număr de clienți se folosește și la ocupare, și la înmulțirea cu leii din treaptă.

| Treaptă | Ocupare | Bonus |
|---|---|---|
| Peste standard | ≥ 80,01% | 3 lei × clienți |
| În standard | 60,00% – 80,00% | 2 lei × clienți |
| Sub standard | 40,00% – 59,99% | 1 leu × clienți |
| Insuficient | ≤ 39,99% | 0 |

### 🔒 Notă internă — NU se publică în materialele pentru manageri

> **Actualizat 25 sept. 2026 (Alex):** regula în sine **se publică** în materialele pentru manageri, cu
> formularea lui: „începem cu un pool, iar dacă pe parcurs se mai adaugă o grupă, și-o asumă în pool până
> la sfârșitul sezonului" (pagina de reguli a managerilor din artifact, §3). Rămâne intern doar
> **motivul** de mai jos.

**Pool-ul poate crește, dar nu poate scădea.** Dacă în timpul sezonului se închid grupe, capacitatea
rămâne cea stabilită la începutul sezonului. Motivul, spus de Alex pe 17 sept. 2026 explicit ca notă
internă: altfel managerul își urcă ocuparea **închizând grupe** — taie numitorul, deci pool-ul de
oameni, și ia bonus mai mare cu mai puțini clienți. În materialele pentru manageri se scrie doar
„capacitatea se stabilește la începutul sezonului"; motivul rămâne aici.

**De implementat:** capacitatea sezonului stă într-un snapshot per (locație, sezon), nu se citește
live din `cursuri` la fiecare rulare; grupele deschise ulterior îl cresc, cele închise nu îl scad.

## 4. Granițele treptelor

Procentele se **rotunjesc la 2 zecimale** înainte de comparație, iar treptele sunt despărțite la
0,01% (Alex, 14 sept.). Unde regula inițială punea același număr în două trepte („92–95" și
„90–92", „60–80" și „40–60"), valoarea exactă intră în treapta de sus: **92,00% = în standard**,
**60,00% = în standard**.

## 5. Vara (iulie–august)

Se plătește **doar baza**. Bonusurile de vară vor fi altele — **încă nedefinite**.

## 6. Simulare pe sezonul 2025-2026

Rulată pe 14 sept. 2026, pe datele din DB. Luni de sezon: septembrie–iunie. Vara: doar baza.

| Luna | Andrei — Ștefan | Alin — Nicolina | Roxana — Q4K |
|---|---|---|---|
| sept. 2025 | 1.000 + 425 + 245 = **1.670** | 1.000 + 137 + 0 = **1.137** | 1.000 + 25 + 32 = **1.057** |
| oct. | 1.000 + 798 + 722 = **2.520** | 1.000 + 328 + 162 = **1.490** | 1.000 + 0 + 41 = **1.041** |
| nov. | 1.000 + 894 + 826 = **2.720** | 1.000 + 392 + 165 = **1.557** | 1.000 + 0 + 40 = **1.040** |
| dec. | 1.000 + 843 + 770 = **2.613** | 1.000 + 324 + 158 = **1.482** | 1.000 + 0 + 0 = **1.000** |
| ian. 2026 | 1.000 + 937 + 1.350 = **3.287** | 1.000 + 404 + 174 = **1.578** | 1.000 + 0 + 47 = **1.047** |
| feb. | 1.000 + 837 + 830 = **2.667** | 1.000 + 389 + 183 = **1.572** | 1.000 + 0 + 52 = **1.052** |
| mar. | 1.000 + 684 + 866 = **2.550** | 1.000 + 296 + 176 = **1.472** | 1.000 + 0 + 90 = **1.090** |
| apr. | 1.000 + 803 + 1.353 = **3.156** | 1.000 + 360 + 169 = **1.529** | 1.000 + 0 + 38 = **1.038** |
| mai | 1.000 + 1.139 + 1.455 = **3.594** | 1.000 + 481 + 193 = **1.674** | 1.000 + 0 + 39 = **1.039** |
| iun. | 1.000 + 0 + 886 = **1.886** | 1.000 + 0 + 185 = **1.185** | 1.000 + 0 + 32 = **1.032** |
| iul.–aug. | 1.000 / lună | 1.000 / lună | 1.000 / lună |
| **Medie în sezon** | **2.666** | **1.468** | **1.044** |
| **Total pe an** | **28.663** | **16.676** | **12.436** |

Format celulă: bază + bonus încasări + bonus ocupare. Cost total pentru club: **57.775 lei/an**.

**Ce arată simularea:**

1. **La Ștefan și Nicolina pragul de încasare e bine pus.** 8 luni din 10 au ieșit peste standard, dar
   la Ștefan jumătate dintre ele au trecut de 95% cu mai puțin de un punct (95,4–95,9%). Martie a
   ieșit în standard la ambele (94,3% / 94,5%). **Iunie iese insuficient la ambele** (84,3% / 89,97%):
   ratele de final de sezon se plătesc cel mai prost. Nicolina a pierdut treapta la 0,03 puncte.
2. **La Q4K pragul e aproape de neatins:** 9 luni din 10 sub 90% (71–87%, iunie 42%). Banii vin, dar
   târziu: noiembrie 2025 era la 81% pe 31 decembrie și a ajuns la 97% azi. Acolo treapta măsoară cât
   de repede plătesc familiile.
3. **Ocuparea desparte locațiile:** Ștefan 62–86% din octombrie până în iunie (standard sau peste,
   722–1.455 lei). Nicolina 49–57% (mereu sub standard, ~170 lei). Q4K 32–60% (0–90 lei; martie a
   fost exact 60,00%, deci în standard).
4. **Septembrie pornește jos la ocupare:** Ștefan 45% și Nicolina 28% în sept. 2025, pentru că
   înscrierile abia încep. Aceeași problemă a fost rezolvată la instructori cu regula campaniei de
   reînscrieri (grila, §2).

**Limitele simulării:**
- ⚠️ Simularea a fost rulată **înainte** de regula din 17 sept.: capacitatea e recalculată lună de
  lună, nu înghețată la începutul sezonului. Cu pool fix, lunile de început (când mai apar grupe) și
  cele de final (când se închid) ies altfel — cifrele de mai jos trebuie refăcute înainte de prima plată.
- Pe istoric nu există suspendările pe luni (tabelul e din 13 sept. 2026), deci o grupă intră în
  capacitate doar în lunile în care a avut măcar un plătitor. De acum încolo regula e
  `curs_activ_in_luna`, iar grupele goale intră și ele.
- În 2025-2026 nu a existat Open Class cu ședințe și nici vânzare de bilete, deci simularea nu le
  testează. Toate încasările sezonului au fost abonamente.
- Istoricul a fost curățat pe 12 sept. (lunile fără nicio prezență au fost șterse ca datorie), deci
  ratele de încasare pe istoric sunt ușor optimiste.

**Artifactul integrat** (14 sept. 2026, cerut de Alex): <https://claude.ai/code/artifact/37b33603-edc7-44e0-8a97-49c9435afdae>.
Conține regulile instructorilor și ale managerilor plus câte o pagină per om. La Andrei și Alin salariul e defalcat pe
cele două roluri. Se reconstruiește cu `_sursa/build.py`, care preia paginile de instructor din artifactul
658605e1.

**Materialele pentru discuțiile cu managerii** (14 sept. 2026) sunt în
`Management/Salarizare manageri studio/`, în rădăcina workspace-ului: `grila-manager-studio.html`
(regulile, fără cifre personale), `index.html` și câte o pagină per manager. Se regenerează cu
`_sursa/mgr_sim.cjs` (DB → `mgr_sim.json`) și apoi `python3 _sursa/gen.py <folder> [url-reguli]`.

## 6b. Septembrie 2026 — unde stau locațiile la 23 septembrie

Recalculat pe datele zilei (simularea din artifact a fost refăcută odată cu cele ale instructorilor).
Septembrie nu e o lună încheiată: rata de încasare a lunii se închide abia pe **31 octombrie**, deci
cifra de mai jos e parțială și va urca.

| Locație | Ocupare | Bonus ocupare | Încasările lunii | Rata, parțial |
|---|---|---|---|---|
| Ștefan cel Mare | 74,28% (420 + 16 open din 587) — **în standard** | 872 | 84.265 | 65,42% |
| Nicolina | 48,81% (205 din 420) — **sub standard** | 205 | 33.497 | 62,46% |
| Quasar 4 Kids | 62,86% (66 din 105) — **în standard** | 132 | 8.030 | 55,57% |

**Ce s-a mișcat în 10 zile** (14 → 23 sept.): ocuparea la Ștefan a urcat de la 60,92% la 74,28%
(bonus 664 → 872), la Nicolina de la 44,44% la 48,81% (160 → 205), la Q4K de la 55,00% la 62,86%
(33 → 132, adică a trecut pragul de 60% și s-a dublat leul pe loc). Încasările lunii la Ștefan au
crescut de la 28.704 la 84.265 lei.

⚠️ **Nicolina rămâne singura locație sub pragul de 60%** — acolo bonusul de ocupare e 1 leu pe loc,
nu 2. Diferența până la standard: 47 de locuri ocupate în plus.

## 7. Decizii încă deschise

- ~~**Ocuparea din septembrie**~~ — **ÎNCHIS (25 sept.)**: septembrie 2026 la standard (2 lei × locuri).
  Din 2027, regula campaniei, ca la instructori.
- **Bonusurile de vară** — nedefinite.
- ⭐ **Bonus de maturizare a unei grupe noi** — idee a lui Alex (17 sept. 2026), **cu calculul
  nedus până la capăt**, de notat și eventual implementat: grupa nouă mărește pool-ul de capacitate,
  iar în luna în care ajunge la **8 cursanți (6 la SCM Studio 2)** managerul ia **80 lei (60 lei la
  Studio 2)**, pentru luna în care grupa s-a maturizat. De stabilit înainte de implementare:
  se plătește o singură dată per grupă sau se reia dacă grupa scade sub prag și urcă iar; ce
  înseamnă „ajunge la 8" (o lună sau trei, ca pragul de existență din grila instructorilor);
  ce se întâmplă dacă grupa moare la două luni după bonus; cât ar costa pe un sezon normal.
- ~~**Când anume e „începutul sezonului"**~~ — **ÎNCHIS (25 sept.)**: nu mai trebuie aleasă o zi. Intră
  în pool fiecare grupă a sezonului din prima lună în care a funcționat (lansată, nesuspendată); o
  grupă anulată înainte de start nu intră niciodată.

## 8. Ce trebuia construit înainte de prima plată — ✅ făcut pe 25 sept. 2026 (vezi §9)

- Legătura manager ↔ locație. Azi stă doar în `app_metadata.role` + `app_metadata.locatie_id`
  (edge function `admin-users`). Verificat pe 14 sept.: Andrei = manager Ștefan, Alin = manager
  Nicolina, iar Roxana are rol de **admin fără locație**, deci aplicația n-o leagă de Q4K.
- Un RPC care calculează pe (locație, lună): ratele lunii, plătitul până la M+1, încasările lunii,
  locurile ocupate (`locuri_ocupate` pe lună), capacitatea, treptele și sumele.
- **Snapshotul de capacitate pe (locație, sezon)** — numitorul fix din §3, cu grupele noi adăugate
  pe parcurs și cele închise păstrate.
- Ecranul de bonus poate apărea abia după finalul lunii M+1, fiindcă rata lunii M se închide atunci.

## 9. Implementarea în aplicație (25 sept. 2026)

| Ce | Unde |
|---|---|
| Managerul ↔ locațiile lui | `manageri_locatii` — Andrei → Galeriile Ștefan cel Mare, Alin → Nicolina, din 2026-09-01. **Nu** `app_metadata.locatie_id`: locația din cont e o setare de acces |
| Cifrele (bază pe locații, trepte, procente, lei/loc) | `salarizare_grila` (post `manager`) |
| Rata de încasare a lunii | `kpi_rata_incasare(locații, an, lună)` — **aceeași funcție** o folosește K2 al recepției. Verificată pe 36 de perechi locație × lună (sept. 2025 – aug. 2026) față de simularea `mgr_sim.cjs`: zero abateri |
| Pool-ul de capacitate | `capacitate_pool` — capacitatea și locația copiate la adăugare; rândurile nu se șterg. Umplut pe 2026-2027 cu grupele care au funcționat în septembrie (Ștefan 612, Nicolina 420, Q4K 105); cronul `capacitate-pool-zilnic` adaugă grupele noi. Corecție doar prin `corecteaza_pool_capacitate` (owner, cu motiv) |
| Calculul lunii | `calculeaza_salariu_manager(user, an, lună)` |
| Confirmarea pe componente | `confirma_salariu_staff` → `salarii_staff_componente`. Baza se confirmă oricând, ocuparea după finalul lunii, încasarea după finalul lunii M+1 |
| Ecran | `/salarizare` → tab „Manageri" (owner/admin) |

🔒 Nota internă din §3 rămâne valabilă: faptul că pool-ul **nu scade** nu se publică în materialele
pentru manageri.
