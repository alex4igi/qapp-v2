# Reguli de preț și reduceri

Sursa de adevăr pentru cum se calculează prețul unei rate lunare. Valabile de la
**sezonul 2026-2027** (decizii Alex, 2026-08-31). Dacă schimbi o regulă aici,
schimb-o și în cod — locurile sunt listate la final.

## Varianta scurtă (de transmis echipei)

> **Reguli de preț — sezonul 2026-2027**
>
> 1. Prețul de reînscriere e blocat pe tot sezonul. Nu se mai pierde niciodată.
> 2. Reducerile nu se adună. Se aplică una singură — cea mai bună pentru client.
> 3. Plătești după termen → pierzi reducerea de familie pe luna aia. Doar pe aia.
> 4. Reducerea pierdută nu se mai întoarce, nici dacă plătești a doua zi.
> 5. Termene: **20 sept** prima rată, **15** ale lunii restul, **7 iunie** ultima.
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
| Voucher manual | după voucher | ales explicit; **dezactivează politica** pe toată luna, în tot pool-ul |

Pool-ul = clientul + toți membrii familiei. Pe fiecare lună, **cel mai scump
abonament din pool rămâne integral**, restul primesc −10%. O a doua înrolare pe
același curs e dublură, nu cross-sell — nu primește reducere.

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

Două garduri intenționate:
- se aplică doar sezoanelor care încep de la **2026-09-01** (altfel prima rulare
  retrăgea retroactiv reducerea de pe 37 de rate din vara 2026);
- o rată creată **după** propriul termen (înscriere târzie în lună) nu e
  penalizată — n-a avut ce să rateze.

### 4. Termenele de plată

`scadenta_rata(data_incepere, sezon)`:

| Rata | Termen | De unde |
|---|---|---|
| prima lună a sezonului | `sezoane.scadenta_prima_rata` (20 sept pt. 2026-2027) | pe sezon |
| ultima lună a sezonului | `sezoane.scadenta_ultima_rata` (7 iunie pt. 2026-2027) | pe sezon |
| restul | ziua 15 | implicit |

## Unde trăiesc regulile în cod

| Regulă | Locul |
|---|---|
| Motorul de reduceri | `recalculate_pool_discount(uuid)` + triggerul `trg_enrollments_recalc` pe `enrollments` |
| Preview în formular | `preview_pool_discount(...)` → `previewPoolDiscount` → `PriceSummary.tsx` |
| Penalizarea pe scadență | cron `discount-familie-anulare-restante` → `cancel_discount_familie_restant()` **și** condiția `scadenta_depasita` din motor |
| Termenul unei rate | `scadenta_rata(date, uuid)` |
| Alerta pentru recepție | `getClientEligibilityContext` → `EligibilityAlerts.tsx` |
| SMS reminder | `get_sms_recipients` (`are_reducere`) → `templates.ts` |

**Capcană:** penalizarea trăiește în DOUĂ locuri (cron + motor) și trebuie ținute
sincronizate. Fără condiția din motor, orice modificare în familie ar re-acorda
reducerea și ar anula penalizarea aplicată de cron.

Migrațiile relevante: `20260518110000` (politica inițială), `20260701120000`
(dublură same-course), `20260831120000` (reduceri neacumulabile),
`20260831170000` + `20260831170100` (promo fix + penalizare), `20260831170200`
(SMS `are_reducere`).
