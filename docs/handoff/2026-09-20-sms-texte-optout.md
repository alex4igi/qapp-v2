# Handoff Codex → Claude: texte SMS, opt-out, previzualizare

Predat: 20 septembrie 2026

## Stare — **parțial implementat** (verificat de Claude pe cod, 27 sept. 2026)

Implementat în commitul `85f5bc2` (20 sept.), plus `1307ae1` (mesaj liber parcat):

- ✅ SMS-urile bulk rămân la recepție (`mesaj_liber` doar manager+, și e parcat).
- ✅ `process-sms-queue` trimite doar ce a ajuns la `data_planificata` (ziua locală).
- ✅ SMS-ul contului de membru respectă orele de liniște (`sms_amanate`); parola rămâne în SMS.
- ✅ Opt-out = doar marketing, clasificat într-un singur loc: `supabase/functions/_shared/smsCategorie.ts`.
- ✅ Textele noi sunt în toate șabloanele, **fără diacritice** (GSM-7, un segment; 58 de combinații măsurate).
  Abateri asumate: restanța și avertismentul păstrează defalcarea pe copii; reminderul cu reducere nu mai are
  „Dacă ați achitat deja…”.
- ✅ Mesajul liber: în loc de selectorul Operațional/Marketing a fost **parcat** (RLS refuză `mesaj_liber`);
  selectorul rămâne condiția pentru reactivare.

Rămas deschis:

- ⏳ **Momentul cererii de review** (≥2 prezențe, la 7–14 zile după înrolare) — nu e implementat; pleacă tot
  la 5 minute după conversie (`enqueue_confirmare_review`). Momentul exact nu fusese confirmat.
- ⏳ **Tab „Șabloane” în /sms** (declanșator, oră, categorie, caractere/segmente) și previzualizarea inline
  pentru contract / contul de membru — neîncepute. Previzualizarea bulk arată doar numărul de caractere.
- ⚠️ **„Nu a venit”:** decizia de aici era „parcat, nu șters”, dar SMS-ul fusese deja **șters** pe 19 sept.
  (`ab81c4a`, înlocuit cu apel telefonic) — codul de trimitere există doar în istoricul git. Textul nou propus
  nu e implementat nicăieri. De confirmat cu Alex dacă rămâne așa.

---

## Analiza inițială (Codex, 20 sept.)

Am analizat fluxurile și textele SMS. În această etapă nu au fost încă implementate
modificări în cod; au fost stabilite deciziile de mai jos.

## Decizii confirmate

- Mesajele SMS bulk rămân accesibile recepției; nu se restricționează la manager.
- `data_planificata` rămâne relevantă: procesorul trebuie să trimită numai
  SMS-urile ajunse la data planificată.
- Textele SMS profesionale propuse de Codex au fost aprobate ca direcție.
- Parola contului de membru rămâne momentan în SMS.
- SMS-urile de creare/resetare a contului de membru trebuie să respecte silent
  hours, la fel ca celelalte SMS-uri.
- Cererea de review trebuie păstrată.
- SMS-ul „Nu a venit” rămâne parcat: nu se trimite acum, dar funcționalitatea nu
  trebuie ștearsă până se decide dacă va fi reactivată.
- Opt-out-ul existent rămâne opt-out de marketing, nu blocare pentru mesajele
  tranzacționale.

## Clasificare propusă pentru opt-out

Mesaje blocate de opt-out marketing:

- `post_demo`;
- cererea de review;
- `followup` / „Nu a venit”, dacă va fi reactivat;
- mesajele libere clasificate drept marketing.

Mesaje tranzacționale, care continuă să plece:

- confirmarea și reminderul programării;
- confirmarea listei de așteptare;
- confirmarea înrolării;
- reminderul de plată, notificarea de restanță și avertismentul privind locul;
- contractele și reminderele de contract;
- datele contului de membru.

Pentru mesajul liber s-a propus un selector obligatoriu `Operațional` / `Marketing`.
La marketing, destinatarii cu opt-out trebuie excluși automat și numărul lor
trebuie afișat în previzualizare.

## Previzualizare

În prezent, previzualizarea există doar în `/sms` → „Generează SMS-uri”, pentru
mesajele bulk. Afișează un exemplu și numărul de caractere.

Propunerea discutată:

- tab „Șabloane” în `/sms`, cu mesajele active și parcate;
- declanșator, oră, categorie marketing/tranzacțional și regulă de opt-out;
- număr de caractere și segmente;
- previzualizare inline pentru contract și contul de membru.

## Texte aprobate ca direcție

Textele au fost formulate profesional, momentan cu diacritice pentru validarea
conținutului. Înainte de implementare trebuie decis/tratat unitar modul de
trimitere cu diacritice și impactul asupra segmentelor SMS.

### Confirmare programare

> Bună, {prenume}! Ședința gratuită Quasar Dance este confirmată pentru {data}, la ora {ora}, la {adresa}. Vă așteptăm!

### Reminder programare

> Bună, {prenume}! Vă reamintim că ședința gratuită Quasar Dance este {astăzi/mâine}, {data}, la ora {ora}, la {adresa}. Vă așteptăm!

### Listă de așteptare

> Bună, {prenume}! V-am adăugat pe lista de așteptare Quasar Dance. Vă contactăm imediat ce devine disponibil un loc potrivit. Vă mulțumim!

### După ședința de probă

> Bună, {prenume}! Vă mulțumim pentru participarea la ședința de probă. Locurile se ocupă în ordinea înscrierii. Pentru rezervare, ne puteți scrie la {telefon}.

### Confirmare înrolare

> Bună ziua! Confirmăm înscrierea pentru {prenume} la grupa {curs}. Program: {orar}. Instructor: {instructor}. Abonament: {preț} RON/lună. Grup WhatsApp: {link}.

### Reminder plată

> Bună ziua! Vă reamintim că termenul de plată pentru abonamentul Quasar Dance este {data}. Dacă ați efectuat deja plata, vă mulțumim.

### Reminder plată cu reducere

> Bună ziua! Termenul de plată pentru abonamentul Quasar Dance este {data}. După această dată, reducerea aferentă lunii curente nu se mai aplică. Dacă ați achitat deja, vă mulțumim.

### Notificare restanță

> Bună ziua! În evidențele Quasar Dance figurează un sold restant de {total} RON. Plata se poate face la studio sau în contul {IBAN}. Pentru detalii: {telefon}.

### Avertisment privind locul

> Bună ziua! Pentru păstrarea locurilor rezervate familiei, vă rugăm să achitați soldul restant de {total} RON până la {termen}. După această dată, locurile pot fi eliberate. Pentru detalii: {telefon}.

### Contract – prima trimitere/retrimitere

> Bună ziua! Contractul pentru {prenume} este pregătit pentru semnare. Vă rugăm să verificați datele și să îl semnați aici: {link}. Linkul este valabil {N} zile.

### Contract – reminder

> Bună ziua! Contractul pentru {prenume} nu este încă semnat. Îl puteți verifica și semna aici: {link}. Linkul mai este valabil {N} zile.

### Cont de membru

> Quasar Dance: contul de membru este activ. Acces: {url}. Email: {email}. Parolă temporară: {parolă}. Vă recomandăm să schimbați parola după prima autentificare.

### Cerere de review

> Bună, {prenume}! Vă mulțumim că ați ales Quasar Dance. Dacă experiența dumneavoastră a fost una plăcută, ne-ar ajuta o recenzie: {link}. Vă mulțumim!

Momentul propus pentru review este după minimum două prezențe, aproximativ la
7–14 zile după înrolare, nu imediat la conversie. Momentul exact nu este încă
confirmat.

### „Nu a venit” — parcat

> Bună, {prenume}! Am observat că nu ați ajuns la ședința programată. Dacă doriți să reprogramăm, ne puteți scrie la {telefon}. Echipa Quasar Dance.

## Instrucțiune pentru următorul agent

Înainte de modificări, verifică `git status` și `git diff`. Workspace-ul conține
și alte schimbări ale utilizatorului; nu le suprascrie și nu le include accidental
în această lucrare. Confirmă scope-ul implementării pe baza secțiunilor de mai sus.
