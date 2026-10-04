# Review: introducerea portalului către trupe și rezolvarea accesului

> **Stare:** deschis — verificare 2026-10-04. Review de documente și cod local; fără verificare DB/live, creare de conturi sau trimitere de mesaje. Claude verifică pe datele reale înainte de implementare. Nicio modificare de cod.

## Cererea și baza review-ului

- **confirmat de Alex:** verificarea planului de introducere a portalului către trupe și includerea instrucțiunilor de logare, inclusiv email greșit sau absent (cererea din 4 octombrie).
- **propunere:** păstrăm lansarea pe grupe, conturi individualizate și comunicare pe email. Acestea sunt deciziile istorice consemnate pe 23 septembrie în `~/.claude/projects/-Users-alex-igi-Documents-Claude-test-qapp-v2/memory/project_portal_parola_temporara_comuna.md`; nu reprezintă autorizare pentru un lot nou acum. Parola comună este parcată.
- **propunere:** folosim planul `~/.claude/plans/vreau-sa-testez-zona-atomic-raccoon.md` ca istoric al pilotului UNIQ din 12 septembrie, nu ca procedură actuală de executat literal. Nota `project_pilot_portal_uniq.md` consemnează pilotul deja pornit și corectarea familiei prin atașarea clientului, nu prin ștergerea familiei prevăzută inițial. Nu reutilizăm cifrele, scadența din septembrie sau corecțiile punctuale.

## Constatări și completări necesare

Toate punctele următoare sunt **propunere** de actualizare a planului; observațiile tehnice sunt verificate în sursele locale indicate.

1. **Instrucțiunile de acces trebuie să ajungă și în afara portalului.** Anunțul din clopoțel poate fi citit abia după login. Emailul individual include accesul, iar mesajul general de grupă trebuie să explice ce faci dacă nu l-ai primit. Nu trimitem parole sau adrese personale pe grup.
2. **Email de contact ≠ email de login.** Autentificarea și resetarea citesc `portal_accounts.email`. Nu am găsit în sursele verificate o sincronizare a schimbării emailului din `clienti`/`familii` către contul existent. `PortalAccountSection` oferă creare, resetare parolă și ștergere, fără afișare/editare a emailului contului existent. Corectarea fișei singură nu rezolvă loginul.
3. **„Ai uitat parola?” nu creează cont.** Răspunsul este intenționat generic, inclusiv pentru adresă inexistentă sau email de resetare netrimis. Recepția nu interpretează mesajul „Dacă adresa există…” drept confirmare că există cont ori că emailul a ajuns. Linkul este valabil 60 minute în codul actual.
4. **Căile de creare diferă.** `provision-grupa.mjs` trimite `mustChange: true`: la prima logare alegi o parolă proprie, minimum 8 caractere, diferită de cea temporară. Butonul de creare din fișă nu trimite acest marcaj; resetarea făcută de staff îl stinge. Nu promitem schimbare obligatorie pentru toate conturile vechi ori create manual.
5. **Repetarea lotului nu retrimite mesajele.** Scriptul sare țintele cu cont existent. Un cont creat cu `emailed:false` necesită rezolvare individuală; nici `emailed:true` nu dovedește recepția în Inbox, ci succesul raportat de serviciul de trimitere.
6. **Lista recepției nu acoperă toate emailurile greșite.** `export-emailuri-lipsa.mjs` selectează ținte fără cont cu email lipsă sau duplicat; o adresă greșită dar unică și conturile deja create scapă listei. Materialele existente sunt utile pentru colectare, dar trebuie completate cu cazurile raportate de oameni și verificate pentru lotul curent.
7. **Verificare a lotului înainte de extindere.** În `provision-grupa.mjs`, fallback-ul emailului se ia de la primul membru întâlnit, iar contul existent se verifică pe ținta familie/client. Exportul pentru recepție are deja fallback de la membrii parcurși și tratarea adulților cu cont propriu. Nu presupunem că îmbunătățirile din export există și în scriptul de grupă. Claude verifică familiile cu email lipsă, conturile individuale existente și duplicatele globale. Rosterul scriptului filtrează `enrollments.activ`; se confruntă cu lista reală a trupei și definițiile din `docs/reguli-domeniu.md`.

## Procedură de lansare — propunere

1. Alex stabilește trupele și momentul lansării. Recepția verifică destinatarii: adultul/părintele responsabil, email accesibil, familia corectă și membrii ei. Un cont de familie poate deschide accesul și pentru frați din alte grupe; lotul nu este o limitare a vizibilității la trupa aleasă.
2. Claude pregătește simularea lotului și raportul fără parole: cont existent / eligibil / email lipsă / email de confirmat / duplicat / legătură familie de verificat. Recepția rezolvă excepțiile. Nu se inventează emailuri pentru a trece validarea.
3. Se verifică un caz nou cap-coadă: email primit, parolă temporară, alegerea parolei, familia corectă, acces la datele proprii, resetare parolă și canal de feedback. Se verifică separat un cont existent. Conturile și mesajele reale se creează/trimit numai în lotul autorizat de Alex.
4. Se trimit emailurile individuale, apoi mesajul general cu instrucțiuni și contactul recepției. Conturile existente își păstrează accesul; nu li se resetează parola automat pentru lansare.
5. Recepția urmărește cazurile nerezolvate după 2–3 zile; bilanț la o săptămână: ținte distincte, conturi create/existente, notificări acceptate/eșuate, acces reușit, probleme încă deschise. Lipsa loginului nu declanșează automat schimbarea parolei.

## Text pentru membri — propunere, pregătit pentru mesajul de grupă

> Deschidem portalul de membri pentru trupa voastră: https://membri.quasardance.ro
>
> În portal puteți verifica plățile, programul și prezențele. Pentru copii, accesul este al părintelui/responsabilului familiei.
>
> **Cum intrați:**
> 1. Dacă aveți deja cont, folosiți emailul și parola obișnuite.
> 2. Dacă primiți acum contul, găsiți datele de acces în emailul de la Quasar Dance. Introduceți emailul indicat în mesaj și parola temporară. La prima autentificare alegeți o parolă proprie de minimum 8 caractere, diferită de cea temporară.
> 3. După conectare, verificați că apar membrii corecți ai familiei și grupa. Dacă ceva nu corespunde, contactați recepția înainte de a face o plată.
>
> **Nu ați primit emailul?** Verificați și Spam/Junk. Dacă nu îl găsiți, contactați recepția în privat: verificăm dacă aveți cont și dacă adresa înregistrată este corectă.
>
> **Ați uitat parola?** Apăsați „Ai uitat parola?” și introduceți emailul contului. Linkul primit este valabil 60 de minute. Dacă nu vine sau nu mai aveți acces la acea adresă, contactați recepția.
>
> **Email greșit sau lipsă în evidența noastră?** Comunicați recepției, în privat sau la sediu, numele cursantului, trupa și emailul pe care îl folosiți. Recepția verifică datele și vă ajută să primiți accesul. Dacă nu aveți deloc o adresă de email, spuneți-ne; vă ajutăm individual, iar operațiunile pot continua prin recepție.
>
> Nu trimiteți parole sau coduri de resetare pe grup și nu le comunicați recepției.
>
> Recepție Ștefan cel Mare: **0730 534 172** · Nicolina: **0770 227 580**.

**propunere:** mesajul se folosește după trimiterea lotului; se păstrează doar contactul locației relevante. Pentru Quasar for Kids: 0745 371 200, dacă intră în lot. Datele de contact provin din `../AGENTS.md`.

## Procedură pentru recepție — propunere

| Situație | Ce face recepția | Când considerăm rezolvat |
|---|---|---|
| Email absent din fișă, fără cont | Contactează responsabilul pe numărul deja cunoscut sau la sediu. Cere adresa adultului/părintelui, verifică ortografia și accesul la căsuță; completează ținta corectă, familia dacă există. Include cazul în lotul de creare autorizat. | Cont creat pe ținta corectă și membrul confirmă că a intrat. |
| Email greșit, fără cont | Confirmă identitatea și adresa, corectează fișa relevantă înainte de creare; verifică dacă adresa aparține deja unui cont. | Datele ajung la responsabilul corect și accesul funcționează. |
| Email greșit sau inaccesibil, cont existent | Nu resetează spre adresa veche și nu șterge contul ca scurtătură. Verifică solicitantul prin contactul cunoscut/la sediu și escaladează la Alex/admin pentru corectarea emailului de login, păstrând contul și legăturile. Actualizează și emailul de contact relevant. | Noul email permite accesul; vechile metode de recuperare nu mai permit preluarea contului. |
| Email duplicat | Verifică dacă sunt frați din aceeași familie, un adult cu cont propriu sau două familii diferite. Nu unește fișe doar fiindcă au aceeași adresă. Pentru familii distincte cere adrese distincte controlate de responsabilii lor. | O asociere cont–familie corectă, fără expunerea datelor altei familii. |
| Email corect, mesaj neprimit | Verifică existența contului și rezultatul notificării. Dacă există cont și omul controlează emailul, îl ghidează spre resetare. Dacă nu vine nici resetarea, escaladează pentru verificarea trimiterii. | Persoana primește mesajul și se autentifică, nu doar apare un răspuns de succes. |
| Nu are deloc email | Pentru minor, verifică dacă părintele/responsabilul are email. Dacă nu există o adresă accesibilă, păstrează cazul în așteptare și serviciul prin recepție. SMS-ul poate livra date de acces, dar nu înlocuiește emailul de login/recuperare în fluxul actual. | Există un email controlat de responsabil înainte de activare. |
| Contul intră, dar familia/grupa este greșită sau goală | Escaladează verificarea legăturilor cont–familie–client; nu creează un al doilea cont și nu cere parole. | Membrul vede numai familia sa și datele așteptate. |

**propunere:** registru intern fără parole sau tokenuri: cursant/familie, trupă, problema, responsabil recepție, data verificării identității, starea corecției și confirmarea accesului. Emailurile se comunică privat, nu pe grupul trupei.

## Completări tehnice pentru Claude — propunere

- Prioritar: afișarea emailului real al contului în „Cont portal membru” și o cale controlată pentru corectarea lui. Păstrează ID-ul contului și legăturile; verifică unicitatea, autorizarea staff, urma modificării, invalidarea tokenurilor vechi de resetare și a sesiunilor după o posibilă expunere. Verifică separat durata rămasă a tokenurilor de acces: ștergerea sesiunilor nu înseamnă neapărat revocare instantanee. Până există fluxul, cazul merge la admin, nu la ștergere/recreare de rutină.
- Alinierea creării manuale la parola temporară obligatorie și revizuirea parolelor `Nume-1234`, care au doar patru cifre aleatoare. Alternativă de evaluat: link individual de activare. Nu prezentăm această alternativă ca existentă în aplicație.
- Completarea ecranelor login/reset cu ajutor vizibil pentru „Nu am primit accesul / email greșit / nu mai am acces la email” și contactul recepției; păstrarea răspunsului generic de resetare.
- Verificări țintite înainte de extindere: lipsă email, adresă greșită cu cont existent, duplicat între familii, cont individual existent într-o familie, primul membru fără email dar alt membru cu email, notificare eșuată, reset expirat, cont nou cu schimbare obligatorie și cont vechi fără resetare forțată.

## Surse de cod — propunere de referințe pentru implementare

- `scripts/provision-grupa.mjs`: selecția lotului, deduplicare, notificare și `mustChange`.
- `scripts/export-emailuri-lipsa.mjs`: lista recepției și instrucțiunile existente.
- `src/components/PortalAccountSection.tsx`, `src/lib/portalAccount.ts`: acțiuni disponibile staff-ului.
- `supabase/functions/provision-client/index.ts`: creare/resetare/ștergere; resetarea notifică emailul din cont.
- `supabase/functions/portal-auth/index.ts`: login, schimbarea parolei temporare, reset generic și expirare 60 minute.
- `../qapp-membri/src/features/auth/LoginPage.tsx`, `ResetPage.tsx`: pașii și textele văzute de membri.
- `docs/reguli-domeniu.md`: selecția cursanților și înrolărilor.
