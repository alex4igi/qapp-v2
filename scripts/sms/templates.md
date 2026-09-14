# Template-uri SMS — Quasar Dance (qapp v2)

> **Document de referință** — sursă unică pentru textele SMS. Codul oglindește acest
> document. Când schimbi un text aici, anunță-l ca să-l sincronizez în cod (nu se
> citește automat la runtime). Fișiere oglindă:
> - Kanban (leads) + confirmare inrolare: [`supabase/functions/_shared/sms.ts`](../../supabase/functions/_shared/sms.ts)
> - Bulk (restanțe): [`src/features/notificari-sms/templates.ts`](../../src/features/notificari-sms/templates.ts)

## Reguli de conținut
- **FĂRĂ diacritice** (ă→a, î/â→i/a, ș→s, ț→t) și **fără emoji** — GSM-7 le strică pe telefon.
  O singură diacritică comută TOT mesajul pe UCS-2, unde un segment are **70** de
  caractere, nu 160 — un SMS normal ajunge la 3 segmente. Regula se aplică și
  valorilor dinamice, nu doar textului scris de noi.
- **Salutul e construit automat** (`salutSms` / `numeSalut` din `_shared/sms.ts`,
  2026-09-08): primul cuvânt din `{prenume}`, fără diacritice, maximum **20** de
  caractere (peste, mesajul cel mai lung ar trece de 160), maximum **3 cuvinte** în
  câmpul brut. Câmpul vine din formularul public, unde oamenii scriu propoziții
  („Sunt interesata de cursuri de dans mixt", „Abia astept sa vin").
- **Fără nume folosibil, salutul e doar „Buna!"** — niciodată „Buna bun venit!".
  Afectează 6,2% din leads (409 din 6.622: fără nume, propoziții, cifre, emoji).
  Pragul de 3 cuvinte e măsurat, nu ghicit: la 3 cuvinte baza are aproape numai
  nume reale (94, „Andronic Petronela Andreea"), la 4+ aproape numai răspunsuri
  scrise în câmpul greșit (21).
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

### 1. `confirmare` — la programarea leadului (curs SAU clasă demo)
> Pleacă la ~2 min după înscriere, prin coada `confirmari_programare_sms`.
> **Se leagă de PROGRAMARE, nu de statusul leadului** (2026-09-08): înscrierea din
> rosterul clasei demo nu readuce leadul în „Programat" dacă e deja `a_venit` sau
> programat pe altceva, iar vechea gardă (`leads.status='programat'`) îl lăsa fără
> confirmare deși era pe listă. Undo-ul e acum explicit: scoaterea omului de pe
> listă în cele 2 minute șterge rândul din coadă (ON DELETE CASCADE) și SMS-ul nu
> mai pleacă. Data/ora/adresa vin din evenimentul (sau cursul) programării, citite
> live la trimitere. Dedup pe `sms_logs (lead_id, tip, programare)` — deci o
> **reprogramare** (marți → joi) își primește confirmarea ei, ce înainte nu se
> întâmpla niciodată (dedupul era pe viață per lead).
```
Buna {prenume}! Sedinta gratuita la Quasar Dance e confirmata pe {data}. Va asteptam cu drag la {adresa}!
```

### 2. `reminder` — dimineața (10:00 local), ziua ședinței
> Weekend: programări sâmbătă → reminder vineri; duminică → sâmbătă (varianta „MAINE").
> **Sursa = programarea zilei** (`programari_leads`, `prezenta='programat'`), nu
> `leads.status` + `leads.data_programare` — deci o clasă DEMO se comportă exact ca
> un curs: cine e pe rosterul evenimentului primește reminder indiferent unde e
> leadul în kanban (înscrierea din rosterul demo nu-l readuce în „Programat" dacă
> e deja `a_venit` / `programat` pe altceva). **Ora și locația vin din evenimentul
> (sau cursul) programării, citite live la trimitere** — nu din copia stocată la
> înscriere, care rămâne veche dacă se mută ora. Evenimentul `Anulat` nu trimite.
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

### 6. `post_demo` — la 2 zile după ședința de probă, dacă NU s-a înscris — ✅ LIVRAT 2026-09-08
> Trimis de **`cron-morning`** (10:00 local), nu la un delay de 48h: ora fixă ține
> mesajul departe de seară. Practic 40–64h de la demo. **Duminica se sare** —
> mesajele cad luni, în aceeași zi cu lista de sunat (SMS la 10:00, telefonul după).
> Fereastră de 2–4 zile pe interogare (rezistă la o rulare ratată), dedup pe
> `sms_logs` (`tip='post_demo'`, pe viață): cine vine la două demo-uri ia un singur SMS.
> **139 car. șablon + prenume → 1 SMS.** Numele e limitat la 21 car. de `numeSalut`
> (vezi Reguli de conținut), deci mesajul nu poate depăși 160.
>
> **Text impersonal cap-coadă** (2026-09-08): același mesaj ajunge și la părintele
> care citește despre copil, și la studentul care citește despre el. Nici „locul tău",
> nici „unde ai fost la probă" — se vorbește despre grupa de vârstă, nu despre cititor.
```
Buna {prenume}! Locurile pentru grupa de varsta de dans, se ocupa in ordinea inscrierilor. Pentru rezervarea locului, da-ne un mesaj la {telefon locatie}.
```
**Nu primesc:** cine a ieșit între timp din `a_venit` (înscris / mutat — fereastră de
undo gratuită), `deja_client`, leadurile legate de un client încă Activ/Inactiv
(conversie neînregistrată — vezi `leaduriProtejate`), cine și-a luat deja altă
ședință, și cine n-are telefon.

> ⚠️ SMS-ul **nu** scrie în `lead_contacte`. Acolo orice rând stinge `flag_reminder`
> (trigger `bump_lead_ultima_contactare`), deci leadul ar dispărea de pe lista de
> sunat de luni. Automatul e prima atingere; apelul recepției rămâne a doua.

---

## A2. Confirmare înrolare recurentă — trimisă AUTOMAT, la cronul de a doua zi

### `confirmare_inrolare` — la crearea unei înrolări recurente (grupă/trupă)
La înrolare se pune un rând în coada `confirmari_inrolare_sms` (`send_after` =
mâine 00:00 local), iar **`cron-morning`** (10:00 local, a doua zi) îl trimite.
Asta lasă o **fereastră de undo de ore întregi**: dacă înrolarea e ștearsă în
interval (greșeală), rândul dispare prin `ON DELETE CASCADE` și SMS-ul nu mai
pleacă; dacă e reziliată/dezactivată, cronul îl marchează `anulat` fără SMS.
Părțile opționale (zile/oră/instructor/preț/link) se omit dacă lipsesc.
> **~2 segmente SMS** (depășește 160 car. cu instructor + link WhatsApp — decizie asumată).
```
Buna {prenume}! Iti confirmam locul in grupa {nume curs}, in zilele de {zile}, la ora {ora}, cu instructor {nume instructor}. Abonamentul lunar este {pret} RON. Grup WhatsApp: {link_whatsapp}
```
- `{nume curs}` = `cursuri.numele` · `{zile}` = `cursuri.zile` · `{ora}` = `cursuri.ora`
- `{nume instructor}` = titular din `cursuri_teacheri` (rol='titular'), fallback `cursuri.teacher`
- `{pret}` = rata lunară REALĂ a înrolării, din `enrollments.suma` — nu prețul de
  catalog al cursului. Include promo de reînscriere, −10% pe pool și voucherul.
  Se ia rata care se **repetă** peste lunile sezonului (prima lună poate fi
  prorata la înscriere târzie). La plată integrală (`Per an`): `suma / 10`.
  Fallback pe `cursuri.pret_lunar` / `round(pret_anual / 10)` doar dacă rândurile
  n-au sumă. Vezi `docs/reguli-preturi-reduceri.md`.
- `{link_whatsapp}` = `cursuri.link_whatsapp` (editat manual în profilul cursului)

---

## B. Mesaje bulk (plăți / restanțe) — cu pas de selecție + confirmare

### 6. `reminder_plata` — reminder termen de plată (scadența ratei)
```
Buna ziua! Va reamintim ca {N zile/maine/astazi} este termenul de plata pentru cursurile Quasar Dance. Echipa Quasar Dance
```
**Varianta „reducere de familie"** (2026-08-31) — destinatarii cu cel puțin o rată
care are reducere de familie/cross-sell (`politica_discount > 0`) primesc
avertismentul că o pierd pe luna respectivă dacă depășesc termenul. Prețul promo
NU se mai pierde niciodată (regula din 2026-08-31), deci nu el e miza avertismentului.
`get_sms_recipients` întoarce `are_reducere`; composer-ul arată ambele variante în
previzualizare + badge „reducere familie" în listă.
```
Buna ziua! Va reamintim ca {N zile/maine/astazi} este termenul de plata la Quasar Dance. Dupa acest termen se pierde reducerea de familie. Echipa Quasar Dance
```
> Textul e scurtat („la Quasar Dance" în loc de „pentru cursurile Quasar Dance")
> ca să încapă în 160 car. la worst-case „peste 19 zile" (148 car.).

### 7. `notificare_restante` — clienți cu restanță
```
Buna ziua! Exista {plati restante/o plata restanta} la cursurile Quasar Dance pentru {nume + suma}. Se poate achita cash/card la studio sau prin transfer la IBAN RO85 INGB 0000 9999 1498 9082. Pentru intrebari, contactati-ne la {nr telefon locatia inrolarii}. Echipa Quasar Dance
```
> **Aliniat cu worklist-ul de recuperare** (2026-07-24, migrația `20260724100000`):
> țintește EXACT setul din `get_restante_worklist` — clienți **Activi**, neprescris,
> nereziliat, **cel puțin o rată chiar depășită** (nu doar luna curentă nescadentă).
> Clienții **fără familie** primesc și ei SMS (grupare pe client; telefon =
> `familii.telefon → telefon_2 → clienti.telefon → telefonul_2`). Rândurile fără
> niciun telefon apar în composer la „telefon invalid", nu mai sunt ascunse.

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
| Quasar 4 Kids | 0770 227 580 |

> Q4K folosește **intenționat** numărul Nicolinei în SMS (recepția Nicolina face înscrierile Q4K; 0745 371 200 nu știe de clienți). Site-ul și restul documentelor păstrează 0745 371 200. Decizie Alex, 14.09.2026.

> Sursa: momentan doar în acest doc / CLAUDE.md — NU în DB. De adăugat: lookup hardcoded în cod sau coloană `locatii.telefon`.

---

## De implementat (TODO — cerut 2026-06-08)
1. ✅ **Review pe conversie** (LIVRAT 2026-06-08) — `review` (#3) pleacă când lead-ul ajunge `convertit` (drag în coloană sau `linkLeadToClient`). Dedup pe `sms_logs` tip='review'. Trigger-ul de după demo (cron-morning) a rămas scos.
2. ✅ **Telefonul locației** (LIVRAT 2026-06-08) — hardcoded `TELEFOANE` în `_shared/sms.ts` (kanban `followup`) și `TELEFOANE_LOCATIE` în `templates.ts` (bulk). `get_sms_recipients` întoarce `nume_locatie` pentru maparea pe telefon.
3. ✅ **`avertisment_loc` > 50 zile + termen dinamic** (LIVRAT 2026-06-08) — prag `zile_dep > 50` în RPC; un SMS / familie cu suma totală; `{termen}` = data trimiterii + 2 zile.
4. ✅ **Scadențe prima/ultima rată** (LIVRAT 2026-06-08) — scadențele primei (luna de început, ex. sept.) și ultimei rate (luna de final, ex. iunie) se definesc EXPLICIT pe sezon (coloane `sezoane.scadenta_prima_rata` / `scadenta_ultima_rata`, editabile în formularul de sezon din /setari ȘI în wizard-ul de clonare — pasul 1, ca să nu fie uitate la sezonul nou). `get_sms_recipients` calculează scadența per rând (prima/ultima rată din sezon → data explicită; lunile intermediare → ziua 15) și o folosește pentru `zile_depasire`, fereastra `reminder_plata` și textul „N zile pana la termen". Necompletat pe sezon = ziua 15 (fallback). Ex. sezon 2025-2026: prima = 19 sept, ultima = 13 iunie.

### Gata de sincronizat acum (text pur, fără funcții noi)
- `confirmare` (#1) — 162 car. worst-case (2 SMS la combinațiile lungi)
- `reminder` (#2) — 162 car. worst-case
- `waiting_list` (#5) — 153 car. ✓
- `reminder_plata` (#6) — 114 car. ✓ standard / 149 car. ✓ varianta reducere familie

---

## Promo reînscrieri — termenul care taie discountul (2026-08-28)

`cancel_expired_reinscrieri()` (cron zilnic 00:30 UTC) folosește acum **scadența
reală a ratei**, aceeași expresie canonică ca `get_sms_recipients`: prima rată a
sezonului → `sezoane.scadenta_prima_rata`, ultima → `scadenta_ultima_rata`,
lunile intermediare → ziua 15. Înainte tăia promo-ul de pe **16 ale lunii**,
hardcodat — pentru sezonul 2026-2027 (prima rată = **20 sept**) ar fi anulat
prețul promoțional cu 4 zile înainte de termen.
