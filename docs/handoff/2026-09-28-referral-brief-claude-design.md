# Brief pentru design — campania „Recomandări toamna 2026”

**Stare:** gata de predat la design — 2026-09-28. Toate regulile și datele de mai jos sunt confirmate de Alex.

Ai de făcut patru lucruri:
1. biletul fizic;
2. landing page-ul `quasardance.ro/recomandari`;
3. câmpul „Cine te-a invitat?” din celelalte formulare de pe site;
4. materialele pentru instructori și recepție (anunțul la curs și imaginea pentru WhatsApp).

---

## Campania, pe scurt (sursa pentru toate textele)

- **Confirmat de Alex:** un cursant Quasar invită prieteni. Fiecare prieten are **prima oră gratuită**.
- **Confirmat de Alex:** prietenul se înscrie și **achită prima lună întreagă**. Atunci familia care l-a invitat primește **60 lei credit** în contul ei Quasar, integral și o singură dată pentru fiecare prieten. **Nu există limită**: 3 prieteni înscriși înseamnă 180 lei.
- **Confirmat de Alex:** cei 60 lei **nu** sunt o reducere pentru prieten. Sunt un credit pentru familia care invită. Pe bilet nu trebuie să arate ca un voucher valoric.
- **Confirmat de Alex:** creditul se poate folosi la orice plată viitoare a oricărui membru al familiei, pentru:
  - abonament;
  - OPEN class;
  - ședințe (de exemplu K-pop);
  - workshopuri;
  - concursuri.
  - **Nu** se poate folosi pentru merch, bilete la spectacole sau închirieri.
- **Confirmat de Alex:** poate fi invitat oricine **nu e înscris în sezonul acesta**, deci și un fost cursant care revine. Prietenul poate alege orice grupă.
- **Confirmat de Alex:** dacă prietenul începe în mijlocul lunii, prima lună se plătește întreagă, iar diferența se scade din luna a doua. Exemplu: începe pe 15 octombrie, plătește 280 lei în octombrie și 98 lei în noiembrie. Totalul e același; doar prima plată e întreagă.
- **Confirmat de Alex:** campania durează **până la începutul primei vacanțe**: vacanța de toamnă începe pe **28 octombrie 2026**, deci ultima zi este **27 octombrie 2026**. Până atunci trebuie făcute **toate**: proba, înscrierea și plata primei luni. Campania nu continuă în noiembrie.
- **Confirmat de Alex:** biletele sunt identice pentru toată lumea. Nu au cod unic pe copil sau nume pretipărit; numele celui care invită se scrie de mână. Toate biletele au **același QR**, către `quasardance.ro/recomandari`.
- **Confirmat de Alex:** campania se anunță la toate grupele. Accentul vizual și de ton cade pe **Teens și Varsity**, adolescenți și tineri, fără imagini cu copii mici.

## Identitate

- Galben `#FFD600`, negru `#000000`.
- Logo-ul se ia din activele existente ale site-ului (`~/Documents/Website React/quasar-dance`, folderul public), nu se redesenează.
- **Fotografia o alegeți voi** (confirmat de Alex, nu există încă o poză aprobată): grup, mișcare, adolescenți. Fără imagini generice cu copii mici.

---

## 1. Biletul fizic

**Format propus:** o coală A5 cu **4 bilete detașabile** (perforate), identice. Biletul trebuie să încapă în ghiozdan și să poată fi fotografiat și trimis pe WhatsApp. Numărul și dimensiunea biletelor se pot ajusta după un print de probă.

**Pe fiecare bilet, în ordinea importanței:**
1. mesajul principal (vezi direcțiile de mai jos);
2. „M-a invitat: ________________”, spațiu de scris de mână, suficient de lat pentru nume și prenume;
3. QR mare, cu margine albă, lizibil pe hârtie și din poză; sub el, URL-ul scris: **quasardance.ro/recomandari**;
4. telefoanele recepției (vezi mai jos);
5. subsolul cu condițiile;
6. „Valabil până pe 27 octombrie 2026”.

**Telefoane (confirmat de Alex):** pe bilet apar două numere. De cele de la Quasar for Kids se ocupă tot recepția din Nicolina.

| Locație | Telefon |
|---|---|
| Ștefan cel Mare | 0730 534 172 |
| Nicolina (și Quasar for Kids) | 0770 227 580 |

### Direcția A — „Vino cu mine” (recomandată pentru Teens și Varsity)
Aspect energic, aerisit, tipografie mare. Arată ca o invitație între prieteni, nu ca un cupon.
- **Titlu:** „Vino cu mine la dans.”
- **Subtitlu:** „Prima oră e gratuită.”
- **Câmp:** „M-a invitat: ______”
- **CTA:** „Scanează și cere ora gratuită”

### Direcția B — „Crew pass”
Inspirată de biletele de eveniment: un „01” mare pentru prima oră, contrast puternic, sentiment de apartenență la grup. Fără aspect de voucher valoric.
- **Titlu:** „Ai loc în crew.”
- **Subtitlu:** „Prima oră, din partea noastră.”
- **Câmp:** „Invitat de: ______”
- **CTA:** „Rezervă-ți locul”

### Subsol / verso (comun ambelor direcții)
> Prima oră e gratuită, cu programare confirmată de recepție. După ce te înscrii și achiți prima lună, familia care te-a invitat primește 60 lei credit Quasar. Ceri ora scanând codul, la telefon sau direct la recepție. Ora gratuită, înscrierea și plata: până pe 27 octombrie 2026. Detalii: quasardance.ro/recomandari

Pe bilet nu apar formula de pro-rata, lista cu ce acoperă creditul sau alte condiții lungi. Toate acestea stau pe landing page.

**QR:** în machetă e un **placeholder vizibil** („QR — NU TIPĂRI”). QR-ul final se generează abia după ce pagina e live și testată.

---

## 2. Landing page `quasardance.ro/recomandari`

Majoritatea vin de pe telefon, după ce au scanat biletul. Pagina se desenează **mobile-first**, apoi desktop. Tonul e direct, pentru părinți și adolescenți. Pagina e scurtă, iar formularul se vede imediat.

### Secțiuni, în ordine

**A. Hero**
- Titlu: „Ai fost invitat la Quasar. Prima oră e gratuită.”
- Subtitlu: „Spune-ne cine te-a invitat și îți găsim o grupă.”
- Buton: „Vreau ora gratuită”. Face scroll la formular; pe mobil, formularul poate veni imediat după hero.

**B. Formularul de probă**

| Câmp | Tip | Obligatoriu |
|---|---|---|
| Numele cursantului (prenume + nume) | text | da |
| Nume părinte (dacă cursantul e minor) | text | nu |
| Telefon | tel | da |
| Email | email | nu |
| Data nașterii / vârsta cursantului | dată | da |
| Locația preferată (Ștefan cel Mare / Nicolina / Quasar for Kids) | select | da |
| Ce vrea să danseze (opțional) | select sau text | nu |
| **Cine te-a invitat?** (numele colegului care ți-a dat biletul) | text | **da** |
| Acord GDPR (textul din formularul actual) | checkbox | da |

- **Buton:** „Trimite cererea”
- **Confirmare după trimitere:** „Mulțumim! Te sună recepția să stabilim grupa și ziua orei gratuite.”
- **Stări de desenat:** câmp gol / eroare / se trimite / trimis cu succes / eroare de rețea.
- Textul ajutător sub „Cine te-a invitat?”: „Scrie numele colegului, cum apare pe bilet. Așa ajunge creditul la familia potrivită.”

**C. Cum funcționează** (3 pași, cu iconițe sau numere mari)
1. „Ceri ora gratuită: aici, la telefon sau la recepție.”
2. „Vii la probă, într-o grupă potrivită vârstei și nivelului tău.”
3. „Te înscrii și plătești prima lună. Familia care te-a invitat primește 60 lei credit.”

**D. Pentru familia care invită** (secțiune separată, vizibil diferită)
- „Pentru fiecare prieten care se înscrie și achită prima lună, familia ta primește 60 lei credit. Fără limită de prieteni.”
- „Creditul se folosește la abonament, OPEN class, ședințe, workshopuri și concursuri, pentru orice membru al familiei.”

**E. Întrebări frecvente** (acordeon)
- *Cine poate fi invitat?* „Oricine nu e înscris la Quasar în sezonul acesta, inclusiv foștii cursanți care revin.”
- *Trebuie să aleg aceeași grupă cu prietenul meu?* „Nu. Alegi grupa care ți se potrivește.”
- *Dacă încep la mijlocul lunii?* „Prima lună se plătește întreagă, iar diferența se scade din luna următoare. De exemplu: începi pe 15 octombrie, plătești 280 lei în octombrie și 98 lei în noiembrie.” (Suma e doar un exemplu; se scrie așa.)
- *Când primește familia creditul?* „După ce prietenul achită integral prima lună. Creditul se vede la recepție și se folosește la următoarea plată.”
- *Până când e valabilă campania?* „Până pe 27 octombrie 2026, înainte de vacanța de toamnă. Până atunci trebuie să faci ora gratuită, să te înscrii și să plătești prima lună.”
- *Pot folosi creditul pe merch sau bilete la spectacol?* „Nu. Creditul e pentru dans: abonament, OPEN class, ședințe, workshopuri, concursuri.”

**F. Contact:** cele trei locații cu adresele lor și două telefoane, Ștefan cel Mare 0730 534 172 și Nicolina / Quasar for Kids 0770 227 580, plus un buton „Sună” pe mobil.

### După termen
Din **28 octombrie 2026**, pagina nu se mai afișează: cine scanează un bilet vechi ajunge pe pagina obișnuită de programare. Pentru această stare nu e nevoie de design.

### Livrabile LP
Machetă mobil (375 px) și desktop (1440 px), cu stările formularului. Componentele se refolosesc din site-ul actual (butoane, câmpuri, select-uri), nu se reinventează.

---

## 3. Câmpul „Cine te-a invitat?” în celelalte formulare de pe site

- Până pe 27 octombrie, câmpul apare în **toate formularele de înscriere/programare** de pe site, **opțional**.
- Eticheta: „Te-a invitat cineva? (opțional)”
- Placeholder: „Numele colegului de la Quasar”
- Se desenează ca un câmp în plus, în stilul formularului existent, **fără** banner sau pop-up.
- Din 28 octombrie câmpul dispare singur; nu e nevoie de design pentru starea aceasta.

---

## 4. Materiale pentru instructori și recepție

**Anunțul la curs** (citit de instructor, ~20 de secunde):
> „Avem o campanie pentru voi: fiecare primește bilete pentru prieteni. Prietenul vostru vine la o oră gratuită, iar dacă se înscrie, familia voastră primește 60 lei credit, pentru fiecare prieten. Scrieți-vă numele pe bilet ca să știm că e invitatul vostru. E valabil până pe 27 octombrie.”

**Imaginea pentru WhatsApp** (pătrat 1080×1080 și story 1080×1920): aceeași grafică a biletului, cu „M-a invitat: ___” gol și URL-ul vizibil. Imaginea e pentru familiile care trimit invitația digital.

---

## Ce se livrează

1. 2 direcții vizuale (A și B) pentru bilet, în PDF, pentru alegere.
2. După alegere: PDF de print A5 cu margini de tăiere și linii de perforare, plus fișierul editabil.
3. Macheta LP-ului (mobil + desktop) și câmpul pentru celelalte formulare.
4. Imaginea pentru WhatsApp (pătrat + story).

## Verificări înainte de tipar

- Printat la mărime reală: se citește ușor, biletele se desprind curat, „M-a invitat” are loc pentru un nume întreg.
- QR-ul final se scanează de pe hârtie și dintr-o fotografie de pe ecran.
- Un părinte înțelege în câteva secunde **cine** primește cei 60 lei: familia care invită, nu prietenul.
