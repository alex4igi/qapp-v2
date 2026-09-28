# Campanie de recomandări pentru grupele Varsity și Teens sub prag

**Stare:** deschis — proces propus la 2026-09-28; nicio implementare.

## Context și decizii

- **Confirmat de Alex:** obiectivul este aducerea de clienți în grupele sub pragul minim; interes prioritar pentru Varsity și Teens.
- **Confirmat de Alex:** dorește 60 lei credit în cont când prietenul adus a plătit luna octombrie; același client poate primi de mai multe ori 60 lei, pentru prieteni diferiți.
- **Confirmat de Alex:** voucherele de anul trecut au funcționat mai bine la copii decât la adolescenți.
- **Confirmat de Alex:** recompensează recomandările eligibile către orice grupă; campania va fi promovată în grupele deficitare, cu prioritate Varsity și Teens.
- **Confirmat de Alex:** invitatul poate fi și un fost client care revine.
- **Confirmat de Alex:** cei 60 lei intră în contul familiei care recomandă.
- **Confirmat de Alex:** dorește urmărirea rezultatelor cel puțin două luni.
- **Confirmat de Alex:** la curs se anunță campania și se înmânează un voucher fizic cu mai multe bilete detașabile; membrul își contactează prietenii. Prietenul are prima oră gratuită, iar plata eligibilă declanșează creditul de 60 lei în contul familiei recomandatoare.
- **Confirmat de Alex (28 sept.):** dacă prima oră este prea târziu în octombrie pentru a mai exista o rată de octombrie, plata primei rate din noiembrie poate declanșa recompensa.
- **Confirmat de proiect:** pragul de existență este 8 cursanți plătitori, respectiv 6 în SCM Studio 2; trei luni încheiate sub prag duc la propunere de suspendare, nu la suspendare automată. Facultativele folosesc locuri echivalente. Sursa: `docs/reguli-domeniu.md` §2.
- **Confirmat de proiect:** creditul actual este calculat din resturi negative pe înrolări/datorii și provine din supraplăți; `use_client_credit` consumă acest sold. Nu există în fluxul verificat o acordare distinctă de credit promoțional. Sursa: `src/features/plati/api/enrollment-admin.ts`.
- **Confirmat de proiect (28 sept.):** formularul public intră prin ruta serverului site-ului `/api/inscriere`, care cheamă `intake-website-lead` cu secret; funcția primește astăzi `mesaj` și `campanie`, dar nu are câmp structurat pentru familia care recomandă. `insertLead` din `supabase/functions/_shared/intake.ts` deduplică după telefon; dacă există deja leadul, îl loghează, dar nu îi actualizează `observatii` și nu păstrează acolo o recomandare nouă. Documentul `docs/integrare-website-leads.md` descrie încă apelul direct din browser și este învechit față de cod pe acest punct.

## Procesul pe scurt — de explicat echipei

Toți pașii operaționali de mai jos sunt **propuneri**; regulile decise de Alex sunt marcate mai sus.

1. **Cursantul primește la curs un carton cu mai multe bilete pentru prieteni.** Toate cartoanele sunt tipărite identic: QR spre formularul pentru prima oră gratuită, telefonul recepției și spațiul „M-a invitat: ____”. Nu se tipăresc coduri sau nume diferite pentru fiecare copil.
2. **Cursantul dă un bilet unui prieten.** Pe bilet se scrie numele cursantului care l-a invitat. Prietenul sau părintele lui cere o programare pe site, la telefon ori la recepție și spune cine l-a invitat. Recepția identifică familia cursantului în qapp, leagă recomandarea de fișa prietenului, apoi confirmă grupa și ziua. Dacă vine direct, recepția face acești pași înainte de clasă.
3. **Prietenul face prima oră gratuită.** Nu se cere plată pentru acea oră. După curs, recepția îi propune înscrierea și spune prețul primei luni. Dacă nu se înscrie, nu există recompensă.
4. **Prietenul se înscrie și plătește integral prima rată eligibilă.** În mod obișnuit aceasta este octombrie, inclusiv dacă rata este prorată. Dacă nu mai are ședințe plătibile în octombrie, prima rată este noiembrie. Dacă suma datorată pentru prima rată este 78 lei, plata celor 78 lei este suficientă pentru calificare.
5. **Familia care l-a invitat primește 60 lei credit.** Creditul intră o singură dată pentru acel prieten, după confirmarea plății. Dacă alt prieten se înscrie și plătește, aceeași familie primește încă 60 lei. Creditul se folosește la o plată viitoare a familiei.

**Exemplu:** Ana dă două bilete identice lui Vlad și Mariei și își scrie numele pe ele. Vlad se programează prin QR, Maria sună; amândoi spun că i-a invitat Ana. Recepția găsește familia Anei și o leagă de ambele solicitări. Vlad vine la probă, dar nu se înscrie: 0 lei credit. Maria vine, se înscrie și achită integral rata prorată din octombrie: familia Anei primește 60 lei. Dacă Vlad se înscrie ulterior și achită prima rată eligibilă, familia primește încă 60 lei.

**Rolul site-ului:** captează solicitarea și răspunsul la „Cine te-a invitat?”. Programarea efectivă o confirmă recepția. Telefonul și prezentarea directă duc prin aceiași pași și au aceeași eligibilitate.

**Clarificare QR/site (28 sept.):** înscrierea pentru prima oră pe site rămâne inclusă. Toate biletele au **același QR**, care deschide **același formular**. Prietenul completează datele sale și numele celui care l-a invitat; recepția identifică familia în qapp. QR-ul nu trebuie să identifice automat familia și nu cere tipărirea unui cod diferit pentru fiecare cursant. Formularul de pe site trebuie extins cu întrebarea despre recomandare; fluxul actual nu face încă atribuirea automată. Dacă ulterior volumul justifică automatizarea, codurile individuale pot fi o optimizare separată, nu o condiție pentru pilot.

**Schimbare minimă pentru site, propunere:** un câmp opțional „Cine te-a invitat?” în formular, transmis prin `/api/inscriere` către `intake-website-lead`; funcția păstrează recomandarea separat și la solicitările cu telefon deja existent, pentru ca recepția să o poată valida și lega de familie. Nu se rescriu regulile generale de creare, programare sau conversie a leadurilor. `campanie` marchează sursa, dar nu identifică familia; `mesaj` singur este insuficient din cauza deduplicării. Pentru pilot complet manual, site-ul poate rămâne neatins dacă recepția întreabă mereu cine a invitat și notează răspunsul înainte de probă, însă traseul QR/site nu va capta sigur recomandarea.

## Propunere de campanie pilot

- **Propunere:** promovarea activă se face în grupele cu deficit și locuri disponibile, cu prioritate Varsity și Teens. Selecția se revizuiește săptămânal, folosind definiția canonică a ocupării și pragul sălii. Invitatul poate alege orice grupă potrivită, iar recompensa rămâne valabilă indiferent de grupa în care se înscrie.
- **Propunere:** invitație transmisă prin cursanții existenți: „Vino cu un prieten la antrenament”. Instructorul face integrarea în grupă; recepția urmărește contactul și înscrierea. O experiență socială concretă este mai potrivită pentru Varsity/Teens decât distribuirea unui cod de reducere.
- **Propunere:** 60 lei credit în contul familiei care recomandă pentru fiecare prieten distinct, nou sau fost client revenit, care se înscrie și își achită integral obligația pentru octombrie (inclusiv o rată prorată corect calculată). Creditul se acordă o singură dată per invitat în campanie, dar fără plafon de recomandări per familie; 3 prieteni = 180 lei. Recomandarea se declară la primul contact, înainte de plată. Nu se acceptă autorecomandare sau recomandări reciproce artificiale.
- **Propunere:** creditul se acordă după confirmarea plății, pentru folosire începând cu rata din noiembrie; la anulare/returnare se face corecție auditată. Separarea creditului promoțional de supraplata cash este necesară pentru raportare și pentru a nu crea o „încasare” fictivă.
- **Propunere:** prietenul primește o invitație simplă la o ședință de probă în grupa potrivită, nu automat un al doilea stimulent financiar. Dacă pilotul are conversie slabă, se testează o variantă cu beneficiu mic și pentru invitat, păstrând bugetul total controlat.
- **Propunere:** comunicarea merge către părintele/plătitorul membrului minor, iar mesajul pentru adolescent pune accent pe participarea împreună. Fără colectarea numerelor prietenilor de la copii; familia invitată contactează direct Quasar ori este introdusă cu acordul ei.
- **Propunere:** promovare pilot de 2 săptămâni, urmată de urmărirea fiecărui invitat cel puțin două luni după octombrie (noiembrie și decembrie). Raport pe grupa de proveniență și pe grupa în care s-a înscris invitatul: invitații, probe, înscrieri, octombrie achitat, credite acordate, prezență și plăți în noiembrie/decembrie, locuri față de prag. Se raportează separat clienții noi și cei reveniți. Bugetul de recompense = 60 lei × recomandări validate. Comparați cu marja pe abonații atrași, nu doar cu încasările brute. Urmărirea pe două luni măsoară retenția; **nu amână acordarea creditului** după plata eligibilă din octombrie.

## De clarificat cu Alex înainte de implementare

1. **Propunere de confirmat:** creditul se acordă la plata integrală a ratei din octombrie, chiar dacă înscrierea târzie are prorată. Trebuie stabilit termenul limită al plății eligibile.
2. **Propunere de confirmat:** dacă invitatul cere restituirea plății, se inversează creditul nefolosit. Pentru creditul deja consumat trebuie stabilită regula de corecție.
3. **Propunere de confirmat:** pentru un fost client, ce perioadă minimă fără înrolare activă îl califică drept „revenit”? Aceasta previne recompensarea unei simple reînnoiri lunare.

## Proces complet propus la 28 septembrie

Toți pașii de mai jos sunt **propuneri**, nu funcționalități existente/confirmate.

1. **Pregătire săptămânală.** Managerul alege grupele în care se promovează, după deficitul față de prag și locurile disponibile. Recepția primește lista și orarele. Recompensa este valabilă și dacă invitatul se înscrie în altă grupă potrivită.
2. **Anunț la curs.** Instructorul spune pe scurt: „Adu un prieten la o primă oră gratuită. Dacă se înscrie și plătește prima lună eligibilă, familia ta primește 60 lei credit. Poți invita mai mulți prieteni.” Nu cere elevului datele de contact ale prietenilor.
3. **Voucher fizic.** Toate familiile primesc același carton cu mai multe bilete detașabile, tipărit în tiraj unic. Fiecare bilet are QR către formularul de programare, telefonul recepției și spațiul „M-a invitat: ____”; numele poate fi scris de mână. Nu este necesar niciun cod unic pe copil. Biletul este o invitație și o dovadă de proveniență, nu un instrument de plată și nu reduce prețul invitatului. Regulile esențiale stau pe bilet: prima oră gratuită; 60 lei credit familiei care recomandă după plata eligibilă; valabilitatea campaniei.
4. **Invitația.** Cursantul contactează personal prietenii și le dă câte un bilet sau le trimite linkul/poza QR. Pentru minori, părintele invitatului face programarea.
5. **Intrarea prietenului.** Calea recomandată: QR → formular de ședință gratuită cu întrebarea „Cine te-a invitat la Quasar?”. Alternative egale: telefon la recepție sau prezentare directă cu biletul. În toate cazurile recepția caută persoana după datele existente, creează sau reactivează leadul potrivit, identifică în qapp familia celui care a invitat-o, leagă recomandarea și programează ședința în grupa potrivită. Dacă numele este ambiguu, întreabă și grupa/locația cursantului care a invitat. Formularul actual de website duce leadul în `Nou`; câmpul „Cine te-a invitat?” necesită o extindere verificată și pe site-ul live. O programare nu este confirmată doar prin scanarea QR-ului: recepția confirmă ziua/grupa și locul. Walk-in-ul poate participa numai dacă recepția confirmă locul și îl înregistrează înainte de clasă.
6. **Prima oră gratuită.** Instructorul/recepția bifează prezența în rosterul demo. Dacă lipsește, se folosește procedura existentă „Nu a venit” și se reprogramează; biletul nu se consumă la simpla programare. Dacă vine, recepția discută imediat după curs despre grupa potrivită, prețul primei luni și înscriere. Prima oră gratuită nu creează datorie și nu este o rată plătită.
7. **Înscriere și preț.** Recepția convertește leadul sau reînscrie fostul client prin fluxul potrivit și păstrează legătura cu recomandarea. Pentru grupele recurente, prima rată din octombrie se calculează prin regula existentă: ședințe plătibile rămase × prețul contractual/ședință, plafonat la rata lunară. Dacă nu s-a pierdut nicio ședință din luna plătită, rata poate fi întreagă. Trupele și facultativele nu au prorată. Ședința gratuită este înaintea înrolării plătite; nu se adaugă ca plată și nu se inventează o reducere suplimentară de 60 lei pentru invitat. Recepția explică suma concretă înainte de plată.
8. **Validare.** Recomandarea devine eligibilă când înrolarea lunii calificatoare este achitată integral din încasare reală confirmată. Și o rată corect prorată se califică; nu se impune un minim arbitrar de lei. Aceeași persoană invitată produce maximum o recompensă în campanie, iar aceeași familie poate primi multiple recompense pentru invitați diferiți. Verificarea evită autorecomandarea, dublele înregistrări și o reînnoire lunară obișnuită a unui client deja activ.
9. **Acordarea.** Se înscriu 60 lei credit promoțional în contul familiei referentului, cu legătura către invitat și plata care a declanșat recompensa. Familia primește confirmare; creditul poate acoperi o plată viitoare a oricărui membru al familiei. Nu se creează o încasare fictivă și nu se confundă cu supraplata existentă.
10. **Urmărire.** Raportul urmărește trecerea bilet → solicitare → programare → probă prezentă → înrolare → prima lună achitată → noiembrie/decembrie activ și plătitor. Se raportează distinct canalul de intrare (site, telefon, direct), client nou/revenit, grupa promotoare, grupa aleasă și costul recompenselor. Două luni de urmărire nu condiționează plata recompensei.

**Propunere de atribuire:** numele cursantului care a invitat se declară la primul contact, înainte de probă și de plată; recepția îl rezolvă la familia corectă în qapp. Dacă biletul a fost uitat, declarația verbală sau din formular este suficientă, dar atribuirea trebuie făcută cel târziu la înrolare. Dacă două familii revendică același invitat, contează prima recomandare documentată; cazul neclar se decide de manager înainte de acordarea creditului.

**Propunere de tratare a proratei:** nu reduceți recompensa proporțional cu prima rată. Un invitat cu rată octombrie de 78 lei poate declanșa tot 60 lei după ce achită cei 78 lei. Pentru analiza economică urmăriți și plățile din următoarele două luni. Dacă demo-ul se ține la final de octombrie și prima rată este noiembrie, aplicați decizia confirmată de Alex mai sus.

## Note pentru Claude la o eventuală implementare

- **Propunere:** registru dedicat de recomandări și recompense cu familia referentă, invitatul, grupa de proveniență, grupa în care s-a înscris, momentul declarării, plata calificatoare, stare și motivul corecției; constrângere pentru o singură recompensă per invitat/campanie, dar fără limită per familie referentă. Verificarea plății și emiterea recompensei trebuie să fie atomice și auditabile.
- **Propunere:** creditul la nivel de familie cere un mecanism distinct sau extinderea explicită a celui actual, care calculează soldul la nivel de client. Claude trebuie să verifice fluxul portalului și al recepției înainte de implementare.
- **Propunere:** nu folosiți un voucher RE sau o încasare fictivă pentru a imita creditul. Voucherele existente reduc o rată și sunt incompatibile cu prețul promo de reînscriere; creditul din qapp reprezintă astăzi supraplată.
- **Propunere:** respectați regulile de rol și RLS din `AGENTS.md` pentru orice tabel/RPC nou. Nu aplicați migrații până la confirmarea politicii de campanie de către Alex.


---

## Decizii 28.09.2026 și implementare (Claude)

**Confirmat de Alex (28.09):**
- Creditul consumat nu e încasare; rata apare achitată. Se acordă automat la plată, dacă recepția a confirmat familia.
- Termen: până la prima vacanță (27.10.2026) pentru probă, înscriere și plată. **Excepția cu noiembrie a căzut.**
- Fost client = neînscris în sezonul curent.
- La invitați prima rată e întreagă, pro-rata trece în luna a doua; recompensa (60 lei integral) vine la plata ratei întregi.
- Creditul se folosește și la OPEN class, ședințe (K-pop), workshopuri, concursuri.
- Anulare: creditul nefolosit se anulează; cel folosit rămâne, cu semnal pentru manager.
- Landing page dedicat `quasardance.ro/recomandari`; câmpul „Cine te-a invitat?" și în celelalte formulare cât e activă campania.
- Numele campaniei: **DANCE WITH ME**; pagina `quasardance.ro/dance-with-me`, orientată către invitat (creditul familiei doar în regulament, fără sumă).
- Telefoane pe bilet: Ștefan cel Mare 0730 534 172 și Nicolina 0770 227 580 (răspunde și pentru Quasar for Kids).

**Implementat:** vezi `docs/reguli-domeniu.md` §10 — reguli și locul lor în cod.
