# Idei pentru versiunile viitoare

Lista unică a ideilor bune care **nu se construiesc acum**: amânate sau parcate de Alex, sau ieșite din analize
și comparații. Când apare o idee nouă de felul ăsta, se scrie aici, nu doar în memoria unui agent.

Stări: **amânat** = da, dar mai târziu · **parcat** = construit sau planificat, oprit printr-o decizie ·
**de decis** = întâi o discuție cu Alex.

Ultima actualizare: 7 octombrie 2026.

## Din lista de inspirație (2 oct. 2026)

| Idee | Stare | Ce avem deja / prima decizie |
|---|---|---|
| Link de plată în SMS-ul de scadență | amânat (din iulie, „Plan C”) | Reminderul din /sms și Netopia există separat. Recomandarea din iulie: deep-link în portal /plati. De decis: deep-link sau link semnat fără login. |
| Bilet PDF/QR pe email + scanare cu camera la intrare | amânat | Biletul are cod unic și `valideaza_bilet` cu anti-dublură; la ușă codul se tastează. Se suprapune cu planul de check-in QR (mai jos). |
| Cumpărare de bilete fără cont, din linkul din reel | amânat | Azi biletele se cumpără doar din portal. Cere un flux public de checkout Netopia. |
| Log GDPR de acceptare a termenilor | amânat | Consimțământul se salvează doar la semnarea contractului. Lipsește la activarea contului din portal și la formularul de lead (dată + versiunea termenilor + IP). |
| Programarea ședinței gratuite de către client, din link | de decis | Procedura actuală: recepția sună în aceeași zi și stabilește ziua. O variantă compatibilă: clientul propune ziua, recepția confirmă. |

## Bani și facturare

| Idee | Stare | Note |
|---|---|---|
| Firma **Dance** în FGO | amânat (28 iun.) | Cere abonament API special la FGO. Azi se facturează doar Studio. |
| Facturare „la cerere” per client (alt nume/CNP, lunar) | parcat (20 iul.) | Construită și testată; așteaptă aprobarea Roxanei și a contabilității (factura la bon fiscal Cash/Card). |
| SMS automat când expiră promisiunea de plată | amânat (24 aug.) | Datele există deja (`client_contacte.promisiune_data`, `suma_promisa`). De decis: textul + cronul. |
| Închirieri neachitate pe /datorii | amânat (24 aug.) | Ar cere un RPC mic; azi stau doar în modulul de închirieri. |
| Workshop-uri ocazionale în „Plată nouă” | de decis | Categoria Bilet existentă sau un tab dedicat. Întrebări: au listă de participanți? instructorul invitat e plătit separat? |
| Stocul din inventar scade la vânzare | amânat | Azi stocul nu se modifică la vânzarea de merch. |
| Cost de achiziție (CAC): buget pe campanie + cheltuieli de marketing | parcat | Ar cere introducerea multor cheltuieli. Câmpul de buget pe campanie există deja. |

## Clienți, leaduri, comunicare

| Idee | Stare | Note |
|---|---|---|
| Buton „Notează contact” în tabul Comunicări | de decis (2 oct.) | Un contact notat amână anonimizarea GDPR (`gdpr_ultima_activitate`) și trebuie ținut separat de scorecard (`scop` nou). |
| Check-in QR la cursuri (clientul scanează QR-ul sălii din portal) | parcat (28 iun.) | Planul e scris: `~/.claude/plans/am-o-idee-pe-federated-puzzle.md`. Acoperă și biletele QR. |
| Cross-sell din leadurile „deja client” | amânat | Leadurile primesc deja marcajul `deja_client`. Lipsește o listă dedicată (al 2-lea curs −10%, recomandare). |
| Înscrierea cursanților la concurs/spectacol din formulare | amânat (18 iun.) | Coloanele există (`concursuri.participanti`, `evenimente.participant`). |
| WhatsApp Business API | amânat (30 sept.) | Volum mic (~17 leaduri/lună din WhatsApp). Se remăsoară în ~noiembrie. |

## Portalul membrilor (din auditul de 50 de taskuri, iunie)

Rămase din grupele mari: **facturile în portal**, **costume**, **suspendarea abonamentului de către părinte**,
**mesagerie**, **galerie foto/video**, **program de fidelitate**.

| Idee | Stare | Note |
|---|---|---|
| Schimbarea emailului de login din fișă | amânat (4 oct., din review-ul Codex la lansarea pe trupe) | Fișa arată emailul de login, dar nu-l poate schimba; azi o face Alex în SQL. Fluxul trebuie să păstreze contul și legăturile, să verifice unicitatea, să lase urmă în `audit_log` și să invalideze linkurile de resetare și sesiunile vechi. |
| Link de activare în locul parolei temporare `Nume-1234` | amânat (4 oct., idem) | Loginul se blochează după 8 încercări și are plafon pe IP, deci ghicirea nu e un risc practic. Butonul din fișă nu cere încă schimbarea parolei la prima logare (doar scriptul pe grupe o cere). |

## Instructori și echipă

| Idee | Stare | Note |
|---|---|---|
| Instructorul își vede propria evaluare HR | parcat „până în septembrie” — **termenul a trecut** | Modulul de evaluare există, dar instructorul nu și-o vede. De decis ce anume vede. |
| Criterii de evaluare diferite pe nivel/vârstă | amânat (12 aug.) | Schimbare de schemă: cele 10 coloane fixe devin criterii pe șablon. De decis: șablonul se leagă de vârstă, de nivel sau îl alege managerul? |
| Pontaj plătit „lei/oră” | amânat | Azi pontajul măsoară doar orele. |
| Jurnalul metodologic intră în evaluarea profesorului | amânat | Criteriul „Pregătirea lecției”. |
| Instructorul semnalează „A venit, de verificat” pentru un copil fără acces la facultativ | de decis (5 oct., din alternativa Codex la rosterul facultativelor) | Instructorul e în sală, recepția e în altă parte. Semnalul nu creează înrolare, datorie sau prezență; cere o stare nouă, o notificare la recepție și un flux de rezolvare. Analiza: `docs/handoff/2026-10-05-alternativa-roster-facultative-participanti.md`. |
| Plata evenimentelor trupelor (150 lei) în salarizare | amânat (25 sept.) | Etapa următoare a grilelor. |
| Pro-rata la salariu: client întreg sau parțial la grupele recurente | de decis (7 oct.) | Azi orice înrolare cu sumă ține un loc întreg la retenție și ocupare — și cel cu 45 lei și o prezență. Alternativa: cântărit ca la facultative (loc echivalent). Sept. 2026: 83 pro-rata din 566 pe 43 de grupe; ar schimba salariile. Detaliul e vizibil deja în „Detalii salarii” (admin). |
| Trupele modelate explicit (UNIQ, MiniQ's…) | amânat | Azi o trupă e doar `nivelul='Trupa'`; rapoartele nu le pot deosebi. |
| Calendar pentru cursuri private 1-la-1 | amânat (28 mai) | Programare + cost pentru instructor + încasare per sesiune. |

## Aplicația

| Idee | Stare | Note |
|---|---|---|
| Meniu, etapa 2: campaniile ascunse cât nu sunt active | amânat (30 sept.) | Doar după ce există o destinație permanentă „Campanii”. |

## Proiecte separate

- **qlearn** (cursuri video): integrare viitoare cu instructorii și clienții.
- **qconcurs** (înscrieri la concursuri): se reia în **martie 2027**.

## Datorii tehnice amânate

- Statisticile pe lună citesc încă flagul „suspendat acum”, nu luna suspendării (amânat 13 sept.).
- Completarea istorică a legăturii curs ↔ instructori (`cursuri_teacheri`, M:N).
