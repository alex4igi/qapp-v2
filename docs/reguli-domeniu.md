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
  Pe o lună (30.09): `inrolari_active_luna` citește rezilierea din `data_reziliere` (nu din bifa `reziliat`), leagă
  „Per ședință" doar de ziua ședinței și nu numără rezervările OPEN anulate — aceeași fereastră ca `_inrolari_platite_randuri`.
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
- **Facultative: oamenii se afișează separat — „6 abonați + 7 pe ședință", nu „13 cursanți" (29.09).** Abonat = are în
  luna aia un rând lunar/anual real; cine are și abonament și ședințe e abonat. **Abonamentul reziliat la 0 lei nu e
  abonat** — e o conversie în plată pe ședință (rândul lunar se reziliază în aceeași clipă în care se creează ședințele)
  sau o anulare. Cod: `esteAbonamentReal` / `cursantiLabel` în `src/features/cursuri/api/profile.ts`.
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
- **Restanță = DOAR ce a trecut de termenul de plată (30.09).** Termenul: plata pe **ședință** (OPEN, facultativ pe
  ședință) — **ziua ședinței** (omul plătește pe loc); **abonamentul** (și la facultative) — **15 ale lunii**, cu
  excepțiile sezonului (`sezoane.scadenta_prima_rata` / `scadenta_ultima_rata`, septembrie și iunie); datoriile
  **one-off** (taxe, bilete, merch, închirieri) — ziua creării. Toate intră în **aceeași cifră**, iar un client se
  numără **o singură dată**, oricâte locații ar avea. Rata lunii încă nescadentă e „de încasat", nu restanță.
  Cod: `scadenta_inrolare(data, sezon, tip_plata)` (peste `scadenta_rata`, care rămâne pentru K1/K2, penalizare și
  suspendarea de 50 de zile — toate doar pe „Per luna") și `get_restante_scadente(p_locatie)` = cifra din Overview,
  Panou și /datorii. Cardurile „pe luna curentă" din /datorii (rest recuperabil, rata lunii) măsoară ritmul
  încasării lunii, inclusiv partea nescadentă — nu sunt restanțe.
- **Abonament la curs facultativ: nu după 15 ale lunii (30.09).** După 15, ședințele rămase valorează mai puțin decât
  un abonament întreg — omul plătește pe ședință. (Regula nu e încă impusă în formularul de înrolare.)
- **Datoriile nu se arată pe instructor (30.09):** instructorul nu încasează; datoriile unei grupe se văd pe /datorii,
  filtrate pe grupă.
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

- **Locații:** în DB `Galeriile Stefan cel Mare` / `Nicolina` / `Quasar 4 Kids` / `Valea Lupului`; în UI și în `leads.locatia` etichete scurte.
  Valea Lupului (Școala Verde, parteneriat cu Școala „Profesor Mihai Dumitriu”, deschidere noiembrie 2026) există din 29.09.2026 doar ca locație de campanie: fără săli, grupe,
  recepție, adresă sau telefon — vezi §11.
  Potrivirea se face normalizat (`locatie_label_match` în SQL), niciodată cu `=`. Cursuri „S …" = Ștefan, „N …" = Nicolina.
- **Săli la Ștefan:** `SCM Studio 1`, `SCM Studio 2`.
- **Disciplina (`cursuri.stil`):** `Street Dance` · `Gimnastica` · `K-Pop` · `Teatru` · `Zumba` · `Open` — lista din `src/lib/enums.ts`.
- **Gimnastica se ține doar la Nicolina, teatrul doar la Quasar 4 Kids** (tot în zona Nicolina, str. Clopotari 24 — dar locație separată, cu adresa ei în SMS; sezonul 2026-2027). Formularele Meta
  de gimnastică/teatru n-au întrebare de locație: leadul primește locația și interesul din numele formularului
  (`implicitDinFormular`, `supabase/functions/_shared/meta.ts`). Dacă una din discipline se deschide și în altă
  locație, regula de acolo devine greșită.
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
- **O locație fără adresă nu primește SMS** (`LOCATII_FARA_DATE_SMS` în `_shared/sms.ts`, azi Valea Lupului): `buildSms` întoarce
  null și apelantul sare mesajul, în loc să trimită adresa de la Ștefan. Se scoate de pe listă când intră în `ADRESE`/`TELEFOANE`/`REVIEW_LINKS`.

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

## 11. Preînscrieri de campanie (Valea Lupului, 2026)

Decizii Alex, 29.09.2026. Brief: `handoff/2026-09-29-campanie-valea-lupului.md` + `handoff/2026-09-29-review-plan-claude-valea-lupului.md`;
cod: migrația `20260929180000_preinscrieri_valea_lupului.sql`, `supabase/functions/_shared/preinscriere.ts`, `src/features/preinscrieri/`,
`/preinscrieri` (aplicație) · pe site `quasardance.ro/valea-lupului`, QR `quasardance.ro/vl/<lot>` (lotul ajunge în `utm_content`).

- **Campania o pornește și o închide Alex** (30.09.2026), din `/preinscrieri` (owner/admin, RPC `seteaza_campanie_preinscriere`,
  urmă în `audit_log`). Starea stă în `campanii_preinscriere` (nepornită → activă → închisă, se poate redeschide). Site-ul o
  citește prin GET-ul din `intake-website-lead` (cache ~1 min, deci o schimbare se vede în 1–2 minute): nepornită = pagina
  spune „în curând”, fără formular și fără pop-up; activă = formular + cardul lateral pe tot site-ul; închisă = „s-au încheiat”.
  Intake-ul refuză orice preînscriere când campania nu e activă. `quasardance.ro/valea-lupului?previzualizare` arată pagina
  întreagă (pentru agenție), dar trimiterea e refuzată.
- **Preînscriere ≠ înscriere.** E interes declarat, strâns ca să decidem grupele și cererea de închiriere a sălii. Nu promite
  loc, grupă sau oră. Locația e deschisă oricui. **Cursurile se țin la Școala Verde; parteneriatul e cu Școala „Profesor Mihai
  Dumitriu”** — acolo se face promovarea, deci formularul întreabă dacă elevul învață acolo (`elev_scoala_partenera`).
- **Oferta (30.09.2026): doar copii — Dans (Street Dance), Gimnastică, K-pop.** Zumba și participanții adulți au fost
  scoși din formular (DB-ul îi mai acceptă, ca să poată reveni fără migrație).
- **Un rând per participant**, nu per formular: doi frați = două rânduri. Fiecare participant are
  leadul LUI (frate nou = lead nou, cu același telefon) sau clientul lui (`client_id`, dacă e deja în familia de pe telefon).
  Motivul: programarea la DEMO e unică pe (lead, eveniment) și reprogramarea șterge celelalte programări ale leadului.
  Un lead vechi trecut pe numele părintelui NU se refolosește pentru copil. Potrivirea pe nume ignoră ordinea cuvintelor.
- **Un formular = un `trimitere_id`**; retrimiterea aceluiași formular nu dublează nimic. Un formular nou pentru același
  participant e o cerere nouă; rapoartele iau **ultima** cerere a fiecărui participant, iar `retras` nu se mai numără.
- **Disponibilitatea = perechi zi × interval**, per participant: L–V × 13–15 / 15–17 / 17–19 și, din 30.09.2026,
  Sâ–Du × 10–12 / 12–14 (cheile `Sa 10-12` etc. sunt aceleași în CHECK-ul din DB, în intake și pe site). „Confirmat la telefon” e
  separat de status (`disponibilitate_confirmata_la`); o grilă schimbată după confirmare redevine declarată (trigger).
- **Pragul pentru o grupă**: reperul de 8 e în cursanți **plătitori** (§2), nu în preînscrieri. Ecranul „Decizie grupe”
  împarte pragul la o rată de conversie presupusă (reglabilă) și o afișează ca ipoteză.
- **Leadurile Valea Lupului intră în `nou`** și deci în lista de sunat de seară (`leads_de_flagat_seara`). Locația n-are
  recepție: cine le sună trebuie decis **înainte** de distribuirea flyerelor.
- `leads.interes` pe un lead de preînscriere e doar primul stil bifat (proiecție); lista completă e în preînscriere.
- GDPR: tabelul intră în `gdpr_export_client` și `anonimizeaza_client`, legat pe lead/client, nu pe telefon.

## 12. Atribuirea leadurilor din WhatsApp (din 30.09.2026)

- Butoanele de WhatsApp de pe site pun în mesaj un cod **invizibil** (15 caractere de lățime zero după primul „!”;
  până la 30.09 16:00 era vizibil, `ref Q-XXXXX`, și e încă recunoscut) și salvează click-ul în `whatsapp_clickuri`,
  cu sursa vizitei (UTM, domeniul de proveniență, `gclid` doar cu consimțământ de marketing). Recepția **copiază** (nu rescrie) primul
  mesaj în fișa leadului (câmpul apare când sursa e „WhatsApp”), iar `leaga_click_whatsapp` copiază atribuirea pe lead.
- Pe un lead WhatsApp, **`leads.sursa` rămâne „WhatsApp”** (canalul de contact), iar `utm_source/medium/campaign`
  spun **de unde a venit omul înainte** (ex. `google / cpc` = Google Ads, `google / organic` = căutare). `utm_*` gol =
  omul a scris fără butonul de pe site sau recepția n-a lipit mesajul — **nu** înseamnă „direct”.
- Legătura stă pe lead (`leads.wa_click_id`): un click poate avea mai multe leaduri (frați).
- Click-urile fără lead nu sunt o eroare: recepția notează doar conversațiile serioase. Raportul „click-uri vs.
  leaduri” măsoară tocmai asta.
- `whatsapp_clickuri` nu conține date personale; devine personal doar prin legătura cu un lead.
- **Conversii offline Google Ads** (din 30.09.2026): un lead cu `gclid` devenit client (`data_conversie`, `id_client`)
  intră în CSV-ul pe care Google Ads îl ia zilnic (`google-ads-conversii` → `conversii_google_csv`), cu valoarea lunară
  a înrolărilor active — aceeași definiție ca la Meta. Doar conversii din 30.09.2026 încolo, fereastră de 30 de zile
  (Google respinge dublurile). `gclid` există doar cu consimțământ de marketing pe site.
- Meta primește doar leaduri din **reclame**: `facebook / social` (vizită organică) nu se trimite (`conversii_ads_de_trimis`).
