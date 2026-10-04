# Review update plan Claude — versiunea 22:06

**Stare:** deschis · verificat 2026-10-04. Review de plan și cod local, fără modificări de implementare sau verificarea independentă a cifrelor live raportate de Claude.

**confirmat de Alex:** solicitarea de evaluare a ultimului update.

Sursă: `/Users/alex_igi/.claude/plans/analizeaza-hand-offul-lui-codex-fuzzy-sky.md`, versiunea modificată la 22:06.

**propunere:** planul rezolvă substanțial review-ul anterior: sursă unică și deduplicare OPEN, istoric bazat pe reziliere reală, datorii one-off, scadențe separate, recuperarea verificării plății după refresh, stări de eroare, perioada ratei și teste de izolare. Nu recomand extinderea lotului. Mai trebuie precizate următoarele înainte de implementare.

## 1. Limita de 120 zile versus calendarul întregului sezon

**propunere — necesar:** A limitează RPC-ul la 120 zile, dar `../qapp-membri/src/features/calendar/CalendarPage.tsx` afișează toate lunile sezonului și construiește elemente pe întreg intervalul. Planul nu spune cum adaptează consumatorul. Un apel pe sezon va fi refuzat; unul trunchiat ar lăsa lunile ulterioare goale.

Precizare recomandată: păstrarea calendarului actual și cereri în intervale de maximum 120 zile, fără suprapuneri, apoi reunire. Alternativ, o limită server suficientă pentru un sezon, tot validată și mărginită. La încărcare parțială, lunile neîncărcate nu trebuie prezentate drept lipsite de ședințe. Acceptare: prima și ultima lună din sezon arată ședințele corecte, nu numai fereastra Acasă de 14 zile.

## 2. Regula OPEN este decisă în antet, dar încă „de decis” în A

**propunere — necesar:** în „Decizii Alex”, planul raportează regula nouă: loc confirmat, indiferent de bani. În A a rămas „Filtrul pe bani depinde de decizia lui Alex”. Eliminați textul vechi; aplicați consecvent regula raportată, fără prag financiar. Aceasta este compatibilă cu distincția loc confirmat versus încasare din regulile domeniului.

Precizați și pentru ședințele fără rezervare că înrolarea trebuie să fie valabilă la data ședinței, nu reziliată înaintea ei. Păstrați ședințele istorice încheiate normal; hold/anulare nu se transformă în ședință fără rezervare printr-un join filtrat greșit.

## 3. Totalul sezonului nu trebuie afișat ca datorie urgentă

**propunere — necesar pentru UI:** noul rezumat include toate termenele viitoare, iar vechiul sold excludea lunile viitoare. Refolosirea `total` în badge/header sau în cardul roșu „Sold familie” poate transforma o rată curentă de câteva sute de lei în mii de lei afișați ca urgență.

Specificați câmpul și stilul pentru fiecare loc: restanța în roșu; următorul termen separat și neutru; totalul ratelor viitoare etichetat explicit. Ziua scadenței este încă nescadentă în sensul de „întârziat”, deci nu devine roșie. Păstrați defalcarea pe copil din /plati sau precizați sursa ei în noul contract, astfel încât datoriile one-off să se regăsească și în defalcare, nu doar în total.

## Detalii de execuție

**propunere:** mesajul holdului să spună „30 de minute de la inițierea rezervării”, nu să sugereze încă 30 minute la fiecare refresh. După confirmarea OPEN, invalidați și cache-ul noului RPC de ședințe: Acasă și Calendar trebuie să reflecte rezervarea imediat, nu doar lista OPEN.

**propunere:** cifrele live citate sunt dovezi raportate de Claude; nu le-am reverificat. Concluzia favorabilă privește structura planului. Implementarea și rezultatul testelor vor necesita review separat.
