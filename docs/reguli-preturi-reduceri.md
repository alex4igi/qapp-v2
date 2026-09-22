# Reguli de preț și reduceri

Sursa de adevăr pentru cum se calculează prețul unei rate lunare. Valabile de la
**sezonul 2026-2027** (decizii Alex, 2026-08-31). Dacă schimbi o regulă aici,
schimb-o și în cod — locurile sunt listate la final.

## Varianta scurtă (de transmis echipei)

> **Reguli de preț — sezonul 2026-2027**
>
> 1. Prețul de reînscriere e blocat pe tot sezonul. Nu se pierde pentru întârziere.
> 2. Reducerile nu se adună. Se aplică una singură — cea mai bună pentru client.
> 3. Plătești după termen → pierzi reducerea de familie pe luna aia. Definitiv.
> 4. **50 de zile întârziere → pierzi locul în grupă.** Accesul se blochează
>    automat, iar promo se termină odată cu locul.
> 5. **Plata întregului sezon dintr-o dată → −5%**, până la 30 septembrie și doar
>    dacă nu s-a achitat încă nicio rată. Nu se adună cu −10% de familie.
> 6. Termene: **20 sept** prima rată, **15** ale lunii restul, **7 iunie** ultima.
> 7. **Voucherele nu se combină cu prețul de reînscriere.** TRUPA50 (−50% pe ședință)
>    e doar pentru membrii trupelor — aplicația verifică singură.
>
> *Cifra o dă aplicația — recepția o citește din formular, n-o calculează.*

## Regulile în detaliu

### 1. Prețul promo de reînscriere e fix pe sezon

Odată bifat „Preț de reînscriere" la înrolare, `suma_baza` devine
`cursuri.pret_lunar_promo` și rămâne așa până la finalul sezonului, indiferent
dacă ratele se plătesc la termen sau nu.

Înainte de 2026-08-31 promo-ul se pierdea la prima rată restantă
(`cancel_expired_reinscrieri`, șters). Consecință: KPI-ul „pierduți promo" din
`get_reinscrieri_pierderi` raportează de acum 0 — fenomenul nu mai există.
Coloana `enrollments.promo_anulat_la` rămâne doar ca urmă istorică.

### 2. Reducerile nu se cumulează — se aplică cea mai bună

Reducerile posibile pe o rată:

| Reducere | Cât | Când |
|---|---|---|
| Preț de reînscriere | `pret_lunar_promo` în loc de `pret_anual`/10 | bifat manual la înrolare |
| Politică cross-sell / family | −10% | al 2-lea abonament din pool (client + frați) |
| Voucher manual | după voucher | ales explicit; **dezactivează politica** pe toată luna, în tot pool-ul; **nu se combină cu prețul de reînscriere** (vezi §6) |

Pool-ul = clientul + toți membrii familiei. Pe fiecare lună, **cel mai scump
abonament din pool rămâne integral**, restul primesc −10%. O a doua înrolare a
**aceluiași client** pe același curs e dublură, nu cross-sell — nu primește
reducere. Doi frați pe același curs sunt family legitim.

„Cel mai scump" se judecă după **prețul de listă** (rata normală), nu după
prețul promo — promo-ul e o reducere, nu prețul abonamentului. La egalitate de
preț de listă rămâne integral **rândul pe promo** (își păstrează promo-ul), iar
−10% merge la frate. Exemplu, frați pe același curs (listă 180, promo 170), unul
pe promo: **170 + 162 = 332**, nu 180 + 162 = 342. Dacă fratele fără promo e pe
un curs mai scump (ex. 290), el rămâne integral, iar copilul pe promo primește
`least(promo, rată_normală − 10%)`.

**Ordinea înscrierii nu contează.** O rată deja plătită nu se mai recalculează,
dar dacă a fost plătită **la preț întreg**, ea ocupă locul „integral" al lunii:
toți ceilalți frați primesc reducerea pe luna aia, chiar dacă fratele înscris
după plată e pe un curs mai scump (decizie Alex 2026-09-11 — reducerea „trece" pe
el, ca familia să nu piardă). Exemplu: Thea plătește septembrie 260 cât e singură,
apoi e înscrisă Sofia la 290 → Sofia 261 pe septembrie, 290 din octombrie.
Excepție: o rată plătită **după termen** poate avea reducerea 0 din penalizare —
aia nu ocupă locul (`ocupa_locul_integral`).

Când un rând stă pe preț promo ȘI ar primi −10%, se aplică **una singură**:

```
suma_finala = least(preț_promo, rată_normală − 10%)
```

Exemplu (curs cu `pret_anual` 2700, `pret_lunar_promo` 260):
primul copil 260, al doilea `least(260, 270−27)` = **243**, nu 234.

### 3. Termenul depășit anulează reducerea de familie pe luna respectivă

Dacă la scadență rata nu e acoperită integral, acea rată pierde
`politica_discount` și revine la `suma_baza`. **Doar luna aia** — celelalte
rămân neatinse. Penalizarea e **definitivă**: plata ulterioară nu o readuce.

„Acoperită la scadență" înseamnă **bani cu data plății ≤ scadență**
(`incasari.data`), nu bani prezenți în DB la ora verificării. Distincția contează
pentru că transferurile se înregistrează din extrasul ING, cu o zi–două întârziere.

Patru garduri intenționate:
- se aplică doar sezoanelor care încep de la **2026-09-01** (altfel prima rulare
  retrăgea retroactiv reducerea de pe 37 de rate din vara 2026);
- o rată creată **după** propriul termen (înscriere târzie în lună) nu e
  penalizată — n-a avut ce să rateze;
- **grație de 5 zile calendaristice** după scadență, înainte ca penalizarea să se
  aplice. E fereastra în care apucăm să importăm extrasul bancar; termenul
  clientului rămâne 15/20, se mișcă doar momentul în care verificăm noi
  (decizie Alex, 2026-09-20 — vezi mai jos de ce);
- decizia se ia **într-un singur loc**: funcția `penalizare_activa(enrollment)`.

> **De ce grația:** pe 20 septembrie 2026, prima scadență a sezonului, cronul ar
> fi tăiat reducerea a 19 rate (17 clienți, 392 RON) în noaptea de 21. Scadența
> pica duminică: oamenii transferaseră la termen, banii se procesau luni, iar
> extrasul se importa luni–marți. Cronul nu se uita deloc la data plății, deci îi
> trata ca restanțieri — ireversibil, fiindcă motorul nu reevaluează o rată care
> are încasări. Cronul a fost oprit manual înainte de rulare.

⚠️ Consecința pentru recepție: **data plății trebuie să fie data reală**, nu ziua
înregistrării. De aceea „Plată nouă" are câmp de dată pe toate tabelele de
încasare, iar fluxul bancă îl pre-completează cu `facturi_fgo.data_tranzactie`.

#### 3b. La 50 de zile se anulează locul în grupă

Peste 50 de zile de la termenul unei rate **din sezonul înrolării**, cursantul
pierde locul, iar prețul promo se termină odată cu el.

Aplicarea e **semi-automată**, deliberat:

| Pas | Cine | Ce se întâmplă |
|---|---|---|
| 1 | cron (zilnic, 10:00 local) | `suspendat_datorii = true` — nu mai intră la ore, nu mai rezervă |
| 2 | cron | email către toate conturile `owner`/`admin`/`manager`, cu lista |
| 3 | manager, din `/datorii` | confirmă rezilierea — locul se eliberează efectiv |

Rezilierea nu se automatizează pentru că e ireversibilă și **zeroizează lunile
viitoare** (`suma = 0`) — adică școala renunță la restul datoriei pe sezon. Aia e
o decizie de om. Suspendarea, în schimb, e reversibilă dintr-un click.

Gardul de scop: se numără doar rate din **sezonul înrolării**, și doar sezoane vii
(`sezoane.data_final >= azi`). Ca să pierzi locul în 2026-2027 trebuie să ratezi o
rată DIN 2026-2027 — datoriile vechi nu-ți anulează locul nou. Fără gardul ăsta,
prima rulare ar fi suspendat 241 de clienți (mediana 197 zile de întârziere),
adică arhiva de datornici, nu cursanții de azi.

#### 3c. Promo se pierde și la mutarea într-o trupă

Trupele nu au preț de reînscriere. Audițiile sunt **după** campania promo, deci
copilul e reînscris implicit în grupa lui (ca să-și țină locul) și abia apoi,
dacă intră, e mutat în trupă. `muta_inrolare_curs` tratează asta ca regulă de
business, nu ca eroare:

- `este_reinscriere = false` + `promo_anulat_la` pe **toată seria mutată**;
- lunile neplătite din luna curentă încolo — **inclusiv luna selectată** — trec
  pe rata trupei (`pret_anual / 10`);
- lunile deja plătite și cele din trecut **rămân la prețul lor** (nu rescriem
  plăți și nu taxăm cu tariful trupei o lună petrecută în grupă). Diferența nu
  se cere automat — fereastra de mutare o spune explicit;
- pierderea promo-ului nu depinde de bifa „Aplică tariful noului curs".

La **grupe** fără `pret_lunar_promo` excepția rămâne: acolo lipsa prețului e
fișă incompletă, nu regulă.

**Promo se termină odată cu locul:** triggerul `trg_enrollments_reziliere_promo`
pune `promo_anulat_la` și `este_reinscriere = false` la orice reziliere a unei
înrolări aflate pe promo. La o eventuală reîntoarcere pe același curs,
`createInrolari` refuză bifa de reînscriere — se reintră la preț întreg.

Suspendarea automată se distinge de cea manuală prin `suspendat_datorii_de`:
`NULL` = cron, un uuid = persoana care a apăsat butonul din /datorii. În worklist-ul
din /datorii, cele automate apar cu badge-ul roșu **„Loc de anulat"** (status propriu,
filtrabil), cele manuale rămân „Suspendat" — managerul vede dintr-o privire pe cine
mai are de decis.

## 4. Plata integrală a sezonului — −5%

Anexa 1 din contract: „Integrală pentru tot sezonul — 5% — scadent 30.09".

| Condiție | Detaliu |
|---|---|
| Până când | `sezoane.scadenta_plata_integrala` (30.09.2026 pe sezonul curent). NULL = oferta nu se aplică pe sezonul ăla |
| Pentru cine | Per **membru**, nu pe familie — fiecare copil are contractul lui |
| Pe ce | Doar abonamentele recurente (`Per luna` / `Per an`) din sezonul activ; facultativele se plătesc lună de lună |
| Când dispare | După termen **sau** după prima rată achitată (sezonul trebuie să fie neatins) |

**Nu se cumulează cu −10% de familie:** pe fiecare rată se aplică una singură, cea mai
avantajoasă — `suma_nouă = least(suma_curentă, preț_listă − 5%)`. O rată care are deja
−10% rămâne la −10%, iar dacă TOATE ratele au deja o reducere mai bună, oferta există
dar discountul e 0.

**Cei 5% se calculează pe valoarea contractului, nu rată cu rată:** `10 × round(290×5%)`
ar da 150 (5,17%). Diferența de rotunjire se corectează pe prima rată ⇒ 280 + 9×275 =
**2.755** exact. Dacă cineva întreabă de ce prima rată e 280, ăsta e motivul.

**Două intrări, un singur motor** (`_plan_plata_integrala`): portalul (membrul plătește
online) și recepția (tab-ul „Datorii" din Plată nouă). Diferă doar momentul în care
prețul se rescrie: în portal la confirmarea plății (un intent abandonat nu are voie să
lase reduceri în urmă), la ghișeu în aceeași tranzacție cu încasarea. În ambele cazuri
ordinea e **întâi banii, apoi `suma`** — `recalculate_pool_discount` ocolește rândurile
care au deja încasări, deci ordinea inversă ar rescrie prețul înapoi la întreg.

## 5. Termenele de plată

`scadenta_rata(data_incepere, sezon)`:

| Rata | Termen | De unde |
|---|---|---|
| prima lună a sezonului | `sezoane.scadenta_prima_rata` (20 sept pt. 2026-2027) | pe sezon |
| ultima lună a sezonului | `sezoane.scadenta_ultima_rata` (7 iunie pt. 2026-2027) | pe sezon |
| restul | ziua 15 | implicit |

## 6. Vouchere

Decizii Alex, 2026-09-14. Starea e pe voucher (`vouchere.activ`), nu în „0 utilizări".

| Voucher | Ce dă | Pe ce | Stare |
|---|---|---|---|
| P50 / P100 | −50% / −100% | **o singură rată lunară** | activ |
| RE10 / RE20 / RE50 | −10 / −20 / −50 lei | **o singură rată lunară** | activ |
| RE10M | −10 lei | o ședință (OPEN) | activ |
| TRUPA50 | −50% | o ședință (OPEN) | activ, **doar membrii trupelor** |
| P10 | −10% al 2-lea abonament | — | **închis**: reducerea de familie e automată (§2) |

A10 (plata integrală merge pe −5% din contract, §4) și LATESTART (prorata e automată) au fost
**șterse**; cele 12 înrolări vechi cu LATESTART își păstrează sumele, fără etichetă.

- **Voucherul lunar e o reducere pe O rată, nu pe sezon.** Pe tot sezonul se aplică automat
  reducerile de campanie (preț de reînscriere, familie / al 2-lea curs). La înrolare voucherul
  cade pe **prima rată creată**; restul ratelor rămân la preț normal, cu reducerile automate.
  DB-ul refuză același voucher pe mai multe rate ale aceluiași client+curs într-o singură scriere.
- **Nu se combină cu prețul de reînscriere.** Bifat promo ⇒ voucherul e blocat în formular,
  iar DB-ul refuză orice rând cu `este_reinscriere` + `voucher`.
- **Condițiile se verifică în DB**, nu în formular. Azi există una: `trupa` = clientul are o
  înrolare activă, nereziliată și neîncheiată (`data_final` ≥ azi) într-un curs `nivelul='Trupa'`.
  Rândurile din sezonul trecut nu mai contează.
- **Recepția vede doar ce se poate aplica** clientului ales; pentru restul formularul spune
  de ce nu (ex. „TRUPA50: Doar membrii trupelor pot folosi acest voucher.").
- **Pe ședința OPEN** voucherul scade din prețul ședinței: `suma_baza` = preț, `suma` = datorat.
  Încasat mai puțin decât datoratul ⇒ restul e restanță, ca înainte.
- **Plățile simple** (bilet/merch/taxe) primesc doar vouchere fără tip de plată, curs, client
  sau condiție. Azi nu există niciunul, deci câmpul nu apare.
- Plata online (webhook) nu mai e reverificată la confirmare: codul e validat la crearea
  comenzii, iar un refuz după ce banii au intrat ar lăsa plata fără înrolare.

## 7. Prima rată la înscriere târzie (prorata)

Cine se înscrie după startul sezonului plătește prima lună **prorata**, dar regula
se uită la **ședințele pierdute**, nu la ziua din calendar:

- **Nu pierde nicio ședință din lună ⇒ rată întreagă.** Exemplu real (20 sept. 2026):
  două fete au fost înrolate pe „N Dans Juniori INC SD" (Sâmbătă+Duminică) cu start
  **3 octombrie**. 3 octombrie e chiar *prima* ședință a lunii — prind toate cele 9
  ședințe din octombrie, deci prima rată e **270**, nu prorata.
- **Pierde ședințe ⇒** `ședințe rămase × cursuri.pret_sedinta`, **plafonat la rata lunii**.
  Plafonul e obligatoriu: `pret_sedinta` e preț de **drop-in** (38 RON), mai scump per
  ședință decât abonamentul (270 / 9 = 30 RON), deci fără plafon o lună aproape întreagă
  ar costa mai mult decât una plină (9 × 38 = **342** > 270).
- **Septembrie (luna de start) — ședințele se numără de la startul sezonului, nu de la 1.**
  Cine pornește cu sezonul (sau s-a reînscris din vară) plătește **rata întreagă**, cu
  `data_incepere` = startul sezonului — modelul rămâne 10 rate egale = `pret_anual`.
  Cine vine după start plătește **proporțional**: `rată × ședințe prinse / ședințe de la start`
  (decizie Alex, 22 sept. 2026). Nu drop-in: septembrie e deja o lună scurtă plătită integral
  de colegi (270 / 6 = 45 RON/ședință), iar prețul de drop-in (38) i-ar face pe cei întârziați
  mai ieftini pe ședință decât cei veniți la timp. Exemplu, Sâm+Dum, 6 ședințe din 12 sept:
  semnat 20 sept ⇒ 3/6 ⇒ **135**; cu preț de reînscriere 260 ⇒ **130**.
- **Nicio ședință rămasă în luna semnării ⇒ prima rată e luna următoare.** Semnat 28 sept pe
  un curs de Sâm+Dum ⇒ fără rată pe septembrie; înainte plătea 270 pentru zero ședințe.
- **Doar de acum înainte:** înrolările de septembrie create înainte de 22 sept. 2026 (50 care
  pierd ședințe, ~5.472 RON) rămân la rata întreagă — decizie Alex, fără corecție retroactivă.
- **Trupele n-au prorata** (toți încep la 1 septembrie, contractul e ferm pe sezon).
- **Facultativele n-au prorata** — luna se plătește integral, indiferent de zi.

Fallback când cursul n-are `pret_sedinta`: `pret_anual / ședințe_totale_sezon`. Dacă n-are
nici `pret_anual`, formularul blochează înrolarea și cere setarea prețului în Studio → Cursuri.

## Unde trăiesc regulile în cod

| Regulă | Locul |
|---|---|
| Motorul de reduceri | `recalculate_pool_discount(uuid)` + triggerul `trg_enrollments_recalc` pe `enrollments` |
| Preview în formular | `preview_pool_discount(...)` → `previewPoolDiscount` → `PriceSummary.tsx` |
| Penalizarea pe scadență | cron `discount-familie-anulare-restante` → `cancel_discount_familie_restant()` **și** condiția `scadenta_depasita` din motor |
| Termenul unei rate | `scadenta_rata(date, uuid)` |
| Alerta pentru recepție | `getClientEligibilityContext` → `EligibilityAlerts.tsx` |
| Regula 50 de zile | `suspenda_datornici_50_zile()`, chemat din edge function `cron-morning` (care trimite și emailul) |
| Promo se termină cu locul | trigger `trg_enrollments_reziliere_promo` + gardul din `createInrolari` |
| Promo se pierde la mutarea în trupă | `muta_inrolare_curs` → `MoveEnrollmentModal.tsx` |
| Plata integrală −5% (motor comun) | `_plan_plata_integrala(uuid)` |
| …intrarea portalului | `plan_plata_integrala_sezon` → `netopia-create-payment` → `confirm_netopia_payment` |
| …intrarea recepției | `plan_plata_integrala_staff` + `incaseaza_plata_integrala_sezon` → `DatoriiUnificateTab.tsx` |
| SMS reminder | `get_sms_recipients` (`are_reducere`) → `templates.ts` |
| Voucher: verdictul unic (activ, date, client, curs, tip, condiție, limită) | `_voucher_motiv_invalid(uuid, uuid, uuid, tip_plata)` |
| …portal | `validate_voucher_code` → `netopia-create-payment` |
| …dropdown-ul recepției | `list_vouchere_aplicabile` → `VoucherField.tsx` (EnrollmentForm + OpenClassTab) |
| …gardul pe orice insert | triggerele `trg_enrollment_voucher_valid` (+ regula cu reînscrierea) și `trg_incasare_voucher_valid` |
| …o singură rată lunară | `buildRecurentPerLuna` (doar prima rată) + triggerele `trg_enrollments_voucher_o_rata_ins/_upd` |
| Prorata primei luni (§7) | `buildRecurentPerLuna` ([enrollments.ts](../src/features/plati/api/enrollments.ts)) + preview-ul `derivePreviewRecurent` ([helpers.ts](../src/features/plati/components/EnrollmentForm/helpers.ts)) — ambele folosesc `countSessionsBetween` din `api/calendar.ts` |
| …ședința OPEN la recepție | `rezerva_loc_open(..., p_voucher)` |

**Penalizarea are o singură definiție:** `penalizare_activa(enrollment)`. O cheamă
toate cele trei consumatoare — cronul `cancel_discount_familie_restant`, motorul
`recalculate_pool_discount` (fără condiția din motor, orice modificare în familie
ar re-acorda reducerea și ar anula penalizarea cronului) și `ocupa_locul_integral`.
Până în 2026-09-20 condiția era copiată în toate trei și divergase: doar
`ocupa_locul_integral` se uita la data plății.

Migrațiile relevante: `20260518110000` (politica inițială), `20260701120000`
(dublură same-course), `20260831120000` (reduceri neacumulabile),
`20260831170000` + `20260831170100` (promo fix + penalizare), `20260831170200`
(SMS `are_reducere`), `20260831190000` (regula 50 de zile + promo se termină cu locul),
`20260911150000` („cel mai scump" = preț de listă; frate pe același curs vizibil în preview),
`20260911160000` (rata plătită întreg ocupă locul integral → frații primesc reducerea),
`20260912100000` (promo se pierde la mutarea în trupă + `cursul` în triggerul de recalcul),
`20260912120000` (plata integrală −5%, intrarea din portal),
`20260913130000` (același motor, extras + intrarea de la recepție),
`20260920210000` (grație 5 zile + criteriul pe data plății, regula într-un
singur loc: `penalizare_activa`).
