# Reguli de domeniu — qapp v2

Definițiile și invarianții care **nu reies din cod** și pe care orice analiză sau modificare trebuie să-i respecte.
Fiecare regulă e o decizie a lui Alex sau o capcană descoperită pe date reale. Data din paranteză e ziua deciziei.

> Reguli de preț și reduceri → [reguli-preturi-reduceri.md](./reguli-preturi-reduceri.md) · procedura leads →
> [procedura-leads-kanban.md](./procedura-leads-kanban.md) · salarizare → `grila-*.md`, `bonus-manager-studio.md` ·
> securitate DB → `../AGENTS.md`. Aici nu se repetă ce e acolo.
>
> **Întreținere:** o regulă de domeniu nouă se scrie AICI (nu doar în memoria unui agent). Dacă o regulă de aici
> se schimbă, schimb-o aici în același commit cu codul.

---

## 1. Numărarea oamenilor

- **`reziliat` NU înseamnă că omul a plecat** (09.09). Modelul „Per lună" are un rând pe lună, iar la închiderea
  lunii rândul primește `reziliat = true` fără dată și motiv (2025-2026: 4.183 reziliate, doar 356 reale).
  Rezilierea reală = **`data_reziliere IS NOT NULL`**. Filtrul pe `reziliat` dă cifre de 2–4× mai mici.
  Excepție: „e înrolat AZI" poate folosi `reziliat = false`; orice privire în trecut, nu.
- **`enrollments.activ` nu e de încredere** (nu e întreținut consecvent; se stinge în masă la închiderea sezonului).
  Nu-l folosi pentru istoric. Anularea unei rezervări OPEN se citește din `open_rezervari.status = 'anulat'`.
- **Elev activ (canonic, 02.07):** înrolare nereziliată care acoperă ziua **SAU** ≥1 `Prezent` în ultimele 21 de zile.
  Fără condiție de plată. Helperi SQL: `inrolari_active_la`, `clienti_activi_la`, `inrolari_active_luna`.
- **Înscriși ≠ Vin efectiv (10.09):** `get_clienti_inscrisi_sezon()` = clienți distincți cu înrolare fără
  `data_reziliere` în sezonul activ. La cumpăna sezoanelor cifra „activi" se mișcă doar calendaristic — de aceea două cifre.
- **Cursant plătitor pe lună:** `suma > 0`, intervalul acoperă luna, fără `data_reziliere <= 1 ale lunii`.
  În SQL există o singură implementare: `cursanti_platitori_luna(curs, luna)` — nu scrie alta.
  Din 2026-2027 înrolările „Per ședință" au `data_final` NULL; funcția le leagă de luna ședinței.
- **`clienti.status`** (cron nocturn): `Activ` = `Prezent` în ultimele 21 z sau înrolare în sezonul activ;
  `Inactiv` = 21–45 z; `EXclient` = peste 45 z (→ opt-out marketing + reziliere luni viitoare + lead nurture).
  **Diferit** de `leads.status` (`nou … convertit / pierdut / nurture`); același om poate fi EXclient și lead nurture.
- **Client nou de tot (01.09):** nicio urmă anterioară — fără înrolare, încasare, prezență înainte de fereastră
  ȘI fără `clienti.old_user_id` (import v1). Altfel lista se umflă de ~2,5×.

## 2. Grupe, ocupare, sezon

- **Ocupare:** o singură definiție, `locuri_ocupate(de, pana, cursuri)` și derivatele ei (`locuri_ocupate_luna`,
  `_locuri_ocupate`). Nu rescrie fereastra în alt loc. Numitorul = `cursuri.capacitate_maxima`, locuri = clienți
  distincți PER GRUPĂ (copil la 2 grupe = 2 locuri). Procent cu 2 zecimale, fără rotunjire.
- **Capacitatea e a SĂLII**, 5 trepte (10/15/20/25/30): SCM Studio 1 = 25, SCM Studio 2 = 10, Nicolina = 20, Q4K = 15.
- **Facultative = loc echivalent (26.09):** abonatul = 1 loc; cine plătește pe ședință = ședințele lui / ședințele ținute
  de grupă (orar minus `vacante` și luni suspendate), max 1. Nu se rotunjește (9,67). Se aplică la bonusuri, prag minim,
  Overview, statistici. Retenția și numărătorile de OAMENI rămân neatinse (retenția la facultative = subiect deschis).
  Pe lună, o ședință se numără o singură dată, în luna în care s-a ținut; fereastra de 30 de zile e doar pentru ocuparea pe ZI.
- **Drop-in-ul poate depăși capacitatea** — nu se plafonează, se notifică (16.09).
- **Prag minim de existență (14.09):** 8 cursanți plătitori (SCM Studio 2: 6), din `sali.minim_cursanti`.
  3 luni ÎNCHEIATE sub prag (după luna lansării) ⇒ propusă suspendarea. **Suspendarea nu e automată** — decide managerul.
- **Suspendarea are LUNĂ (13.09):** `cursuri_suspendari [din_luna, pana_luna)`. Pentru trecut întrebi
  `curs_activ_in_luna(curs, luna)`; `cursuri.suspendat` e doar cache pentru „acum". O stare „acum" nu descrie trecutul.
  Luna din care se suspendă nu se plătește instructorului, fără prorata.
- **Sezonul „activ" poate fi activ ÎNAINTE de start** (`stare='activ'` = sezonul pe care se lucrează, deschis pentru
  reînscrieri). Orice „ședințele zilei" verifică și intervalul `data_incepere..data_final` al sezonului.
- **Grupele sunt per sezon** (clonate prin `clone_sezon`, legate prin `cursul_original`). Orice listă „pe grupă"
  primește luna ca parametru, nu `today()`; restanțele se citesc pe sezonul CURSULUI.

## 3. Înrolări

- **Trei tipuri:** facultativ (per ședință / per lună = acces la toate ședințele lunii), grupă recurentă, trupă.
  **Trupa:** fără prorata, nu se reziliază (contract ferm pe sezon).
- **Luna unei înrolări „Per lună" = luna lui `data_incepere`, care e ziua 1** (convenție v2; datele v1 au fost convertite).
  Excepție: prima lună a sezonului = **startul sezonului** (trigger `trg_enrollment_snap_start_sezon` o impune pe orice cale).
- **Invariant `suma_baza`:** `trg_enrollments_recalc` recalculează `suma` din `suma_baza`. Orice cod care stabilește prețul
  unei înrolări setează `suma_baza`, altfel înrolarea iese 0 lei.
- **Prorata** — doar grupe recurente (nu trupe, nu facultative), doar la înscriere târzie **și doar dacă se pierd ședințe**:
  `min(ședințe_rămase × pret_sedinta, rata_lunii)`. În septembrie reperul e startul sezonului, iar întârziații plătesc
  proporțional (`rată × prinse / ședințe_de_la_start`). `pret_sedinta` pe grupe recurente = `pret_anual / ședințe din contract`,
  rotunjit în sus (2×/săpt. 39, 1×/săpt. 52). Detalii: reguli-preturi-reduceri.md §7.
- **Facultativul nu are prorata și nici preț anual/promo/reziliere** — doar `pret_lunar` și `pret_sedinta`.
- **Mutarea la alt curs mută toată seria** (`muta_inrolare_curs`): rândul ales + lunile ulterioare nereziliate; trecutul rămâne.
- **OPEN class: data înrolării = data ȘEDINȚEI, nu a încasării.** Orice drum care cheamă `rezerva_loc_open` precompletează
  data cu `nextSessionDate`. La corecții se mută rezervarea + `enrollments.data_incepere`; `incasari.data` nu se atinge
  (e data reală a banilor). Membrii de trupă plătesc 50% la OPEN (regula nu e în cod — recepția scrie suma).
- **Conversie ședințe → abonament:** o lună întreagă, banii de pe ședințele lunii devin avans; fără prorata.
- **Prețul vine din entitate, fără câmp de override** (19.05). Singura cale de reducere la tranzacție = voucherul.
  Voucherul lunar se aplică pe **o singură rată**; voucher + preț de reînscriere nu se combină.

## 4. Bani

- **Locația banilor = `incasari.locatie`** (unde s-a încasat), nu lanțul curs → sală → locație. Orice insert în `incasari`
  setează `locatie` (din locația de lucru) și `categorie` (`Abonament` / `Bilet` / `Merch` / `Taxa`); `sezon` îl pune triggerul.
- **Datoria canonică:** înrolări **nereziliate**, `rest = suma − Σ încasări`, pe luna lui `data_incepere`.
  Prescris = mai vechi de 2 ani (KPI-urile arată net, cu „din care prescrise"). O înrolare reziliată nu are datorie validă.
- **Lună fără nicio prezență și fără nicio plată, pe o lună încheiată, nu e datorie** (12/16.09) — dar anularea e decizie
  manuală, cu audit. Pe luna în curs sau pe o grupă fără prezențe logate, lipsa prezenței nu dovedește nimic.
- **Lună achitată:** `suma − Σ încasări <= 0` (creditul e tot achitat; lunile de 0 lei n-au rând în `incasari`).
- **`/plati` e registrul unic al încasărilor**; restanțele stau în `/datorii`.

## 5. Prezențe

- **Un singur rând pe (client, curs, zi)** — triggerul `trg_prezente_dedup`, last-write-wins.
- Prezența se bifează din **rosterul grupei**; diagnosticul oricărei probleme de prezență pornește de la `getGrupaDashboard`.
- **Absențele aproape nu există ca date** (82% din ședințe n-au niciun `Absent`): instructorii bifează doar prezenții.
  Retenția și riscul se măsoară în **ședințe ratate / zile de tăcere**, nu în rânduri `Absent`.

## 6. Nomenclatoare închise

- **Locații:** în DB `Galeriile Stefan cel Mare` / `Nicolina` / `Quasar 4 Kids`; în UI și în `leads.locatia` etichete scurte.
  Potrivirea se face normalizat (`locatie_label_match` în SQL), niciodată cu `=`. Cursuri „S …" = Ștefan, „N …" = Nicolina.
- **Săli la Ștefan:** `SCM Studio 1`, `SCM Studio 2`.
- **Disciplina (`cursuri.stil`):** `Street Dance` · `Gimnastica` · `K-Pop` · `Teatru` · `Zumba` · `Open` — lista din `src/lib/enums.ts`.
- **Grupe de vârstă publice:** Tiny 4-6, Junior 7-10, Varsity 11-14, Teens 15-18, Students 19-24, Adults 25+.
  Enum-ul `varsta_curs` din DB are încă intervalele vechi — nu le afișa public.
- **Unități de învățământ:** catalog canonic `unitati_invatamant`, cu trigger de canonicalizare pe `clienti`.

## 7. SMS

- **Providerul activ e themarketer.ro**, nu smslink (smslink = legacy). Verifică `SMS_PROVIDER`, nu comentariile din cod.
- **Fără diacritice și fără emoji** (GSM-7), textele se țin într-un segment.
- **Doar template-uri**, fără text liber de la recepție; `mesaj_liber` e parcat (se reactivează doar cu selectorul Operațional/Marketing).
- **Opt-out = doar marketing.** Clasificarea stă într-un singur loc: `supabase/functions/_shared/smsCategorie.ts`
  (marketing: `post_demo`, `review`, `followup`; restul tranzacționale; un cod necunoscut = marketing).
- Adresa/telefonul dintr-un SMS către lead se iau din **locația programării**, nu din `leads.locatia`.

## 8. Capcane de interogare

- **PostgREST taie tăcut la 1.000 de rânduri** (și `.in()` cu liste mari). Paginează cu `.range()` / `fetchAllRows`.
- **Fus orar:** ziua de azi = `todayIso()` (Europe/Bucharest); `toISOString().slice(0,10)` dă ziua precedentă între 00:00 și 03:00.
- **O migrație aplicată pe remote e LIVE imediat**, înainte de push-ul frontendului — dacă schimbă un calcul, cifrele
  se schimbă pe loc pentru toată lumea.
- În septembrie rosterul se schimbă sub tine (recepția înrolează live) — nu compara două cifre luate la ore diferite.

## 9. Păstrarea datelor (GDPR)

- **Clientul inactiv e ANONIMIZAT, nu șters** (decizie Alex, 28 sept. 2026): prag **5 ani** fără prezență, plată,
  înscriere, rezervare OPEN, contact logat, contract semnat sau bilet. **Ceasul pornește de la 1 ian. 2026** —
  istoricul 2017–2024 a venit la import în bloc și nu se poate separa, deci primele anonimizări vin în 2031.
  Pragul și data stau în `gdpr_config` (un rând), nu în cod.
- `clienti.created` și `leads.created` **nu** sunt „activitate": la import au primit toți data importului (sept. 2025).
- Nu se anonimizează cine are **datorie neachitată** sau **înscriere în curs** (`data_reziliere` nul și `data_final` ≥ azi).
- Rândul rămâne (`nume = 'Anonim'`, `prenume = '#<id>'`, `anonimizat_la` setat): încasările, prezențele și înscrierile
  se numără în continuare. Din data nașterii rămâne doar anul. Familia se anonimizează abia când toți membrii sunt anonimizați.
- Orice numărătoare sau listă de contact nouă trebuie să ignore clienții cu `anonimizat_la` (n-au telefon/email oricum).
- Cererile „ștergeți-mi datele" trec prin `anonimizeaza_client(id, motiv)` (recepție și peste — decizie Alex 28 sept. 2026). Fișierele (PDF-uri de contract,
  documente, link-uri Drive) nu se pot șterge din SQL: ajung în `gdpr_fisiere_de_sters`. Cele din Storage le șterge
  `cron-morning` zilnic; link-urile Drive (`bucket` nul) se șterg de mână.
- Cererea de acces / copie a datelor (art. 15/20): butonul **GDPR** din fișa clientului (recepție și peste, desktop) →
  `gdpr_export_client(id, motiv)` dă un JSON cu tot ce ține de client; exportul lasă urmă în `audit_log`.
  Tabel nou cu date despre client ⇒ intră și în export, și în `anonimizeaza_client`.

## 10. Recomandări (campania DANCE WITH ME, toamna 2026)

Decizii Alex, 28 sept. 2026. Brief: `handoff/2026-09-27-campanie-recomandari-varsity-teens.md`; cod: migrația
`20260928140000_campanie_recomandari.sql`, `src/features/recomandari/`, `/recomandari` (aplicație) · pe site `quasardance.ro/dance-with-me` (vechiul `/recomandari` face redirect). Numele campaniei stă în `campanii_recomandare.nume` și trebuie să fie identic cu `CAMPANIE_RECOMANDARI` din site (`lib/recomandari.ts`) și cu `campanii_promovare.nume`.

- **Recompensa:** 60 lei credit pe familia care invită, pentru fiecare prieten care face ora gratuită, se înscrie și
  **achită integral prima lună întreagă**. Fără plafon pe familie; un invitat aduce o singură recompensă. O plată
  parțială nu aduce nimic, iar recompensa nu se proratează.
- **La invitați, pro-rata trece în luna a doua:** prima rată e rata lunară întreagă, luna a doua are suma prorată a
  lunii de start (15 oct. → 280 lei în octombrie, 98 în noiembrie). Doar la înrolările unui client cu recomandare
  vie (`client_are_recomandare`); restul înscrierilor păstrează prima rată prorată. Dacă invitatul pleacă după
  prima lună, rata întreagă rămâne a școlii.
- **Cine poate fi invitat:** oricine **nu e înscris în sezonul campaniei** (nicio înrolare în sezon făcută înainte de
  recomandare), deci și un fost cursant. Nu din aceeași familie cu cel care invită.
- **Termen:** ziua dinaintea primei vacanțe a sezonului (2026: **25 octombrie**; vacanța de toamnă începe luni, 26 oct.) — proba, înscrierea și plata primei
  luni, toate până atunci. Nu există prelungire în noiembrie. `campanii_recomandare.data_limita` e sursa unică:
  după ea, site-ul ascunde `/recomandari` și câmpul „Cine te-a invitat?", iar intake-ul nu mai înregistrează nimic.
- **Atribuirea:** invitatul declară un nume; recepția confirmă cursantul (→ familia lui) în fișa leadului, înainte de
  proba gratuită. Fără familie confirmată creditul nu se acordă (starea `eligibil` = a plătit, lipsește confirmarea).
  Proba contează din `programari_leads.prezenta = 'prezent'` sau dintr-o prezență în roster.
- **Creditul NU e încasare** (nu apare în `incasari`, în FGO, în bonusuri): se scade din suma datorată a rândului pe
  care e folosit (`enrollments.credit_recomandare`, `datorii.credit_recomandare`), cu urmă în `credit_familie_miscari`
  și `audit_log`. Orice cod care rescrie `enrollments.suma` o scrie brută din preț — triggerul
  `trg_enrollment_pastreaza_credit` scade creditul la loc; dacă rata ajunge sub credit, diferența se întoarce familiei.
  ⚠️ Un cod care ar scrie `suma = suma` (valoarea netă) ar scădea creditul de două ori.
- **Pe ce se folosește:** orice rată de înrolare (abonament, OPEN class, ședințe) și datoriile `Workshop` / `Auditie`.
  Nu pe merch, bilete la spectacol, închirieri. Workshopurile plătite direct prin bilet (fără rând în `datorii`) nu pot
  primi încă credit.
- **Anulare:** dacă dispar banii de pe rata care a calificat (ștergere, restituire), creditul nefolosit se anulează
  singur; cel deja folosit rămâne folosit (nu se cere înapoi) și apare în raport ca „consumat înainte de anulare".
  Plecarea ulterioară a invitatului nu anulează nimic. Managerul poate anula manual, cu motiv.
