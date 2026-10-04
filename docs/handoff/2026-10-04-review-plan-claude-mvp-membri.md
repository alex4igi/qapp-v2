# Review plan Claude — MVP membri

**Stare:** deschis · verificare 2026-10-04. Analiză statică, fără modificări de cod sau DB, fără verificare live.

**confirmat de Alex:** solicitarea de review al planului lui Claude.

Plan analizat: `/Users/alex_igi/.claude/plans/analizeaza-hand-offul-lui-codex-fuzzy-sky.md` (versiunea citită la 4 octombrie, fișier modificat la 21:44).

**propunere:** verdict favorabil cu corecțiile de mai jos înainte de implementare. Lotul A–F este coerent. Deciziile atribuite lui Alex în plan sunt tratate ca scope raportat de Claude, nu ca aprobări noi obținute prin acest review. Nu propun redeschiderea punctelor 7–8.

## 1. Calendar: separarea OPEN de înrolările pe ședință — prioritate mare

**propunere:** planul trebuie să precizeze o singură sursă pentru fiecare ședință. A generează evenimente din toate înrolările pe ședință achitate, dar păstrează și OPEN din `get_rezervari_client`. O rezervare OPEN achitată are și înrolare: combinarea fără excludere/deduplicare o poate afișa de două ori.

În plus, `get_rezervari_client` filtrează `open_rezervari.status = 'platit'`, nu plata efectivă. Conform `docs/reguli-domeniu.md` §4, acesta înseamnă loc confirmat și poate avea zero lei încasați. Dacă decizia raportată în plan, „Per ședință doar achitate”, include OPEN, păstrarea RPC-ului actual fără filtrul financiar nu o respectă.

Acceptare: OPEN achitat apare exact o dată; holdul și rezervarea anulată nu apar; OPEN confirmat de recepție dar neplătit/parțial respectă explicit regula aprobată. Ideal, aceeași listă finală alimentează Acasă și Calendar. Altfel, Acasă poate omite o rezervare pe care calendarul o afișează. Includeți `client_id`, identificatorul stabil al ședinței și tipul sursei în rezultat; Calendar filtrează membrul ales, Acasă agregă familia.

## 2. „Achitat” și istoricul înrolărilor — prioritate mare

**propunere:** în A, înlocuiți criteriul propus `plati_inrolari.rest = 0` cu sensul canonic `rest <= 0`. O supraplată înseamnă tot achitat; altfel o ședință dispare tocmai după plata suplimentară.

`plati_inrolari` din `20260912180000_plati_inrolari_fara_window.sql` exclude `reziliat = true`. Nu trebuie folosit fără discernământ ca sursă pentru calendarul istoric: flagul este și închidere de lună, nu numai plecare. Pentru înrolările recurente, intervalul trebuie limitat și prin `data_reziliere`, nu doar `data_final`; altfel pot apărea ședințe după plecare. Verificați definițiile live înainte de alegerea sursei.

Acceptare: rest negativ rămâne achitat; lună încheiată normal nu dispare din istoric numai din cauza flagului; rezilierea reală taie ședințele ulterioare; două rânduri de înrolare suprapuse nu dublează aceeași ședință a copilului.

## 3. Rezumatul financiar are nevoie de un contract precis — prioritate mare

**propunere:** F trebuie să includă explicit datoriile one-off. `get_sold_familie` din `20260824180000_datorii_dashboard_aliniere.sql` citește doar `plati_inrolari`; datoriile separate vin în portal prin `get_datorii_client`. Dacă noul rezumat reproduce prima sursă, Acasă poate declara „Totul e achitat” deși există taxe/bilete/produse neachitate.

Definiți distinct: rest pozitiv, excluderea prescrisului conform regulii actuale, scadență trecută strict înainte de azi, datorii scadente azi și rate viitoare. Folosiți `enrollments.sezon_id` la calculul scadenței, ca funcția canonică de restanțe; `get_plati_client` întoarce azi sezonul cursului, care nu trebuie presupus echivalent fără verificare.

Un singur `de_achitat` și `urmatoarea_scadenta` sunt insuficiente dacă familia are termene diferite: 80 lei OPEN mâine + 270 lei abonament pe 15 nu înseamnă 350 lei de achitat mâine. Întoarceți suma aferentă fiecărui termen sau cel puțin suma aferentă următoarei scadențe, separat de total. Arătați și rata apropiată când există deja restanță; ramura exclusivă „dacă restant, altfel termen” o ascunde.

Acceptare: familie numai cu datorie one-off; OPEN și abonament cu termene diferite; scadență azi; septembrie/iunie; sold cu credit pe un rând și rest pe altul; toate sumele reconciliate cu sursele CRM. „La zi cu plățile” este mai precis decât „Totul e achitat” când există rate viitoare.

## 4. Plata comună: nu copiați limitele componentei OPEN — prioritate medie

**propunere:** reutilizarea RPC-ului generic este corectă. Componenta actuală `RezultatPlata` are însă texte exclusiv de rezervare. Noua componentă trebuie să distingă plata abonamentului de rezervare și să trateze explicit eroarea citirii statusului / comanda inexistentă sau inaccesibilă; acestea nu dovedesc o plată inițiată cu succes.

Referința `order` doar în state se pierde la refresh, deoarece URL-ul este curățat. Păstrați o cale de revenire la verificarea aceleiași comenzi după cele 30 de secunde de polling (URL păstrat sau persistență adecvată, cu scop pe cont) și un buton de reverificare. Invalidați la confirmare și `datorii`, noul rezumat financiar, planul de plată integrală dacă îl afișați, pe lângă `plati` și `sold-familie`. Lista exactă se verifică pe query keys reale.

Acceptare: pending → confirmată după timeout și refresh; failed/canceled; eroare rețea; referință străină fără dezvăluire de date; plată one-off reflectată fără reautentificare. Mesajul OPEN nu trebuie să promită hold nelimitat: regula existentă este 30 minute.

## 5. Păstrați perioada ratei în /plati — prioritate medie

**propunere:** F spune „scadent pe ... în loc de data începerii”. Afișați luna/perioada cumpărată și scadența separat; pentru ședință păstrați ziua ședinței. O datorie istorică sau două rate ale aceleiași grupe trebuie să rămână identificabile. Datele trebuie etichetate, nu doar înlocuite.

## 6. Acasă: „următoarea” înseamnă și oră — prioritate medie

**propunere:** E să elimine ședințele deja trecute azi, pe fusul Europe/Bucharest, nu numai datele trecute. Dacă ora lipsește, afișați explicit situația. Dacă fereastra de 14 zile cade în vacanță, mesajul gol trebuie să spună „Nicio ședință în următoarele 14 zile”, nu să sugereze lipsa înscrierii. Test cu doi frați și ore diferite în aceeași zi.

## Verificări și observații de scope

**propunere:** adăugați test de izolare cu două familii și apeluri respinse pentru anon/marketing/teacher. Scanările RLS de tabel nu demonstrează izolarea unui RPC SECURITY DEFINER. Pentru RPC-ul de interval: `search_path` fix, interval valid și limitat, scopare pe membrii contului, granturi explicite; limitarea intervalului ține și calculul sub control.

**propunere:** smoke testul să includă failed/canceled și refresh după pending, nu doar confirmed/pending; migrațiile care schimbă return table trebuie verificate și cu frontend-ul vechi încă deployat. Nu este necesar să se modifice datele unei familii reale pentru test. Fixture-uri dedicate cu cleanup pentru cazurile care necesită scriere.

**propunere:** mențiunea planului despre telefonul lipsă la Valea Lupului nu este un defect actual: `docs/reguli-domeniu.md` §11 precizează că locația este de campanie, fără recepție/adresă/telefon. Nu inventați contact de locație. Acest punct rămâne oricum în afara lotului.

**propunere:** corecția lui Claude despre OPEN este justă: locația apare deja; lipsește ora. „Ora la rezervări dacă nu intră” din finalul planului contrazice includerea explicită în A; păstrați-o în lot sau marcați clar excluderea.

**propunere:** după aceste precizări, planul este potrivit pentru implementare. Nu este nevoie de module suplimentare sau de lărgirea lotului MVP.
