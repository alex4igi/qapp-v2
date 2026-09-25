# Grila de salarizare — recepție (front-desk), sezon 2026-2027

> **Stare: IMPLEMENTAT în aplicație pe 25 sept. 2026, în test** — vezi §9.
>
> ⭐ **Decizia din 25 sept. 2026** (Alex): **K2 = rata de încasare a managerului**, pe locația
> recepției — „sincronizează-le cu KPI-ul de la manager; la manager e % din încasări pe prag, la
> recepție e sumă fixă". „Restanțe recuperate" iese din grilă.
> Punctul de plecare: salarizarea **Petruței**, standardizată de Alex pe **23 septembrie 2026**
> ca grilă de post, nu ca aranjament individual — ca să se poată aplica oricui lucrează la recepție.
>
> ⭐ **Toate sumele din grila asta, și din cele două surori (instructori, manageri), sunt NETE**
> (Alex, 23 sept. 2026). Materialele care scriau „sumele sunt brute" au fost corectate.
>
> Raport generat din specificația asta: [Grila de salarizare Quasar](https://claude.ai/artifact/7svrhrHNRMwTdNytLVPEqj)
> — `reguli-front-desk.html` (regulile, fără cifre personale), `petruta.html` și `theo-todica.html`
> (simulări individuale). Theo are două roluri, deci pagina ei are recepția și instructorul separat.

---

## 1. Cine intră pe grila asta

| Om | Locația pe care se măsoară KPI-urile | Alt rol |
|---|---|---|
| **Petruța** (`pnitisor16@gmail.com`) | Galeriile Ștefan cel Mare | — |
| **Theo Todica** (`todicatheodora@gmail.com`) | Nicolina | instructor Junior, 2 grupe la Nicolina |

**KPI-urile se calculează pe locația la care lucrează omul**, nu pe toată școala (decizie Alex,
23 sept.). Locația de măsurare stă pe grila KPI a omului (`kpi_grila_locatii`), nu pe cont —
`app_metadata.locatie_id` nu e necesar.

Cine are și rol de instructor își ia salariul de instructor separat, după
[grila instructorilor](./grila-salarizare-instructori.md). Cele două se adună.

## 2. Partea fixă

Se plătește în **fiecare lună a anului**, inclusiv în iulie și august.

| Componentă | Condiția | Pe lună (net) |
|---|---|---|
| Salariu fix | norma întreagă | **2.722** |
| Facturare la timp | facturile lunii ies la termen | 200 |
| Abonament la trupa proprie | gratuit, tot anul | 290 (beneficiu, nu bani în mână) |
| Fidelitate | de la 2 ani vechime în firmă | 100 |

**La normă parțială, fixul și bonusul KPI se reduc proporțional; pragurile procentuale rămân
aceleași** — se schimbă doar suma pe care o plătește fiecare treaptă.

⚠️ **Theo a fost simulată pe normă întreagă** (decizie Alex, 23 sept.), deci cu același fix de 2.722
ca Petruța, peste care vine salariul de instructor.

## 3. Bonusul KPI — cinci indicatori, trei trepte

**Sub standard = 0.** Suma fiecărei trepte e scrisă explicit; nu e „jumătate din maxim" ca la
instructori. Se plătește în cele 10 luni de sezon.

| KPI | Ce măsoară | Sub standard | În standard | Peste standard |
|---|---|---|---|---|
| **K1** Încasare la termen | până în ziua 20 a lunii | < 70% → 0 | 70–76% → **100** | > 76% → **240** |
| **K2** Rata de încasare | ratele lunii plătite până la finalul lunii următoare | < 92% → 0 | 92–95% → **90** | > 95% → **300** |
| **K3** Reactivare absenți 21 zile | % din cazurile deschise | < 32% → 0 | 32–39% → **120** | > 39% → **280** |
| **K4** Răspuns sub 24 de ore | rata de răspuns la mesaje | < 85% → 0 | 85–95% → **60** | > 95% → **140** |
| **K5** Conversie lead → client | din leadurile lunii trecute | < 28% → 0 | 28–36% → **60** | > 36% → **140** |
| **TOTAL LUNAR** | | **0** | **430** | **1.100** |

### ⭐ K2 — rata de încasare a managerului (decis 25 sept. 2026)

K2 măsoară **exact ce măsoară managerul la bonusul pe încasări**: cât din ratele lunii M (înrolările
care încep în M, cu sumă, nereziliate înainte de ziua 1) s-a plătit până la finalul lunii M+1, pe
locația recepției. E aceeași funcție SQL (`kpi_rata_incasare`), deci cele două cifre nu pot diverge.
Pragurile sunt ale managerului (92 / 95,01), dar recepția primește **sumă fixă** pe treaptă, nu
procent din încasări. Pe istoric (2025-2026) rata e de regulă 92–96% la Ștefan și Nicolina și sub 90%
la Q4K.

**Consecința de calendar:** K2 al lunii M se definitivează abia după finalul lunii M+1 (septembrie →
31 octombrie). De aceea în grilă K2 e linie forfetară (pondere 0), iar restul bonusului se poate
confirma la finalul lunii fără el.

### Istoric: pragurile din schița inițială erau inversate

Schița lui Alex din 23 sept. scria `>7% = 0 lei · 5-7% = 90 lei · <5% = 300 lei`, adică **mai puțin
recuperat = mai mulți bani**. Coloana lui de explicații spune însă exact invers: sub standard =
„stocul stă pe loc", peste standard = „cazurile grele, 3-4 contacte, eșalonare". Și indicatorul care
există deja în aplicație (`restante_recuperate`) e `mai_mare_e_bine`.

**Am aplicat citirea coerentă: mai mult recuperat = mai bine** (tabelul de mai sus). Pe istoricul
real indicatorul iese între 0% și 17%, deci pragurile de 5% și 7% cad exact unde trebuie în această
citire; în citirea inversă n-ar avea sens (stocul rămas ar fi mereu 83–100%).
**De confirmat explicit cu Alex** — sunt 300 lei pe lună.

### Ce măsoară fiecare treaptă

Treptele nu sunt doar praguri de procente. Standardul e **reacția**, peste standard e **prevenția**.

| KPI | Sub standard | În standard | Peste standard |
|---|---|---|---|
| K1 | Lasă luna să curgă | **Reacție** — îi urmărește după ce depășesc scadența | **Prevenție** — îi anunță înainte de ziua 15 |
| K2 | Ratele lunii rămân neîncasate | **Recuperare** — urmărește ratele restante până la finalul lunii următoare | Aproape nicio rată a lunii nu rămâne neîncasată |
| K3 | Nu-i aduce înapoi | **Contact** — îi aduce pe cei care oricum voiau să revină | **Rezolvare** — află de ce nu mai vine și schimbă grupa/ziua/instructorul |
| K4 | Mesaje fără răspuns | **Acoperire** — nimeni fără răspuns | **Viteză** — răspuns în aceeași parte de zi |
| K5 | Leadurile se pierd pe drum | **Preia cererea** — leadurile calde (telefon, website, recomandări) | **Creează cererea** — și leadurile reci (Meta Ads, evenimente) |

## 4. Bonusuri ocazionale

Nu intră în salariul lunar. Suma se stabilește la fiecare ocazie, în intervalul de mai jos.

| Bonus | Ritm | Sumă |
|---|---|---|
| Voluntari, 3 evenimente pe an | pe an | 300–450 |
| Dance Day + Senzoria | pe an | 300–500 |
| Campania de reînscrieri | pe sezon | 500–1.100 |
| Restanțe vechi recuperate | la campanie | până la 300 |

⭐ **Bonusurile ocazionale NU se dau automat oricui stă la recepție** (Alex, 23 sept. 2026):
sunt ale postului întreg, legate de coordonarea evenimentelor și a campaniei. **Pe pagina lui Theo
nu apar**; pe cea a Petruței, da. La implementare, e un flag pe om, nu o linie de grilă.

## 5. Unde ajunge salariul

| Scenariu | Pe lună (net) |
|---|---|
| Azi (fix + facturare) | **2.922** |
| Toate KPI-urile în standard | **3.352** |
| Toate peste standard | **4.022** |
| **Pe datele reale ale sezonului trecut** | **3.051–3.107** (vezi §6) |

Plus abonamentul (290) în toate variantele, plus fidelitatea (100) de la 2 ani vechime.

⚠️ În schița lui Alex, „peste standard" era scris **~4.180**. Aritmetica dă 4.022 (2.722 + 200 +
1.100). Diferența de ~158 lei nu se explică din componentele date; cu fidelitatea inclusă ies 4.122.
**De lămurit ce intră în cifra de 4.180.**

## 6. ⚠️ Calibrarea — pragurile sunt puse deasupra realității de azi

> ⭐ **Depășit de deciziile din 25 sept. 2026** (vezi §9): cu K2 = rata de încasare (92/95 → 90/300 lei)
> și cu „indicatorul fără date se plătește la standard", simularea pe sezonul 2025-2026 dă **497 lei/lună
> la Ștefan cel Mare și 545 la Nicolina** — peste cei 430 de „standard". Motivul principal e K2: rata
> de încasare la M+1 a fost peste 95% în 8 din 10 luni la ambele locații (300 lei). K5 n-are date înainte
> de iulie 2026 (leadurile n-aveau locație), deci pe istoric plătește și el standardul. Tabelul de mai jos
> rămâne ca istoric al variantei cu K2 = restanțe recuperate.

Cei cinci indicatori au fost calculați de aplicație (`kpi_dispecer`) pe **datele reale** ale fiecărei
locații, lună de lună, pe sezonul 2025-2026 + septembrie 2026.

| Locație | Media bonusului pe cele 10 luni | Din 430 la „standard" |
|---|---|---|
| Ștefan cel Mare (Petruța) | **137 lei** | 32% |
| Nicolina (Theo) | **185 lei** | 43% |
| Quasar 4 Kids | **129 lei** | 30% |

**Adică „standardul" nu e mediana, e un obiectiv.** Asta poate fi intenționat, dar trebuie spus
explicit la întâlnire: omul care își face treaba ca anul trecut ia ~1/3 din bonusul „de standard",
nu standardul.

⚠️ **Constatarea asta NU mai apare pe paginile individuale** (Alex, 23 sept. 2026: „scoate notița cu
roșu"). Tabelul cu lunile reale a rămas — omul vede cifrele, inclusiv coloanele „fără date" — dar
interpretarea de calibrare e doar aici, pentru discuția internă.

**K1 — încasare la termen**, valorile reale pe sezon:

| Locație | Interval | Luni peste pragul de 70% |
|---|---|---|
| Ștefan cel Mare | 51,6% – 85,7% | 4 din 10 |
| Nicolina | 58,9% – 83,9% | 6 din 10 |
| Quasar 4 Kids | 18,4% – 46,1% | **0 din 10** |

⚠️ **La Q4K pragul de 70% n-a fost atins în nicio lună din sezon.** Dacă apare cineva la recepție
acolo, K1 e 0 din start. Pârghiile: prag pe locație, sau un K1 care măsoară progresul față de luna
trecută, nu nivelul absolut.

**K3 și K4 nu au nicio cifră.** `reactivare_21z` returnează numitor 0 pe toate lunile — jurnalul de
absențe de 21 de zile e nou și n-are încă istoric. `raspuns_24h` se completează manual din Meta
Business Suite, deci nu există nicăieri în DB. **Împreună sunt 180 lei din 430 la standard și 420 din
1.100 la maxim** — adică 42% din bonusul maxim nu se poate măsura azi.

**K5 are date doar din iulie 2026** încoace, de când trigger-ul umple `leads.locatie_id`
(migrația `20260917160000`). Septembrie 2026: Ștefan 45,5% (peste standard), Nicolina 10,0% (0),
Q4K 15,6% (0).

## 7. Ce trebuia construit înainte de prima plată — ✅ făcut pe 25 sept. 2026 (vezi §9)

Vestea bună: **motorul există deja**. `kpi_definitii` are exact cei 9 indicatori de front-desk
(migrațiile `20260901150000` → `20260917120000`), `kpi_grila_linii` are deja `prag_standard` /
`prag_peste` / `suma_standard` / `suma_peste` — exact forma acestei grile — iar
`calculeaza_raport_kpi` transformă o grilă într-o sumă în lei și îngheață luna.

Ce lipsește:

1. **`kpi_grile` are 0 rânduri.** Nu există nicio grilă configurată. De creat una pentru postul
   `front_desk`, cu cele 5 linii și pragurile de mai sus, atribuită fiecărui om.
2. **Locația pe cont.** Nici Petruța, nici Theo n-au `app_metadata.locatie_id`. Fără el
   `calculeaza_raport_kpi` n-are `p_locatii`. Se setează prin edge function `admin-users`.
3. **K4 n-are sursă.** Rămâne pe completare manuală (`raport_kpi_lunar.manual`), ca în definiție.
   De stabilit cine o completează și din ce raport Meta.
4. **K3 n-are istoric.** Nu e un bug — jurnalul de absențe e nou. Primul KPI credibil abia după
   câteva luni de date.
5. **Partea fixă nu e în aplicație deloc.** Grila KPI calculează doar bonusul; fixul, facturarea,
   fidelitatea și abonamentul stau azi în afara aplicației.
6. **Bonusul „facturare la timp" (200 lei) n-are definiție măsurabilă.** Azi e o bifă implicită.
   Dacă rămâne fix și necondiționat, e de fapt parte din salariu, nu bonus — de decis.

## 8. Decizii încă deschise

- ~~**Sensul lui K2**~~ — **ÎNCHIS (25 sept.)**: K2 = rata de încasare a managerului (§3).
- ⚠️ **Cifra de „peste standard"** — 4.022 calculat vs. ~4.180 în schiță (§5).
- **Pragurile sunt obiectiv sau medie?** (§6) La calibrarea de azi, bonusul real e ~1/3 din standard.
- **Q4K** — K1 e de neatins acolo cu pragul de 70% (§6).
- **Vara** — în iulie și august bonusul KPI de sezon nu se calculează; bonusurile de vară sunt
  **nedefinite**, ca la manageri.
- **Fidelitatea**: „de la 2 ani" în tabel, dar Alex a notat și „vechimea peste 3 luni". De lămurit
  care e pragul și dacă se aplică deja cuiva.
- **Norma lui Theo** — simulată pe normă întreagă. Dacă în realitate e parțială (ține și 2 grupe),
  fixul și KPI-ul se reduc proporțional și pagina trebuie refăcută.

## 9. Implementarea în aplicație (25 sept. 2026)

| Ce | Unde |
|---|---|
| Grila KPI | șablonul **„Recepție 2026-2027"** + câte o grilă activă pe om, de la 2026-09-01: Petruța → Galeriile Ștefan cel Mare, Theo → Nicolina. Șablonul vechi „Responsabil Relații Clienți" (MOA) a rămas neatins |
| Linii | K1 30% · K2 **0% (forfetar)** · K3 35% · K4 17,5% · K5 17,5%; „fără date = standard" pe toate; sumele pe trepte ca în §3; „peste X%" = X,01 (motorul compară cu ≥); bonus doar septembrie–iunie; fără eliminatorii; `cota_manager` 0 |
| K2 | cheia nouă `rata_incasare_m1` → `kpi_rata_incasare` (aceeași ca la manager); marcată „provizoriu" până la finalul lunii M+1 — luna nu se poate închide în raportul KPI până atunci |
| K4 | mod „doar rata" (`rata_standard` 85, `rata_peste` 95,01): contează doar rata de răspuns, completată manual. Necompletată = blochează închiderea lunii |
| K3 | fără poarta de 48 h din șablonul MOA (grila nu o cere) |
| Partea fixă | `salarizare_receptie` pe om (normă, facturare, fidelitate, abonament, bonusuri ocazionale) + sumele din `salarizare_grila` (post `receptie`) |
| Salariul lunii | `calculeaza_salariu_receptie(user, an, lună)`; confirmarea pe componente (`confirma_salariu_staff`): fixul oricând, bonusul KPI după finalul lunii, K2 după finalul lunii M+1 |
| Ecrane | `/salarizare` → tab „Recepție"; detaliul indicatorilor în `/raport-kpi` |

⭐ **Indicatorul care nu se poate măsura se plătește la STANDARD** (Alex, 25 sept. 2026), fără
redistribuire pe ceilalți. Motivul: K3 n-are încă niciun caz în jurnal, iar redistribuirea motorului
îi dădea Petruței 295 lei doar pe K5 (140 × 2,1). În motor e opțiunea pe linie `na_standard` („fără
date = standard"), bifată pe toate liniile șablonului „Recepție 2026-2027"; șablonul MOA păstrează
redistribuirea. **K4 necompletat nu intră aici**: e o cifră de completat manual, deci contează 0 în
previzualizare și blochează închiderea lunii până se completează.
