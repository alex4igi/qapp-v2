# Audit de securitate — 20 septembrie 2026

Acoperă cele trei sisteme: **qapp v2** (CRM staff), **qapp-membri** (portal, membri.quasardance.ro) și **quasardance.ro** (site public).
Cerința lui Alex: să nu pierdem date, să nu se divulge date, să nu luăm amenzi, clienții să nu-și piardă banii plătiți online.

> Documentul descrie vulnerabilități. Rămâne în repo-ul privat; nu se publică și nu se trimite pe link.

---

## 1. Pe scurt

Două lucruri erau grave și sunt **închise de azi, pe baza live**:

1. **Lista de opt-out (5.934 de nume, emailuri, telefoane) și restanțele cu nume se puteau citi de pe internet, fără nicio logare**, doar cu cheia publică a aplicației (cea care stă în orice browser care deschide portalul). Verificat practic înainte și după: acum răspunsul e „permission denied".
2. **Un părinte logat în portal putea chema funcții de staff**: citea telefoanele și emailurile leadurilor convertite, numele tuturor clienților, restanțele oricui, își putea activa singur prețul promo de reînscriere, putea „restitui" credit și putea rula joburile de noapte. Verificat pe definițiile live; acum primește „Acces refuzat".

Un lucru e grav și **depinde de tine**:

3. **Baza de date nu are niciun backup.** Proiectul Supabase e pe planul Free, care nu face backup-uri. Acolo stau 6.299 de clienți, 1.004 familii, 6.611 leaduri și 55.551 de încasări. O ștergere greșită sau o problemă la furnizor ar fi definitivă.

Nu am găsit secrete în istoricul git (toate cele 3 repo-uri sunt private, scanate integral). Plata Netopia verifică semnătura, suma și nu se poate dubla. Cron-urile cer secret. RLS e activ pe toate cele 100 de tabele.

---

## 2. Ce am închis azi (aplicat și testat pe baza live)

| # | Problema | Ce am făcut | Verificare |
|---|---|---|---|
| 1 | `opt_out_list` și `datorii_rest` citibile fără login (view-uri care ocolesc RLS + drept de citire pe rolul anonim) | View-urile respectă acum RLS-ul apelantului; rolul anonim nu mai are acces | Test cu cheia publică: HTTP 401. Recepția vede ca înainte; portalul și agenția văd 0 rânduri |
| 2 | `bilete_publice` și `produse_publice` puteau fi **modificate sau șterse** de oricine (erau editabile și aveau drept de scriere pe anonim) | Rămân publice doar la citire | `check-views.mjs` verde |
| 3 | Înregistrarea publică de conturi e activă în Supabase, iar un cont fără rol era tratat drept **recepționer** | Baza refuză orice cont creat fără rol. Conturile din Setări → Utilizatori merg normal | `scripts/test-auth-guard.mjs`: signup public refuzat, cont cu rol OK, cont fără rol refuzat |
| 4 | 27 de funcții interne (cron, KPI, conversii ads, suspendare datornici) apelabile de orice cont logat, inclusiv părinte | Le poate chema doar serverul | Test ca părinte: fără drept. Test ca server: funcționează (35 conversii, 63 leaduri de flagat) |
| 5 | 18 funcții de staff fără gard de rol (preț promo, credit, opt-out, potrivire plătitor, restanțe, anunțuri, prețuri închirieri, bilete) | Gard: portalul și agenția sunt refuzate; pe cele de bani și consimțământ, și instructorii | Părinte → „Acces refuzat"; recepție → merge |
| 6 | Orice cont de staff, inclusiv instructor, putea pune în coadă **SMS cu text liber către orice număr** | Coada se alimentează doar din server | Politica de inserare ștearsă |
| 7 | Orice staff putea modifica comenzile Netopia, registrul de casă, folosirile de vouchere, registrul reînscrierilor și putea șterge documentele clienților | Scriere doar pentru owner/admin (comenzi) sau owner/admin/manager/recepție (restul) | Politici noi |
| 8 | Datele firmelor (IBAN-uri, serie facturi) citibile cu cheia publică | Doar conturi logate | Politică nouă |

Migrații: `20260920104407`, `20260920104710`, `20260920104956`, `20260920123550` (toate în `supabase/migrations/`).
Gardieni noi, de rulat după migrații: `node scripts/check-views.mjs`, `node scripts/test-auth-guard.mjs`. Reguli noi în `CLAUDE.md`: „Regulă view-uri" și „Regulă gard de rol în RPC".

**Pregătit local, nepublicat (așteaptă „da, dă push" de la tine):**

- Dependențe cu vulnerabilități cunoscute, actualizate, build-uri verzi: `react-router-dom` 7.18.4 (CRM și portal), `pdfjs-dist` 6.3 (CRM), `next` 16.2.5+ (site — versiunea veche avea două vulnerabilități critice publicate).
- Antete de securitate de bază pe toate cele trei (anti-încadrare în iframe, anti-sniffing, referrer).

---

## 2b. Ce am mai închis după raport (tot pe baza live)

Aplicat în aceeași zi, după ce raportul de mai sus era scris. Toate sunt migrații pe baza de
date, deci sunt deja active — nu așteaptă niciun deploy.

| # | Problema | Ce am făcut | Verificare |
|---|---|---|---|
| 9 | Orice cont de staff putea **modifica sau șterge o încasare direct prin API**, fără să rămână urmă: jurnalul era scris de aplicație, ca al doilea pas, și putea pur și simplu să lipsească | Dreptul direct de modificare/ștergere e revocat. Modificările trec prin trei funcții de bază de date care cer motiv și scriu urma **în aceeași operație**: corectarea sumei/datei (manager+), corectarea formei de plată (recepția), ștergerea (manager+). Ștergerea unei datorii e prinsă de un declanșator | `scripts/check-audit-bani.mjs` verde; test pe date reale, cu curățenie: modificare directă refuzată, instructor refuzat, manager acceptat, 3 urme scrise |
| 10 | Rolurile publice ale bazei aveau **TRUNCATE pe toate cele 127 de tabele** — comanda care golește un tabel dintr-o dată și pe care regulile de acces NU o filtrează | Rolurile de API au rămas doar cu citire/adăugare/modificare/ștergere de rânduri. La fel pentru tabelele viitoare | `scripts/check-drepturi-tabele.mjs` verde |
| 11 | Calendarul de **vacanțe se citea fără login**, cu cheia publică (aceeași greșeală de politică prin care se citea lista de opt-out) | Doar conturile logate. Plus un view nefolosit, rămas din schema veche, scos de pe cheia publică | `scripts/check-citire-anon.mjs` verde — lovește API-ul cu cheia publică pe toate cele 132 de tabele și view-uri |
| 12 | O funcție internă rula fără cale fixă de căutare (poate fi păcălită să lucreze pe alt tabel) | Cale fixată | Zero funcții privilegiate fără cale fixă |

**Gardieni noi**, de rulat după orice migrație: `node scripts/check-audit-bani.mjs`,
`node scripts/check-drepturi-tabele.mjs`, `node scripts/check-citire-anon.mjs`.

⚠️ Un tabel creat din interfața Supabase (nu prin migrație) primește înapoi drepturile largi —
rulează `check-drepturi-tabele.mjs` după.

---

## 3. Ce trebuie să faci tu (nu se rezolvă din cod)

În ordinea importanței.

### 3.1 Backup — azi

- **Treci organizația Supabase pe planul Pro** (aprox. 25 USD/lună). Aduce backup zilnic automat, păstrat 7 zile. Tot Pro deblochează și verificarea parolelor compromise. Din dashboard: Organization → Billing → Upgrade.
- **Fă un export propriu, independent de Supabase.** Scriptul e gata: `node scripts/backup-export.mjs`. Scrie toate tabelele și cele 219 contracte semnate în `~/Documents/quasar-backup/supabase/<data>/`. Nu l-am rulat: sistemul de siguranță al sesiunii a blocat exportul de date personale pe disc fără acordul tău. Laptopul are discul criptat (FileVault e pornit), deci locul e potrivit.
- **Time Machine nu funcționează** pe laptop („Failed to mount destination"). Documentele din `Management/`, `docs/`, Obsidian nu sunt în git și nu au altă copie.
- Un backup netestat nu e backup: o dată pe trimestru, restaurează exportul într-un proiect Supabase de test.

### 3.2 Setări de cont — 30 de minute

- Supabase → Authentication → Sign In / Providers → **„Allow new users to sign up" = OFF**. Baza refuză deja conturile fără rol, dar setarea trebuie închisă și ea.
- **Autentificare în doi pași (2FA)** pe: Supabase, Vercel, GitHub, Google Workspace, Netopia, FGO, theMarketer, Meta Business, registrarul domeniului (ROTLD). Oricare dintre ele, compromis, înseamnă date sau bani.
- Niciun cont de staff din CRM nu are 2FA, iar parola minimă e de 6–8 caractere. Pentru owner și admin merită activat TOTP (cere puțin cod; vezi 4.7).
- Contul `parinte` rămas în lista de conturi Supabase Auth e moștenire (portalul nu mai folosește Supabase Auth). De șters.

### 3.3 Plăți

- **4 comenzi Netopia de 290 lei stau „în așteptare" din 12–16 septembrie**, fără număr de tranzacție. Cel mai probabil sunt plăți abandonate. Verifică-le în panoul Netopia: dacă vreuna apare încasată acolo, clientul a plătit și aplicația nu știe. (Mai sunt 2 de 10 lei din iulie — testele tale.)
- Toate cele 10 plăți online confirmate au factură emisă.

### 3.4 Email — protecție la phishing în numele școlii

DMARC e pe `p=none`: oricine poate trimite emailuri „de la @quasardance.ro" (de exemplu „plătiți rata aici") și nu sunt respinse. SPF mai autorizează și IP-ul serverului vechi, scos din uz (`213.239.206.136`) și `+a`.
De făcut în Vercel → Domains: scoate `ip4:213.239.206.136` și `+a` din SPF; treci DMARC pe `p=quarantine`, apoi după 2–3 săptămâni de rapoarte curate pe `p=reject`.

### 3.5 GDPR și legal — „să nu iau amenzi"

Partea asta nu a fost auditată complet (vezi secțiunea 6). Ce am verificat eu:

| Subiect | Stare | De făcut |
|---|---|---|
| Consimțământ pentru SMS/email de marketing către leaduri | Formularul de pe site spune doar „ești de acord cu politica de confidențialitate". Landing-ul de campanie are bifă separată — corect | Bifă separată, nebifată implicit, și pe formularul principal; salvată pe lead; campaniile promo filtrează pe ea. Legea 506/2004 cere acord prealabil pentru SMS comercial. De confirmat cu juristul |
| Politica de confidențialitate a site-ului | Revizuită ultima dată 20.08.2024, generică. Nu numește furnizorii reali (Supabase, Vercel, theMarketer, Netopia, Meta, Google), nu dă termene de păstrare, nu spune nimic despre datele copiilor | Rescrisă pe ce face sistemul efectiv. Pot face un draft |
| Păstrarea datelor | 4.088 din 6.299 de clienți nu au nicio activitate de peste 3 ani și sunt păstrați integral, din 2017 | Regulă de retenție + job de anonimizare (facturile rămân în FGO, contabil) |
| Cereri de acces / ștergere | Nu există unealtă; se pot face doar manual, din SQL | Procedură scrisă + funcție „exportă / anonimizează client" |
| Agenția de ads (rol `marketing`) | Vede toate cele 6.611 leaduri cu nume și telefon, inclusiv copii | Acord de prelucrare a datelor (DPA) semnat cu agenția; ideal, o vedere fără telefon/nume |
| Registru de prelucrări (art. 30), procedură de breșă (72 h), DPA-uri cu furnizorii | Nu există documente | De întocmit; pot face șabloanele |
| Portal: termeni, retur 14 zile, ANPC/SOL, date firmă, cookies | Există și sunt corecte | — |
| Cookie banner pe site, Consent Mode v2, Meta CAPI doar cu acord | Există | — |

Despre ce s-a întâmplat azi: lista de opt-out a fost accesibilă public o perioadă. Nu am găsit semne că a fost citită de cineva din afară (nu am cum să demonstrez contrariul pe planul Free, logurile se păstrează puțin). Dacă ai motive să crezi că a fost accesată, GDPR cere notificarea ANSPDCP în 72 de ore. Merită o discuție scurtă cu juristul.

---

## 4. Ce rămâne de construit (cere cod și publicare)

În ordinea pe care o propun.

1. **Edge functions care nu verifică cine le cheamă.** `send-lead-sms` și `process-sms-queue` acceptă orice token valid, inclusiv cheia publică. Impact limitat: trimit doar SMS-uri șablon, o singură dată pe lead, respectiv coada compusă de recepție. Fix: verificare de rol în funcție + helper comun; tot acolo se scoate fallback-ul „fără rol = recepționer" din 6 funcții.
2. **Plată reușită, dar comanda eșuează** (rezervarea a expirat între timp, sumă diferită, IPN pierdut). Azi comanda e marcată „failed" și nu află nimeni; clientul a plătit. Fix: notificare către admin la fiecare asemenea caz + un job care întreabă Netopia de starea comenzilor rămase în așteptare.
3. **Linkul de semnare a contractului.** Pagina publică precompletează CNP, serie CI, adresă și copiii familiei pentru oricine are linkul, iar descărcarea contractului semnat merge pe viață. Fix: CNP/CI mascate, descărcare limitată la 30–90 de zile, apoi doar din portal, logat.
4. **Conturile de portal.** Parolele propuse sunt „Nume + 4 cifre", pleacă în clar pe SMS/email și nimic nu obligă schimbarea. Planul cu parolă comună temporară permite preluarea contului de către oricine știe emailul altui părinte. Fix: link de activare unic per cont (mecanismul de reset există deja), parole aleatoare, blocare progresivă la încercări greșite, limită pe cererile de resetare.
5. **Formularul public de pe site.** Fără limită de trimiteri și fără captcha: se pot injecta leaduri false, se pot trimite emailuri de confirmare către adrese străine de pe contul tău theMarketer, se pot crea „campanii" la nesfârșit, iar răspunsul spune dacă un telefon e deja în CRM. Fix: Cloudflare Turnstile (vezi secțiunea 5), listă fixă de campanii în CRM, răspuns neutru. Admin-ul site-ului: o singură parolă, fără limită de încercări.
6. **Instructorii văd tot.** Cei 9 instructori pot citi prin API toți clienții, familiile, leadurile, încasările, contractele și SMS-urile, nu doar grupele lor. E o decizie de produs: citire limitată la propriile grupe. Cere testare atentă a ecranelor de instructor.
7. **Urme și 2FA.** Recepția poate modifica orice încasare și poate șterge datorii fără să rămână urmă în bază. Fix: trigger de audit pe `incasari` și `datorii`. Plus TOTP pentru owner/admin.
8. **Curățenie:** funcția `chatbot` e publicată și activă deși qbot e parcat și nu are sursă în repo (de șters); secretele `SMSLINK_*` au rămas deși furnizorul e theMarketer; 51 de funcții fără `search_path` fix; mesaje de eroare interne întoarse de endpoint-urile publice; CSP pe cele trei site-uri; drepturi implicite prea largi pe tabele (inclusiv TRUNCATE) pentru rolurile de API.

---

## 5. Cloudflare — ce e adevărat din ce ți s-a spus

Cloudflare oferă două lucruri utile aici:

- **Turnstile**, un captcha gratuit și invizibil. Se pune pe formularul de înscriere și pe login-ul de admin al site-ului și funcționează indiferent unde e găzduit site-ul. E recomandarea mea pentru punctul 4.5. Ai nevoie doar de un cont Cloudflare gratuit, de unde iei două chei.
- **Proxy cu firewall (WAF) și limitare de trafic**, dacă domeniul trece prin ei. Domeniul tău e pe DNS-ul Vercel, deci azi nu trece. Mutarea e posibilă, dar Vercel are propriul firewall cu reguli și limitare, suficient la dimensiunea voastră. Nu aș muta DNS-ul doar pentru asta (zona conține MX-urile Google și cheile DKIM — risc de a opri emailul).

Cloudflare nu ar fi prevenit niciuna dintre problemele găsite azi: toate erau în baza de date, în spatele oricărui firewall.

---

## 6. Ce NU a fost acoperit

- Auditul paralel s-a oprit la limita de sesiune. Au terminat 6 din 11 auditori (funcții RPC ×3, politici RLS, edge functions, portal). **Nu au rulat**: GDPR/legal, plăți, site, pierdere de date, secrete și acces. Pe acestea există doar verificările mele directe, descrise mai sus.
- Verificarea adversarială automată nu a rulat. Constatările din secțiunea 2 le-am verificat eu, pe definițiile live și prin teste. Cele din secțiunea 4 vin de la auditori, cu dovezi din cod, dar fără o a doua verificare independentă.
- Nu am testat cu un cont real de instructor sau de agenție; concluziile despre aceste roluri vin din textul politicilor.
- Nu am putut citi setările de autentificare din Supabase (lungimea minimă a parolei, limite). De verificat în dashboard.
- Neon (baza site-ului): conține doar prețuri, orar și calendar; există export local din 11 septembrie. Planul și fereastra de restaurare nu le-am putut verifica.
- Testul `scripts/test-portal-rls.mjs` are o aserțiune care pică (5 din 6). E un test rămas din vremea când portalul folosea Supabase Auth; izolarea între familii trece. De adus la zi.
