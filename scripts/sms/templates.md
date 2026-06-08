# Template-uri SMS — Quasar Dance (qapp v2)

> **Document de referință** — sursă unică pentru textele SMS. Codul oglindește acest
> document. Când schimbi un text aici, anunță-l ca să-l sincronizez în cod (nu se
> citește automat la runtime). Fișiere oglindă:
> - Kanban (leads): [`supabase/functions/_shared/sms.ts`](../../supabase/functions/_shared/sms.ts)
> - Bulk (restanțe): [`src/features/notificari-sms/templates.ts`](../../src/features/notificari-sms/templates.ts)

## Reguli de conținut
- **FĂRĂ diacritice** (ă→a, î/â→i/a, ș→s, ț→t) și **fără emoji** — GSM-7 le strică pe telefon.
- **160 caractere = 1 SMS.** Peste → se taxează 2+ mesaje. Țintă: 1 SMS unde se poate.
- Provider beta: **smslink.ro**. Placeholderele `{...}` se completează automat.

## Placeholdere
| Placeholder | Sens |
|---|---|
| `{prenume}` | prenumele lead-ului (fallback: „bun venit") |
| `{data}` | data + ora ședinței, ex: „12 iunie, ora 17:30" |
| `{adresa}` | adresa scurtă a locației (vezi mai jos) |
| `{link}` | link Google review al locației (vezi mai jos) |
| `{AZI/MAINE}` | „AZI" pentru ziua curentă, „MAINE" pentru weekend |
| `{nume + suma}` | listă „Nume Prenume in valoare de X RON" pe familie |
| `{N}` | zile rămase până la termenul de plată (ziua 15) |

---

## A. Mesaje kanban (leads) — trimise AUTOMAT

### 1. `confirmare` — la mutarea lead → **Programat**
```
Buna {prenume}! Sedinta gratuita la Quasar Dance e confirmata pe {data}. Va asteptam cu drag la {adresa}!
```

### 2. `reminder` — dimineața (10:00 local), ziua ședinței
> Weekend: programări sâmbătă → reminder vineri; duminică → sâmbătă (varianta „MAINE").
```
Buna {prenume}! Va reamintim de sedinta gratuita la Quasar Dance {AZI/MAINE}, {data}, la {adresa}. Te asteptam!
```

### 3. `review` — la conversie (lead → client) — ✅ LIVRAT 2026-06-08
```
Buna {prenume}! Ne bucuram ca faci parte din comunitatea Quasar Dance. Ne-ar ajuta enorm un review scurt: {link} Multumim!
```

### 4. `followup` — la mutarea lead → **Nu a venit**
```
Buna {prenume}! Ne pare rau ca nu ai ajuns la sedinta gratuita la Quasar Dance. Pentru a beneficia de ea, da-ne un mesaj la {telefon locatie}!
```

### 5. `waiting_list` — la mutarea lead → **Waiting list**
```
Buna {prenume}! Multumim pentru interes acordat catre Quasar Dance. Te-am adaugat pe lista de asteptare - te contactam imediat ce iti putem oferi un loc!
```

---

## B. Mesaje bulk (plăți / restanțe) — cu pas de selecție + confirmare

### 6. `reminder_plata` — reminder termen de plată (ziua 15)
```
Buna ziua! Va reamintim ca {N zile/maine/astazi} este termenul de plata pentru cursurile Quasar Dance. Echipa Quasar Dance
```

### 7. `notificare_restante` — clienți cu restanță
```
Buna ziua! Exista {plati restante/o plata restanta} la cursurile Quasar Dance pentru {nume + suma}. Se poate achita cash/card la studio sau prin transfer la IBAN RO85 INGB 0000 9999 1498 9082. Pentru intrebari, contactati-ne la {nr telefon locatia inrolarii}. Echipa Quasar Dance
```

### 8. `avertisment_loc` — pierderea locului (restanță > 50 zile) — ✅ LIVRAT 2026-06-08
Un SMS / familie (listează copiii în pericol + suma totală). `{termen}` = data trimiterii + 2 zile.
```
Buna ziua! Pentru a pastra {locul lui X / locurile lui X si Y} la Quasar Dance, te rugam sa achiti {total} RON pana pe {termen}. Pentru intrebari, contactati-ne la {telefon locatie}. Echipa Quasar Dance
```

### 9. `mesaj_liber` — text liber ad-hoc
- Fără șablon; textul e tastat de operator. **Doar manager în sus** (owner/admin/manager).

---

## Date partajate

### Adrese scurte (pentru SMS)
| Locație | Adresă SMS |
|---|---|
| Ștefan cel Mare | Galeriile Stefan cel Mare, et. 1 (langa SYNEVO) |
| Nicolina | Str. Izvor 14 |
| Quasar 4 Kids | Str. Clopotari 24 (intrarea din spate, usa mov) |

> Regulă: Nicolina + grupă Tiny (sau necunoscută) → folosește adresa/linkul Quasar 4 Kids.

### Linkuri Google review
| Locație | Link |
|---|---|
| Ștefan cel Mare | https://g.page/r/CboAnmV4dmnzEAE/review |
| Nicolina | https://g.page/r/CZJNnsti4alFEBM/review |
| Quasar 4 Kids | https://g.page/r/CRStMl8Jrwr7EBM/review |

### Plată
- **IBAN:** RO85 INGB 0000 9999 1498 9082
- Achitare: cash/card la studio sau transfer.

### Telefoane locații (pentru placeholderele `{telefon locatie}`)
| Locație | Telefon |
|---|---|
| Ștefan cel Mare | 0730 534 172 |
| Nicolina | 0770 227 580 |
| Quasar 4 Kids | 0745 371 200 |

> Sursa: momentan doar în acest doc / CLAUDE.md — NU în DB. De adăugat: lookup hardcoded în cod sau coloană `locatii.telefon`.

---

## De implementat (TODO — cerut 2026-06-08)
1. ✅ **Review pe conversie** (LIVRAT 2026-06-08) — `review` (#3) pleacă când lead-ul ajunge `convertit` (drag în coloană sau `linkLeadToClient`). Dedup pe `sms_logs` tip='review'. Trigger-ul de după demo (cron-morning) a rămas scos.
2. ✅ **Telefonul locației** (LIVRAT 2026-06-08) — hardcoded `TELEFOANE` în `_shared/sms.ts` (kanban `followup`) și `TELEFOANE_LOCATIE` în `templates.ts` (bulk). `get_sms_recipients` întoarce `nume_locatie` pentru maparea pe telefon.
3. ✅ **`avertisment_loc` > 50 zile + termen dinamic** (LIVRAT 2026-06-08) — prag `zile_dep > 50` în RPC; un SMS / familie cu suma totală; `{termen}` = data trimiterii + 2 zile.
4. ⏳ **Scadențe prima/ultima rată** — la abonamentul recurent prima și ultima rată au scadențe diferite de „ziua 15"; de luat în calcul la `reminder_plata` / `avertisment_loc` / `zile_depasire`. **BLOCAT:** nu există coloană `scadenta` în `plati_inrolari` (view) — scadența e derivată ca ziua 15 a lunii înrolării. Necesită reguli de business + posibil coloană nouă. De făcut într-o sesiune dedicată.

### Gata de sincronizat acum (text pur, fără funcții noi)
- `confirmare` (#1) — 162 car. worst-case (2 SMS la combinațiile lungi)
- `reminder` (#2) — 162 car. worst-case
- `waiting_list` (#5) — 153 car. ✓
- `reminder_plata` (#6) — 113 car. ✓ (fără hashtag)
