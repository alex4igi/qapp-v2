# Template-uri SMS — Quasar Dance (qapp v2)

> **Document de referință** — sursă unică pentru textele SMS. Codul oglindește acest
> document. Când schimbi un text aici, anunță-l ca să-l sincronizez în cod (nu se
> citește automat la runtime). Fișiere oglindă:
> - Kanban (leads) + confirmare inrolare: [`supabase/functions/_shared/sms.ts`](../../supabase/functions/_shared/sms.ts)
> - Bulk (restanțe): [`src/features/notificari-sms/templates.ts`](../../src/features/notificari-sms/templates.ts)
> - Contracte: [`supabase/functions/_shared/contractNotify.ts`](../../supabase/functions/_shared/contractNotify.ts) + `process-contract-reminders`
> - Cont de portal: [`supabase/functions/provision-client/index.ts`](../../supabase/functions/provision-client/index.ts)
> - Marketing vs tranzacțional: [`supabase/functions/_shared/smsCategorie.ts`](../../supabase/functions/_shared/smsCategorie.ts)

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
- Provider: **themarketer.com** (transactional 1-la-1; `SMS_PROVIDER=themarketer`).
  SMSLink a rămas fallback. Placeholderele `{...}` se completează automat.

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
Buna {prenume}! Sedinta gratuita Quasar Dance este confirmata pentru {data}, ora {ora}, la {adresa}. Va asteptam!
```
> Text nou 2026-09-20. „ora {ora}", nu „la ora {ora}": cu prepoziție, mesajul trecea
> de 160 la Ștefan cel Mare / Q4K de la nume ≥9 caractere (adresele lor au 46-47).

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
Buna {prenume}! Va reamintim: sedinta gratuita Quasar Dance este {astazi/maine}, {data}, ora {ora}, la {adresa}. Va asteptam!
```
> Text nou 2026-09-20. Două puncte în loc de „Va reamintim ca …", din același motiv
> de lungime; „AZI/MAINE" cu majuscule a devenit „astazi/maine".

### 3. `review` — la conversie (lead → client) — ✅ LIVRAT 2026-06-08
```
Buna {prenume}! Va multumim ca ati ales Quasar Dance. Daca experienta a fost una placuta, ne-ar ajuta o recenzie: {link}
```
> Text nou 2026-09-20. **MARKETING** — opt-out-ul îl oprește (vezi secțiunea D).
> ⚠️ Coada `confirmari_review_sms` nu mai e alimentată din 2026-09-16 (conversia nu
> mai programează review), deci practic nu pleacă nimic. Momentul nou propus — după
> minimum două prezențe, la 7-14 zile de la înrolare — **nu e încă decis**.

### 4. ~~`followup` — la mutarea lead → **Nu a venit**~~ — ⛔ SCOS 2026-09-19
> Înlocuit cu un **apel**: recepția sună la 2 zile de la absență (joi/vineri ⇒ luni).
> Decizie Alex — vezi `docs/procedura-leads-kanban.md`, secțiunea „«Nu a venit» se sună".
> Tipul a fost scos din `_shared/sms.ts`, `send-lead-sms` și `cron-afternoon`; rândurile
> istorice din `sms_logs` (`tip='followup'`) rămân.
```
(nu mai pleacă) Buna {prenume}! Ne pare rau ca nu ai ajuns la sedinta gratuita la Quasar Dance. Pentru a beneficia de ea, da-ne un mesaj la {telefon locatie}!
```

### 5. `waiting_list` — la mutarea lead → **Waiting list**
```
Buna {prenume}! V-am adaugat pe lista de asteptare Quasar Dance. Va contactam imediat ce devine disponibil un loc potrivit. Va multumim!
```
> Text nou 2026-09-20 — și cu 17 caractere mai scurt, deci intră în 1 segment
> inclusiv la numele de 20 de caractere (înainte trecea pe 2 de la 19).

### 6. `post_demo` — la 2 zile după ședința de probă, dacă NU s-a înscris — ✅ LIVRAT 2026-09-08
> Trimis de **`cron-afternoon`** (16:00 local, luni–vineri — din 2026-09-15; înainte
> cron-morning la 10:00), nu la un delay de 48h: ora fixă ține mesajul departe de
> seară și îl pune când e cineva la sală să răspundă. **Weekendul se sare** — un demo
> de joi primește mesajul luni (D-4), odată cu apelurile de pe lista de sunat.
> Fereastră de 2–4 zile pe interogare (rezistă la o rulare ratată), dedup pe
> `sms_logs` (`tip='post_demo'`, pe viață): cine vine la două demo-uri ia un singur SMS.
> **132 car. șablon + prenume → 1 SMS.** Numele e limitat la 20 car. de `numeSalut`
> (vezi Reguli de conținut), deci mesajul nu poate depăși 160.
>
> **Text impersonal cap-coadă** (2026-09-08): același mesaj ajunge și la părintele
> care citește despre copil, și la studentul care citește despre el. Nici „locul tău",
> nici „unde ai fost la probă" — se vorbește despre grupa de vârstă, nu despre cititor.
```
Buna {prenume}! Multumim pentru prezenta la sedinta de proba. Locurile se ocupa in ordinea inscrierii. Pentru rezervare, scrieti-ne la {telefon locatie}.
```
> Text nou 2026-09-20. **MARKETING** — opt-out-ul îl oprește (vezi secțiunea D).
> Varianta „de birou" („Va multumim pentru participarea la … ne puteti scrie la …")
> avea 144 car. de corp și trecea pe 2 segmente de la nume ≥10, adică la majoritatea
> leadurilor. Tăiată la 132, încape cu orice nume admis de `numeSalut`.
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
mâine 00:00 local), iar **`cron-afternoon`** (16:00 local, luni–vineri) îl trimite
a doua zi — înscrierile de vineri seara și din weekend primesc confirmarea luni.
Asta lasă o **fereastră de undo de ore întregi**: dacă înrolarea e ștearsă în
interval (greșeală), rândul dispare prin `ON DELETE CASCADE` și SMS-ul nu mai
pleacă; dacă e reziliată/dezactivată, cronul îl marchează `anulat` fără SMS.
Părțile opționale (zile/oră/instructor/preț/link) se omit dacă lipsesc.
> **~2 segmente SMS** (depășește 160 car. cu instructor + link WhatsApp — decizie asumată).
```
Buna ziua! Confirmam inscrierea pentru {prenume} la grupa {nume curs}. Program: {zile}, ora {ora}. Instructor: {nume instructor}. Abonament: {pret} RON/luna. Grup WhatsApp: {link_whatsapp}
```
> Text nou 2026-09-20. Nu mai deschide cu „Buna {prenume}!": mesajul e pentru
> părinte, despre copil, iar la o familie cu doi copii salutul pe prenumele unuia
> suna ca și cum mesajul ar fi pentru el. Orar diferit pe zile: „Program: Luni ora
> 17:00, Vineri ora 18:30."
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
Buna ziua! Va reamintim ca termenul de plata pentru abonamentul Quasar Dance este {termen}. Daca ati efectuat deja plata, va multumim.
```
> Text nou 2026-09-20. `{termen}` e data în clar („15 octombrie"), nu relativ
> („peste 3 zile"): loturile se generează într-o zi și se pot trimite în alta, iar
> „peste 3 zile" devine fals între generare și plecare.
**Varianta „reducere de familie"** (2026-08-31) — destinatarii cu cel puțin o rată
care are reducere de familie/cross-sell (`politica_discount > 0`) primesc
avertismentul că o pierd pe luna respectivă dacă depășesc termenul. Prețul promo
NU se mai pierde niciodată (regula din 2026-08-31), deci nu el e miza avertismentului.
`get_sms_recipients` întoarce `are_reducere`; composer-ul arată ambele variante în
previzualizare + badge „reducere familie" în listă.
```
Buna ziua! Termenul de plata pentru abonamentul Quasar Dance este {termen}. Dupa aceasta data, reducerea aferenta lunii curente nu se mai aplica.
```
> Textul e scurtat (fără „Daca ati achitat deja, va multumim.") ca să încapă în
> 160 car. — cu fraza de politețe ajungea la 185, adică 2 segmente.

**Varianta „după termen"** (2026-09-21) — între termen și ziua mesajului de datorii
(termen + 10 zile), reminderul rămâne deschis și pleacă aceeași formulare pentru
toți, fără avertismentul despre reducere: cine a plătit la timp prin transfer,
încă neimportat, o are întreagă, iar ceilalți au pierdut-o deja. 141 car. cu
„20 septembrie", deci 1 segment.
```
Buna ziua! Va reamintim ca termenul de plata pentru abonamentul Quasar Dance a fost {termen}. Daca ati efectuat deja plata, va multumim.
```
> Dedup-ul rămâne unul pe lună și cod: cine a primit reminderul la timp nu-l mai
> primește și pe cel de după termen.

### Calendarul trimiterilor (decis 2026-09-21)
Zilele stau la distanță fixă de termenul lunii: **reminder cu 5 zile înainte,
mesajul de datorii cu 10 zile după**. Termenul vine din sezon (prima și ultima
rată au termen propriu), deci septembrie și iunie se mută singure:

| Luna | Termen | Reminder | Datorii |
|------|--------|----------|---------|
| Septembrie (prima rată, 2026-2027) | 20 | 15 | 30 |
| Octombrie – mai | 15 | 10 | 25 (decembrie: **23**, nu de Crăciun) |
| Iunie (ultima rată, 2026-2027) | 7 | 2 | 17 |

Fereastra „Generează SMS-uri" arată calendarul lunii și avertizează când
`notificare_restante` se generează înainte de ziua datoriilor (rata lunii pare
restantă și la cei cu transfer neimportat). Regula e în
`src/features/notificari-sms/calendar.ts` + fereastra `reminder_plata` din
`get_sms_recipients` (migrația `20260921150000`).

### 7. `notificare_restante` — clienți cu restanță
```
Buna ziua! In evidentele Quasar Dance figureaza un sold restant de {total} RON pentru {nume}. Plata se poate face la studio sau in contul RO85 INGB 0000 9999 1498 9082. Pentru detalii: {nr telefon locatia inrolarii}.
```
La 2+ cursanți, numele trec în paranteză cu suma fiecăruia — textul aprobat anunța
doar totalul, dar o familie cu doi copii nu poate reconcilia un total cu ce a
plătit deja pentru unul dintre ei:
```
… un sold restant de 450 RON (Popescu Ana Maria 270 RON, Popescu Stefan 180 RON). Plata …
```
> Text nou 2026-09-20 — **cu ~76 caractere mai scurt** la doi cursanți, deci trece
> de la 3 segmente la 2.
> **Aliniat cu worklist-ul de recuperare** (2026-07-24, migrația `20260724100000`):
> țintește EXACT setul din `get_restante_worklist` — clienți **Activi**, neprescris,
> nereziliat, **cel puțin o rată chiar depășită** (nu doar luna curentă nescadentă).
> Clienții **fără familie** primesc și ei SMS (grupare pe client; telefon =
> `familii.telefon → telefon_2 → clienti.telefon → telefonul_2`). Rândurile fără
> niciun telefon apar în composer la „telefon invalid", nu mai sunt ascunse.

### 8. `avertisment_loc` — pierderea locului (restanță > 50 zile) — ✅ LIVRAT 2026-06-08
Un SMS / familie (listează copiii în pericol + suma totală). `{termen}` = data trimiterii + 2 zile.
```
Buna ziua! Pentru pastrarea {locului lui X / locurilor lui X si Y} la Quasar Dance, va rugam sa achitati soldul restant de {total} RON pana pe {termen}. Dupa aceasta data, {locul poate fi eliberat / locurile pot fi eliberate}. Pentru detalii: {telefon locatie}.
```
> Text nou 2026-09-20. Textul aprobat spunea „locurile rezervate familiei", fără
> nume; le-am păstrat, fiindcă de obicei doar unul dintre copii e în pericol.
> Spune acum și ce se întâmplă după termen — până acum mesajul cerea bani fără să
> zică ce se pierde.

### 9. ~~`mesaj_liber` — text liber ad-hoc~~ — ⛔ PARCAT 2026-09-20
> Fără șablon; textul e tastat de operator — exact de-aia a fost parcat: categoria
> marketing/tranzacțional nu se poate deduce din cod, deci gardul de opt-out nu-l
> acoperă. La momentul deciziei, **116 clienți activi cu opt-out** (din 665 de
> destinatari) ar fi primit un mesaj liber de marketing.
>
> Închis în DB (politica `situatie_sms_uri_adhoc_restrict`, migrația
> `20260920200000`), nu doar ascuns în UI. Costul parcării e zero:
> `situatie_sms_uri` n-a avut niciodată un rând cu `cod_mesaj = 'mesaj_liber'`.
>
> **Parcat, nu șters:** builderul, formularul „+ SMS manual" (`SmsQueueForm.tsx`) și
> ramura din `get_sms_recipients` rămân pe loc. Repornire: scoate codul din
> `SMS_BULK_PARCATE` (`templates.ts`) ȘI readu politica de RLS la varianta din
> `20260606210000`. Înainte de repornire, fă selectorul Operațional/Marketing.

---

## C. Contracte și cont de portal — trimise AUTOMAT, un singur canal

Un singur canal per familie: **SMS dacă are telefon, email doar ca rezervă**
(decis 2026-09-10). Rândul din `situatie_sms_uri` se scrie oricum, cu status final,
ca /notificari-sms să rămână jurnalul complet.

### 10. `contract` — contract pregătit de semnare (prima trimitere / „Retrimite link")
> `_shared/contractNotify.ts` → `mesajContract()`. Linkul de semnare are 75 car.
> (domeniu + token de 43), deci mesajul e inevitabil pe 2 segmente.
```
Buna ziua! Contractul pentru {prenume} este pregatit pentru semnare. Va rugam sa verificati datele si sa il semnati aici: {link}. Linkul este valabil {N} zile.
```

### 11. `contract_reminder` — contractul n-a fost semnat
> `process-contract-reminders`. Același link stabil, nu unul rotit.
```
Buna ziua! Contractul pentru {prenume} nu este inca semnat. Il puteti verifica si semna aici: {link}. Linkul mai este valabil {N} zile.
```

### 12. `cont_portal` — datele contului de membru (creare + resetare parolă)
> `provision-client`. Trimis de recepție, la cerere. Depășește 160 car. la un email
> obișnuit ⇒ 2 segmente; asumat, fiindcă pleacă o singură dată per cont.
> **Respectă zona interzisă din 2026-09-20** — vezi mai jos.
```
Quasar Dance: contul de membru este activ. Acces: {url} Email: {email} Parola temporara: {parola} Va recomandam sa schimbati parola dupa prima autentificare.
```

---

## D. Marketing vs tranzacțional — ce oprește opt-out-ul

Sursa unică: **[`supabase/functions/_shared/smsCategorie.ts`](../../supabase/functions/_shared/smsCategorie.ts)**.
Orice cale nouă de SMS își declară categoria acolo, nu în locul de unde trimite.

Regula (decisă 2026-09-20): `opt_out_marketing` din `clienti`/`leads`/`familii`
rămâne opt-out **de marketing**, nu blocare generală. Cine a cerut să nu mai
primească promovare continuă să primească mesajele pe care le-a provocat el —
interes legitim, GDPR art. 6 lit. f.

| Categorie | Mesaje | Opt-out |
|---|---|---|
| **Marketing** | `post_demo`, `review`, `followup` (parcat) | **blochează** |
| **Tranzacțional** | `confirmare`, `reminder`, `waiting_list`, `confirmare_inrolare`, `reminder_plata`, `notificare_restante`, `avertisment_loc`, `contract`, `contract_reminder`, `cont_portal` | nu blochează |

Unde e pus gardul:
- `send-lead-sms` — verifică `leads.opt_out_marketing` și sare dacă tipul e marketing;
- `cron-afternoon` — `post_demo` filtrează `opt_out_marketing = false` direct în
  interogarea de candidați, ca leadul cu opt-out să nu consume nici dedupul;
- `process-review-sms` — rândul se anulează cu motivul „opt-out marketing".

⚠️ **`mesaj_liber` nu e clasificat** — textul îl scrie operatorul, deci categoria nu
se poate deduce din cod, iar gardul de mai sus nu-l acoperă. De-aia a fost **PARCAT
pe 2026-09-20** (vezi §9): calea stă închisă în DB, nu deschisă pe încredere.
`esteMarketing()` întoarce `true` pentru orice cod necunoscut — plasa de siguranță
dacă se repornește vreodată. Condiția de repornire: selectorul obligatoriu
Operațional/Marketing în „Generează SMS-uri", cu excluderea automată a celor cu
opt-out și numărul lor afișat în previzualizare.

> Până la 2026-09-20 coloana `opt_out_marketing` era **doar audit**: se scria, se
> vedea în /opt-out și nu oprea nimic — omul care ceruse explicit să nu mai fie
> contactat primea în continuare „locurile se ocupă în ordinea înscrierii".

---

## E. Zona interzisă (quiet hours) — 19:30–10:00 local

Config în `parametri_aplicatie.sms_quiet_hours`, editabil din Setări. Gardianul
autoritar e `isQuiet(now)` evaluat **la trimitere**, nu `send_after`.

Toate căile de SMS o respectă:

| Cale | Cum amână |
|---|---|
| `send-lead-sms` | rând în `sms_amanate` |
| `process-sms-queue` | rând în `sms_amanate`, sursa trece pe 'Amanat' |
| `process-sms-amanate` | re-amână lotul scadent dacă e încă în fereastră |
| `process-programare-sms`, `process-review-sms` | împing `send_after` spre dimineață |
| `_shared/contractNotify.ts` | rând în `sms_amanate` |
| `provision-client` (`cont_portal`) | rând în `sms_amanate` — **din 2026-09-20** |
| `cron-morning` (10:00), `cron-afternoon` (16:00) | rulează prin construcție în afara ferestrei |

> `provision-client` era singura cale care suna direct `sendSms`, fără gard:
> recepția care crea un cont la 20:30 trimitea parola în mijlocul serii.

---

## F. `data_planificata` — termen, nu etichetă

`situatie_sms_uri.data_planificata` e **termenul** rândului. Din 2026-09-20,
`process-sms-queue` trimite numai rândurile cu `data_planificata` nulă sau ≤ ziua
locală curentă; restul rămân „De trimis" până la termenul lor și apar în rezultat
ca „N programate pentru mai târziu".

> Înainte, drain-ul lua tot ce era 'De trimis', deci data pusă în „+ SMS manual"
> nu amâna nimic — un mesaj programat pentru 1 octombrie pleca la prima apăsare pe
> „Trimite cele de trimis".

---

## Date partajate

### Adrese scurte (pentru SMS)
| Locație | Adresă SMS |
|---|---|
| Ștefan cel Mare | Galeriile Stefan cel Mare, et. 1 (langa SYNEVO) |
| Nicolina | Str. Izvor 14 (intrarea din spate) |
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
2. ✅ **Telefonul locației** (LIVRAT 2026-06-08) — hardcoded `TELEFOANE` în `_shared/sms.ts` (kanban) și `TELEFOANE_LOCATIE` în `templates.ts` (bulk). `get_sms_recipients` întoarce `nume_locatie` pentru maparea pe telefon.
3. ✅ **`avertisment_loc` > 50 zile + termen dinamic** (LIVRAT 2026-06-08) — prag `zile_dep > 50` în RPC; un SMS / familie cu suma totală; `{termen}` = data trimiterii + 2 zile.
4. ✅ **Scadențe prima/ultima rată** (LIVRAT 2026-06-08) — scadențele primei (luna de început, ex. sept.) și ultimei rate (luna de final, ex. iunie) se definesc EXPLICIT pe sezon (coloane `sezoane.scadenta_prima_rata` / `scadenta_ultima_rata`, editabile în formularul de sezon din /setari ȘI în wizard-ul de clonare — pasul 1, ca să nu fie uitate la sezonul nou). `get_sms_recipients` calculează scadența per rând (prima/ultima rată din sezon → data explicită; lunile intermediare → ziua 15) și o folosește pentru `zile_depasire`, fereastra `reminder_plata` și textul „N zile pana la termen". Necompletat pe sezon = ziua 15 (fallback). Ex. sezon 2025-2026: prima = 19 sept, ultima = 13 iunie.

### Segmente măsurate după rescrierea din 2026-09-20
Worst-case = numele cel mai lung admis de `numeSalut` (20 car.) + adresa cea mai
lungă (Ștefan cel Mare / Q4K, 46-47 car.).

| Mesaj | Înainte | Acum |
|---|---|---|
| `confirmare` | 2 seg. de la nume ≥9 | **1 seg.** până la nume de 15 |
| `reminder` | 2 seg. de la nume ≥9 | 2 seg. de la nume ≥9 (neschimbat) |
| `waiting_list` | 2 seg. de la nume ≥17 | **1 seg. mereu** |
| `post_demo` | 1 seg. mereu | 1 seg. mereu |
| `review` | 2 seg. de la nume ≥15 | 2 seg. de la nume ≥17 |
| `reminder_plata` | 1 seg. | 1 seg. |
| `notificare_restante` (2 cursanți) | 3 seg. | **2 seg.** |
| `avertisment_loc` | 2 seg. | 2 seg. |
| `confirmare_inrolare` | 2 seg. | 2 seg. |

Verificat rulând builderele reale pe 58 de combinații (nume × locație × tip):
0 mesaje urcă un segment, 4 coboară.

---

## Promo reînscrieri — termenul care taie discountul (2026-08-28)

`cancel_expired_reinscrieri()` (cron zilnic 00:30 UTC) folosește acum **scadența
reală a ratei**, aceeași expresie canonică ca `get_sms_recipients`: prima rată a
sezonului → `sezoane.scadenta_prima_rata`, ultima → `scadenta_ultima_rata`,
lunile intermediare → ziua 15. Înainte tăia promo-ul de pe **16 ale lunii**,
hardcodat — pentru sezonul 2026-2027 (prima rată = **20 sept**) ar fi anulat
prețul promoțional cu 4 zile înainte de termen.
