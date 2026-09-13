# Grila de salarizare instructori — sezon 2026-2027

> **Stare: PROPUNERE.** Nimic din documentul ăsta nu e implementat în cod sau intrat în plată.
> Stabilit împreună cu Alex pe 8–9 septembrie 2026, revizuit pe 12 septembrie și pe
> **13 septembrie 2026** (KPI-uri identice la începător și intermediar, ocupare pe mărime
> stabilită manual, **KPI-ul de vară fixat la 6 lei de fiecare prezență**).
> Înlocuiește modelul pe praguri de cursanți descris în memoria `project_salarii_teacher`.
>
> Rapoarte generate din specificația asta:
> - [Analiza completă](https://claude.ai/code/artifact/7dbcd26a-eff6-4149-ab12-64117f518100) — pentru management ⚠️ **nesincronizat din 9 sept.**
> - [Regulile grilei](https://claude.ai/code/artifact/6eda6ad9-3e7a-4d9a-af80-3ead5a2c4efd) — pentru instructori, fără cifre personale (actualizat 13 sept.: secțiunea Vara)
> - [Simulări individuale](https://claude.ai/code/artifact/658605e1-6de3-4e12-b3af-8a5a70c3e50c) — o pagină per instructor, pentru discuțiile 1:1 (actualizat 13 sept.)
> - [Rentabilitatea grupelor](https://claude.ai/code/artifact/c6421638-b614-47f0-b94c-d804e141dba8) — venit vs. cost salarial pe grupă (actualizat 13 sept.)
>
> ⚠️ Toate au **link de share fixat pe o versiune veche** — după republicare, cine are linkul vede
> tot versiunea dinainte până când se mută pinul din meniul de share.

---

## 1. Baza fixă

**Se plătește lunar pe tot parcursul anului** (confirmat de Alex, 9 sept.). Pentru cele **2 luni de
vară** se plătește doar grupa care a trecut **testul de maturitate** — vezi §4. Se citește din două
intrări: rangul instructorului × nivelul grupei.

| Rang (`teacheri.nivelul`) | Începător | Intermediar / Avansat | Trupă |
|---|---|---|---|
| `Junior` | 300 | 410 ⚠️ | — |
| `Senior` | 350 | 480 | — |
| `Expert` | 400 | 550 | 700 |

- **Rangul e dat de vechimea în firmă** și se setează manual de Alex. Nu e evaluare de competență.
- **Singura restricție de acces: trupa, doar pentru Experți.** Începător și intermediar/avansat se pot
  preda la orice rang; diferă doar tariful.
- **Avansat se plătește ca Intermediar** (enumul `nivel_curs` are 4 valori, grila are 3 paliere).
- **O ședință pe săptămână ⇒ bază ȘI bonus se înjumătățesc.** Trei ședințe (`S Rock On Q`) se
  plătesc ca două — decizie explicită a lui Alex.
- ⚠️ **410 lei (Junior × Intermediar) e derivat de mine**, păstrând pasul de 70 de lei din coloană
  (410 → 480 → 550). Nu a fost dat de Alex — **de confirmat înainte de a comunica grila**.

Ranguri la 12 sept. 2026: **Expert** — Alin Stoleru, Bianca David, Ioana Perju, Andrei Chiriac,
**Laura Roșca**. **Senior** — Eva Manolică. **Junior** — Theo Todica, Ana Plesescu, Laura Petria,
Adrian Geartu, Mara Caliman, Giulia Butnaru.

⚠️ **Orarul s-a schimbat după prima versiune a documentului:** 56 de cursuri în sezonul activ, nu 50.
Nou apărute: **Laura Roșca** cu 4 grupe de Teatru la Quasar 4 Kids (toate 1×/săpt.) — un al 12-lea
instructor, absent din prima simulare; `S SD Kpop 7-12` s-a împărțit în `S SD Kpop 14:30` și
`S SD Kpop 15:30`, ambele la Laura Petria. `S Open Class` are titular „Open Teacher" (nu o persoană)
și nu intră în salarii.

## 2. Bonusul KPI — trei trepte în sezon, prezențe vara

**Sub standard = 0 · În standard = jumătate din maxim · Peste standard = maximul.**
**Se plătește doar în cele 10 luni de sezon** (confirmat de Alex, 9 sept.).
Iulie și august au propriul indicator, **6 lei de fiecare prezență** — vezi mai jos.

> ⚠️ Alex spusese inițial „în standard plătim 80%", dar toate pragurile concrete date
> (105/210, 70/140, 75/150) sunt exact 50%. Am aplicat numerele.

**Fiecare nivel are doi indicatori: unul de MENȚINERE și unul de CREȘTERE.**
**Începătorii și intermediarii au același set** (decizie Alex, 12 sept.): retenție + ocupare.
**Rata de prezență a fost eliminată** — cu ea dispare și întrebarea deschisă despre numitorul ei.

| Nivel grupă | Indicator | Măsoară | Sub standard | În standard | Peste standard | Lei (0 / std / max) |
|---|---|---|---|---|---|---|
| Începător | Retenție | menținere | < 85% | 85–95% | > 95% | 0 / 105 / 210 |
| Începător | Ocupare | creștere | < 60% | 60–80% | > 80% | **după mărimea grupei**, vezi tabelul |
| Intermediar | Retenție | menținere | < 85% | 85–95% | > 95% | 0 / 75 / 150 |
| Intermediar | Ocupare | creștere | < 60% | 60–80% | > 80% | **după mărimea grupei**, vezi tabelul |
| Trupă | Retenție | menținere | < 85% | 85–95% | > 95% | 0 / 50 / 100 |
| Trupă | Evenimente | performanță | — | — | — | **150 lei / eveniment**, separat |

Banda 80–81% de la ocupare, semnalată ca gaură în versiunea anterioară, s-a închis: peste standard
înseamnă acum **> 80%**. Trupele NU au ocupare — creșterea lor se măsoară în evenimente.

### Sumele de ocupare — pe mărimea grupei (Alex, 12 sept.)

| Mărimea grupei | Sub standard | În standard | Peste standard |
|---|---|---|---|
| 10 | 0 | 60 | 100 |
| 15 | 0 | 90 | 140 |
| 20 | 0 | 120 | 180 |
| 25 | 0 | 150 | 220 |
| 30 | 0 | 180 | 260 |

Regula e liniară, deci se aplică la orice mărime (cele 3 grupe de 13 din Ștefan sala 2 ⇒ 80 / 120):

```
ocupare_standard = 6 × mărime          (rotunjit la 10 lei)
ocupare_maxim    = 8 × mărime + 20     (rotunjit la 10 lei)
```

⚠️ **„În standard" nu mai e jumătate la ocupare** — e între 60% și 69% din maxim, în funcție de
bandă. Retenția a rămas pe jumătate (105 din 210). Pagina pentru instructori nu mai promite „jumătate";
spune că suma fiecărei trepte e scrisă explicit în grilă. **De decis dacă și retenția urcă la ~2/3**
(ar costa ~+1.000 lei/lună) sau rămâne pe jumătate.

### Pragurile de ocupare, în cursanți

Benzile procentuale (sub 60% / 60–80% / peste 80%) traduse pe treptele de capacitate — forma în care se
discută cu instructorul, fiindcă el numără oameni, nu procente. Apar pe pagina fiecărui instructor, în
coloana „Mărime", ca „standard de la N".

| Capacitate | Sală | În standard | Peste standard | Lei standard | Lei peste |
|---|---|---|---|---|---|
| 10 | Ștefan · Sala 2 | 6–8 cursanți | 9+ | 60 | 100 |
| 15 | Quasar 4 Kids | 9–12 | 13+ | 90 | 140 |
| 20 | Nicolina | 12–16 | 17+ | 120 | 180 |
| 25 | Ștefan · Sala 1 | 15–20 | 21+ | 150 | 220 |
| 30 | Ștefan · Sala 1, doar `S Open Class` | 18–24 | 25+ | 180 | 260 |

La grupele cu o ședință pe săptămână sumele se înjumătățesc; **pragurile de cursanți rămân la fel**.
Implementare: `ceil(0.6 × mărime)` pentru standard, `floor(0.8 × mărime) + 1` pentru peste standard.
Banda 80–81% din prima versiune s-a închis: standardul e `>= 60%`, peste standard e `> 80%`.

**⚠️ Pragul de ocupare NU e pragul de existență a grupei** (întrebare a lui Alex, 12 sept.):

| Prag | Valoare | Ce decide |
|---|---|---|
| **Existența grupei** | **8** cursanți plătitori, testat la 3 luni de la deschidere (§4) | dacă grupa se ține sau se reorganizează |
| **Bonusul de ocupare** | **60% din mărime** ⇒ 6 în Sala 2 · 9 la Q4K · 12 la Nicolina · 15 în Sala 1 | dacă instructorul ia bani pe ocupare |

Pragul de 8 n-a fost schimbat niciodată. Consecința suprapunerii: la Nicolina (mărime 20) există o zonă
de **8–11 cursanți** în care grupa e viabilă, dar bonusul de ocupare e încă 0; în Sala 2 (mărime 10)
pragul KPI e sub cel de existență, deci nu apare zona asta. Dacă zona e prea largă, pârghiile sunt
pragul KPI (60% → 40–50%) sau mărimea sălii (Nicolina 20 → 15), nu pragul de existență.

### Mărimea grupei — numitorul ocupării

**Mărimea unei grupe = `cursuri.capacitate_maxima`** (Alex, 12 sept.: „mărimile pe grupă sunt date de
capacitatea lor"). Fiindcă devine numitorul unui KPI care plătește bani, capacitatea nu mai poate fi un
număr liber: migrația **`20260913100000_capacitate_standard_grupe.sql`** (aplicată) o presetează pe 5
trepte, cu standardul luat din sala în care se ține grupa.

| Sală | Capacitate standard | Grupe în sezonul activ | Înainte |
|---|---|---|---|
| Ștefan cel Mare · Sala 1 | **25** | 21 | 30 (și una cu 35) |
| Ștefan cel Mare · Sala 2 | **10** | 7 | 10, 12, 13, 14, 15 **și** 30 |
| Nicolina | **20** | 21 | 25 la toate |
| Quasar 4 Kids | **15** | 7 | 15 și 20 |

`sali.capacitate` era 0 pe toate cele 4 rânduri; migrația o umple, ca formularul de curs să aibă o
valoare implicită. Grupele care au deja mai mulți înscriși decât noua capacitate își păstrează
înrolările — capacitatea nu e gard la înrolare, doar avertisment „Curs plin".

**`S Open Class` e singura excepție acceptată: 30, nu 25** (Alex, 12 sept.; migrația
`20260913110000_open_class_capacitate_30.sql`). La open class nimeni nu ocupă un loc permanent —
capacitatea e limita unei singure ședințe, copiată de `open_class_rpc` în `open_sesiuni.capacitate` la
crearea fiecărei sesiuni; 30 înseamnă „30 de rezervări pe o ședință", nu „grupă de 30". Nu atinge
salariile (titular „Open Teacher"). A coborât totuși de la 35, deci sesiunile NOI au 30 de locuri la
rezervarea online; cele create înainte păstrează snapshotul de 35.

Verificare după orice atingere a capacităților: `node scripts/check-capacitate-grupe.mjs` — abaterile de
la trepte sunt erori, abaterile de la standardul sălii doar informative (există excepția de mai sus).
Cele **107 cursuri fără sală și fără locație** rămân pe 0: moloz din v1, fără nicio înrolare activă.

**Efectul pe bani, recalculat la 13 septembrie 2026** (a doua zi de sezon, înscrierile în curs):
miza ocupării e **7.680 lei/lună la maxim** (5.095 la standard) pe 49 de grupe, iar la ocuparea reală
de acum s-ar plăti **1.550 lei = 30% din miza de standard**. Benzi: 36 de grupe sub standard, 9 în
standard, 4 peste.

| Locație / sală | Capacitate | Grupe | Miză std/lună | S-ar plăti acum | Cursanți lipsă până la 60% |
|---|---|---|---|---|---|
| Nicolina | 20 | 19 | 2.100 | 120 | 111 |
| Ștefan cel Mare · Sala 1 | 25 | 15 | 2.100 | 965 | 74 |
| Ștefan cel Mare · Sala 2 | 10 | 7 | 420 | 280 | 8 |
| Quasar 4 Kids | 15 | 7 | 405 | 185 | 35 |
| *(S LMi Tiny, capacitate 12)* | 12 ⚠️ | 1 | 70 | 0 | 8 |

Cele 13 grupe care iau bani pe ocupare azi: S SD Kpop 12+ 33/25 (132%) · S SD Varsity INT 29/25 ·
S SD Kpop 14:30 11/10 · K Junior MJ 13/15 · S MaJ Tiny 20/25 · S V Junior INC 19/25 ·
S MaJ Teen INT 19/25 · S MaJ Junior INC 17/25 · N Acrobatics SD 12/20 · K Teatru jr 7-10 INT 10/15 ·
S LMi Junior INC 8/10 · S SD Kpop 15:30 8/10 · S-S2 SD Varsity INT 8/10.

⚠️ **Nicolina rămâne problema reală**, nu una de date: 19 grupe, 2.100 lei miză de standard, 120 lei
plătibili azi, 111 cursanți lipsă până la prag. Aici KPI-ul de ocupare e un obiectiv de umplere, nu un
bonus curent.

⚠️ **Grupa nouă `S LMi Tiny` (Giulia Butnaru, Sala 2) s-a creat cu capacitatea 12**, în afara celor 5
trepte — `node scripts/check-capacitate-grupe.mjs` o raportează ca abatere. Standardul Sălii 2 e 10.
Cât timp capacitatea e numitorul unui KPI care plătește, valoarea trebuie adusă pe treaptă.

### KPI-ul de vară — 6 lei de fiecare prezență (Alex, 13 sept.)

**În iulie și august nu se măsoară nici retenția, nici ocuparea.** În locul lor intră un singur
indicator: **6 lei pentru fiecare prezență** înregistrată la orele ținute în cele două luni, peste
baza grupelor care au trecut testul de maturitate (§4). Nu are trepte (fiecare prezență se plătește
la fel, de la prima) și **nu se înjumătățește** la grupele cu o ședință pe săptămână — vara contează
câte ore se țin efectiv, nu ce program are grupa în sezon. Voucherul și cei 150 lei pe eveniment merg
mai departe, la fel ca în restul anului.

**Bonusul verii nu depinde de testul de maturitate** — testul decide doar dacă se plătește *baza*.
Prezențele se plătesc oricum.

**Cât ar fi costat pe vara care tocmai s-a încheiat** (sezonul „Vara 2026", 22 iun.–30 aug.; fereastra
de plată e însă iulie–august):

| | Prezențe | La 6 lei |
|---|---|---|
| Iulie 2026 | 2.010 | **12.060 lei** |
| August 2026 | 1.386 | **8.316 lei** |
| **Total pe cele 2 luni** | **3.396** | **20.376 lei** |

Cele 161 de prezențe de la `S Open Class` nu intră (titular „Open Teacher", nu o persoană).
Pe instructor, iulie + august: Alin Stoleru 3.606 · Bianca David 3.402 · Ioana Perju 2.736 ·
Eva Manolică 2.322 · Andrei Chiriac 2.118 · Giulia Butnaru 1.578 · Mara Caliman 1.410 ·
Laura Petria 1.134 · Adrian Geartu 960 · Theo Todica 648 · Ana Plesescu 462. Laura Roșca n-a avut
ore de vară, deci 0.

**Calibrare:** ~10.200 lei/lună în medie, adică aproximativ cât bonusul de sezon la standard
(9.630 lei/lună) — vara nu e nici mai ieftină, nici mai scumpă decât o lună obișnuită de bonus.
Distribuția e însă foarte inegală între cele două luni (12.060 vs 8.316) și între oameni: primii
patru instructori iau 57% din total. **Vara 2025 ar fi costat 14.256 lei** (2.376 prezențe), deci
suma crește cu activitatea de vară — ceea ce e chiar intenția indicatorului.

⚠️ **Prezența de vară trebuie trecută la zi în aplicație**, altfel nu există pentru plată. Spre
deosebire de restul grilei, aici nu e nimic de construit: `prezente` există și se completează deja
în lunile de vară.

## 3. Beneficii

| Beneficiu | Cine | Sumă | Ritm |
|---|---|---|---|
| Voucher clase Quasar | toți instructorii | 300 lei | lunar, tot anul |
| **Buget deplasări** (cazare/masă/transport) | **doar trupele plătite ca trupă** | 1.200 lei / trupă | pe sezon |
| Evenimente de promovare a studioului | toate trupele din portofoliu | 150 lei | per eveniment |

- Bugetul de deplasări **rămâne al instructorului dacă nu îl cheltuie** ⇒ e cost cert, nu decont.
- **Evenimentele sunt cele de promovare a studioului.** Suma de 150 lei e referința; **se negociază
  la fiecare eveniment**. Nu există o listă de tipuri de evenimente — se stabilește de la caz la caz.
- **Voucherul e circular:** instructorii îl folosesc pentru propriul abonament la trupa din care fac
  parte (260–280 lei). Cost de casă ~0, dar apare de două ori în rapoarte și umflă numărătoarea
  pragului de 14. Recomandat: marcaj distinct în roster.
- ⚠️ **Tensiune de calendar nerezolvată:** bugetul de deplasări e sumă anuală, dar statutul de trupă
  se renumără lunar. Recomandarea mea: statutul pentru buget se fixează o dată, la 31 octombrie.

## 4. Praguri de existență

| Prag | Se aplică | Când se măsoară | Ce se întâmplă sub prag |
|---|---|---|---|
| **8 cursanți plătitori** | orice grupă | abia la **3 luni de la lansare** (⇒ primul test ian. 2027) | grupa se **reorganizează**; instructorul o pierde sau ia alta |
| **14 cursanți plătitori** | trupe | **din prima lună**, apoi lunar | plătită ca intermediar, **pierde bugetul de deplasări**, **păstrează** cei 150 lei/eveniment |

### Testul de maturitate — condiția pentru plata de vară

Baza intră în cele **2 luni de vară** doar dacă grupa a rămas deschisă cu **minim 8 cursanți
plătitori timp de 5 luni consecutive, după cele 3 luni de testare**.

- *Exemplu care trece:* grupă deschisă în **octombrie** → se testează oct–dec → dacă are ≥8 cursanți
  în ian, feb, mar, apr, mai ⇒ **e plătită și vara**.
- *Exemplu care nu trece:* grupă deschisă în **ianuarie** → nu mai apucă cele 5 luni până la vară ⇒
  **se plătește normal în tot sezonul, dar nu și în iulie-august**.

Regula se aplică **pe grupă, nu pe instructor** — un om cu portofoliu mixt poate fi plătit vara
pentru unele grupe și nu pentru altele. **Testul decide doar baza**: cei 6 lei pe prezență (§2) se
plătesc pentru orice oră de vară ținută, indiferent dacă grupa a trecut testul.

**Estimare pe sezonul 2025-2026:** **36 din 50 de grupe** ar fi trecut testul, adică **75% din bază**
(~15.700 lei/lună în loc de 20.875). Cele două luni de vară ar costa atunci ~**31.400 lei**, nu 41.750.
Grupele care n-ar fi trecut: S SD Kpop 7-12, K Tiny MaJ, K Tiny Mi, S-S2 SD Varsity INC,
N Dans Junior INT SD, N Dans Varsity INC SD, N MTV Commercial V, S SD Junior INT — plus 6 grupe noi
fără istoric (S-S2 SD Teen, N Q Monsters, N Q Strike, N Dans Teen INC SD, N K-Pop SD,
S SD Varsity Avanasati).

## 5. Definiția „cursant plătitor" — CITEȘTE ÎNAINTE SĂ NUMERI

Un client se numără la grupa C în luna X dacă are în `enrollments` un rând cu:
- `cursul = C`
- `suma > 0`
- fereastra `[data_incepere, data_final]` acoperă luna X
- **NU** are `data_reziliere <= prima zi a lunii X`

> ⚠️⚠️ **`reziliat` NU înseamnă că omul a plecat.** Modelul „Per lună" creează un rând pe lună, iar
> la închiderea lunii rândul primește `reziliat = true` fără dată și fără motiv. Pe sezonul 2025-2026:
> 4.183 rânduri reziliate din 7.343, dar **doar 356 au `data_reziliere` și `motiv_reziliere`**.
> Filtrarea pe `reziliat` a dat vârfuri de 2–4× mai mici decât realitatea.
> Detalii: memoria `project_reziliat_flag_falsifica_istoricul`.
>
> ⚠️ `.in()` din supabase-js **taie tăcut la 1000 de rânduri**. `enrollments` are 42.798 rânduri —
> numărătoarea se face paginat cu `.range()`, per curs.

## 6. Rezultatul simulării (orar 2026-2027: 12 instructori, 56 de grupe cu titular, 10 trupe)

Recalculat la **13 septembrie 2026**, a doua zi de sezon: 534 de cursanți plătitori (cu 25 mai mulți
decât la 12 sept.), o grupă nouă în orar (`S LMi Tiny`).

| Componentă | Ritm | Pe lună | Luni/an | Pe an |
|---|---|---|---|---|
| Bază | lunar; vara doar grupele mature | 22.200 | 10 + vara parțial | ~266.400 |
| Vouchere (12 × 300) | lunar, tot anul | 3.600 | 12 | 43.200 |
| Bonus KPI la standard | doar în sezon | 9.630 | 10 | 96.300 |
| Bonus KPI la maxim | doar în sezon | 16.750 | 10 | 167.500 |
| **KPI de vară (6 lei/prezență)** | **iulie + august** | **~10.190** | **2** | **20.376** |
| Buget deplasări (7 trupe × 1.200) | pe sezon | 840 | — | 8.400 |
| Evenimente | per eveniment | — | — | 1.500 / rundă completă |

- **Lunar vara**: **25.800 garantat** (bază + voucher) · **~35.990 cu KPI-ul de vară** — 37.860 în
  iulie, 34.116 în august, pe activitatea verii trecute.
- **Lunar în sezon: 26.640 garantat · 32.725 la ocuparea de azi · 36.270 la standard · 43.390 la maxim**
- **Total pe an, la standard**: **434.676 lei** (era 408.400 la 12 sept., fără KPI-ul de vară; din
  creștere, 20.376 sunt vara și ~5.900 vin din cursanții în plus și grupa nouă)

**Cifra „azi"** = bază + voucher + deplasări + bonusul de ocupare câștigat efectiv la 13 sept.
(1.550 lei) + retenția la standard. Retenția nu se poate măsura în septembrie (n-are lună anterioară),
deci intră ca ipoteză — e prima gaură de reguli de rezolvat, fiindcă afectează 1 din cele 10 luni de bonus.

**Pe instructor** (vara garantat / vara cu KPI / azi / la standard / pe an la standard):
Alin Stoleru 6.050 / 7.850 / 7.305 / 8.265 / 98.356 ·
Bianca David 3.050 / 4.750 / 3.770 / 4.150 / 51.002 ·
Eva Manolică 2.835 / 4.000 / 3.838 / 4.198 / 49.967 ·
Ioana Perju 2.750 / 4.120 / 3.610 / 3.910 / 47.336 ·
Andrei Chiriac 2.300 / 3.360 / 2.938 / 2.962 / 36.343 ·
Ana Plesescu 1.760 / 1.990 / 2.202 / 2.698 / 30.957 ·
Mara Caliman 1.460 / 2.165 / 1.798 / 2.218 / 26.505 ·
Giulia Butnaru 1.310 / 2.100 / 1.815 / 1.965 / 23.848 ·
Adrian Geartu 1.310 / 1.790 / 1.655 / 1.775 / 21.330 ·
Laura Roșca 1.175 / 1.175 / 1.415 / 1.550 / 17.850 ·
Theo Todica 900 / 1.225 / 1.110 / 1.350 / 15.948 ·
Laura Petria 900 / 1.470 / 1.270 / 1.230 / 15.234.

⚠️ KPI-ul de vară e estimat pe prezențele reale ale fiecăruia din iulie–august 2026, la portofoliul de
vară de atunci — nu la grupele din sezonul nou. E o măsură a activității de vară a omului, nu o promisiune.

**Praguri, la 13 septembrie 2026:** **3 trupe sub 14** — `N Acro Q LM` 11 și `N Acrobatics SD` 12
(ambele la Alin), plus `S 1Up Crew` **13** (Giulia), care a coborât de la 14 în două zile. Toate trei
se plătesc ca intermediar și fără buget de deplasări, deci rămân 7 trupe cu statut, nu 8. Pragul de 8
cursanți se testează abia din ian. 2027.

⚠️ **Trupe conduse de non-Experți:** `S UNIQ Crew` (Eva, Senior) are 15 cursanți, deci e trupă
adevărată și problema e vie. `S 1Up Crew` (Giulia, Junior) a coborât sub 14, deci se stinge de la
sine — dar e o chestiune de un singur înscris, nu o rezolvare. Grila nu are tarif de trupă la Junior
și Senior, deci ambele se plătesc la tariful de intermediar al rangului (410, respectiv 480).
**Ori cei doi urcă în rang, ori trupele trec la Experți, ori grila capătă tarif de trupă pe fiecare rang.**

## 7. Calibrarea pragurilor pe sezonul 2025-2026

| Indicator | Observații | Sub std | În std | Peste std | Verdict |
|---|---|---|---|---|---|
| Retenție (85 / 95) | 374 | 23% | 25% | 52% | bine calibrat; mediana 100%, p25 87%, p10 67% |
| Ocupare | 351 | 48% | 25% | 27% | bine calibrat |
| Rată de prezență (intermediari) | 97 | 20% | 68% | 12% | ~~bine calibrat~~ **indicator eliminat 12 sept.** |

Retenția pe mărimea grupei (arată singurul dezechilibru rămas):

| Mărime grupă | Sub std | În std | Peste std |
|---|---|---|---|
| 3–7 | 40% | 6% | 54% |
| 8–12 | 17% | 27% | 56% |
| 13–19 | 19% | 29% | 52% |
| 20+ | 40% | 25% | 35% |

### KPI ocupare, pe săli (istoric: miza de 3.640 lei/lună pe cele 29 de grupe de începători)

⚠️ Secțiunea de mai jos e calculată pe **capacitatea sălii** și pe **numai grupele de începători** —
ambele depășite de revizia din 12 sept. (numitor = mărime manuală, ocuparea intră și la intermediari,
45 de grupe, miză mai mare). Rămâne ca dovadă că numitorul pe capacitate de sală
nu funcționează: 34% ocupare medie pe istoric.

| Sală | Grupe | Miză/lună | Pe istoric | Cursanți lipsă până la 60% |
|---|---|---|---|---|
| Ștefan cel Mare · Sala 1 | 9 | 1.120 | 630 (56%) | 6 |
| Ștefan cel Mare · Sala 2 | 5 | 700 | 140 (20%) | 22 |
| Nicolina | 12 | 1.470 | 315 (21%) | 55 |
| Quasar 4 Kids | 3 | 350 | 140 (40%) | 2 |
| **Total** | 29 | 3.640 | **1.225 (34%)** | 86 |

Patru grupe sunt la **un singur cursant** de bandă: N Dans Junior INC LM (14/15), S MaJ Tiny (17/18),
S V Zumba Fitness (17/18); la doi: N Gimnastica Mixt V și K Tiny Mi.

⚠️ **Trei grupe depășesc 100% ocupare pe istoric** (S SD Kpop 12+ 113%, S SD Varsity BEG 103%) —
capacitățile declarate (13–35 locuri, media 26) trebuie confirmate sală cu sală înainte să plătească bani.

## 8. Ce trebuie construit în aplicație înainte de prima plată

1. **Evenimentele de promovare nu au unde să fie înregistrate.** `tip_eveniment` acceptă doar
   `Eveniment | Workshop | Auditie | DEMO Class`, iar tabela `evenimente` are 26 de rânduri
   (17 DEMO Class, 8 audiții, 1 workshop). Trebuie tip nou + listă de prezență a trupei.
2. **Motorul de KPI nu poate ține sume per grupă.** `suma_standard` / `suma_peste` stau pe
   `kpi_grila_linii`, cu `unique (grila_id, kpi_id)` — o singură sumă per indicator per titular.
   Alin are nevoie de 10 sume diferite pe același KPI. **Recomandare: suma de ocupare și mărimea
   stau pe `cursuri`, nu pe grilă** — aparțin grupei și supraviețuiesc schimbării de titular; grila
   păstrează doar pragurile procentuale. Alternativa (tabel de override `kpi_grila_linii_cursuri`)
   leagă banii de om, nu de grupă, și se rupe la fiecare mutare.
3. ~~**Capacitățile din `cursuri.capacitate_maxima` trebuie corectate sală cu sală**~~ — **FĂCUT
   (12 sept.)**: 5 trepte presetate, standardul sălii, backfill pe 170 de cursuri, formularul oferă
   doar treptele, `sali.capacitate` ține standardul. Vezi §2 pentru cifre și pentru cele 3 grupe
   rămase peste capacitate.
4. **Marcaj în roster** pentru instructorii care se antrenează în trupele proprii.
4b. **KPI-ul de vară n-are nevoie de nimic nou** — se citește din `prezente`, care se completează deja
   în iulie–august (3.396 de prezențe în vara 2026). Singura condiție e ca ședințele de vară să fie
   trecute la zi. Ce lipsește e **testul de maturitate** (§4), care decide dacă intră și baza: cere
   istoric de 5 luni consecutive cu ≥8 cursanți plătitori, calculat pe `data_reziliere`, nu pe `reziliat`.
5. **Retenția în prima lună nu are numitor.** În septembrie nu există lună precedentă (august n-are
   înrolări), la fel la orice grupă nou deschisă. De decis: 0, sau indicatorul nu se numără în luna
   aia. Azi ar plăti 0 tăcut, adică o lună din zece fără bonus de retenție pentru toți.

## 9. Decizii încă deschise

- ~~**Capacitățile declarate**~~ — **ÎNCHIS (12 sept.)**: mărimea = `capacitate_maxima`, presetată pe
  5 trepte cu standardul sălii; backfill aplicat. Bonusul de ocupare e acum 15% plătibil pe
  înscrișii de azi, cu plafonul scăzut de la 9.940 la 8.040 lei/lună (§2).
- **Retenția rămâne pe jumătate în standard sau urcă la ~2/3**, ca ocuparea? Azi grila are două
  logici diferite pentru „în standard" (§2).
- **Tariful Junior × Intermediar (410 lei)** — derivat de mine, neconfirmat. Atinge 4 instructori.
- **Trupele conduse de non-Experți** — `S 1Up Crew` (Junior) și `S UNIQ Crew` (Senior), ambele acum
  peste pragul de 14: promovare, schimbare de titular, sau tarif de trupă pe fiecare rang? (§6)
- **Grupele de Teatru** (Laura Roșca, 4 grupe) — intră pe aceeași grilă ca dansul sau au regim
  propriu? Acum sunt calculate pe grila de dans.
- ~~**KPI-urile de vară**~~ — **ÎNCHIS (13 sept.)**: 6 lei de fiecare prezență din iulie–august, fără
  trepte și fără înjumătățire, peste baza grupelor mature (§2). Pe vara trecută ar fi costat 20.376 lei.
  Rămâne presupunerea mea că **voucherul se dă și vara** — neconfirmată de Alex.
- **Bugetul de deplasări** e anual, dar statutul de trupă e lunar — cum se rezolvă?
- **Data din lună** la care se face numărătoarea de cursanți (decide direct 700 vs 550 la trupe).
- **Ce înseamnă concret „ia altceva"** pentru instructorul căruia i se reorganizează grupa.
