# Înrolare rapidă la facultative din roster

**Stare:** deschis — 2026-10-05. Analiză pe cod local; fără verificare pe DB live, implementare sau modificări de date.

## Cererea

- **confirmat de Alex:** la început de lună rosterul facultativelor este gol, iar înrolarea individuală este greoaie; dorește o soluție mai simplă direct din roster. A sugerat participanții din ultimele 30 de zile și alegerea lunar/per ședință. Detaliile de mai jos sunt propuneri, nu aprobări de implementare.

## Soluție propusă

- **propunere:** secțiune „Au venit recent”, în pagina rosterului facultativ, vizibilă și când rosterul este gol. Nume, ultima prezență la acest curs, număr de zile cu prezență în fereastră, buton „Înrolează”. Sugestiile nu intră în contoarele rosterului și nu generează bani sau prezențe.
- **propunere:** candidați = clienți distincți cu `Prezent` la exact cursul afișat în intervalul [ziua selectată − 30 zile, ziua selectată), fără acces deja valabil în ziua selectată. Ordonare după ultima prezență descrescător, apoi nume. Nu filtra istoricul prin `activ`/`reziliat`; exclude persoanele anonimizate. Nu extinde automat la alte grupe ori clone de sezon.
- **propunere:** click pe „Înrolează” deschide un popover mic cu numele și două acțiuni explicite: „Lunar — [luna, preț]” / „Pe ședință — [data, preț]”. Alegerea creează înrolarea; nu mai există o confirmare generică după. Cursul, clientul și data vin din roster. Prețurile provin din fluxul canonic, nu din înrolarea veche. După succes, candidatul dispare din sugestii și apare în roster.
- **propunere:** lunar = numai luna selectată, cu regulile existente (preț întreg, fără prorata; început de sezon respectat). După 15 apare avertismentul existent, fără blocare. Pe ședință = numai ziua selectată, prin fluxul de rezervare OPEN existent, inclusiv verificarea sesiunii/capacității; nu insera doar un enrollment izolat.
- **propunere:** înrolare cu 0 lei încasați în acest pas; afișează clar „Înrolare fără încasare; suma rămâne de achitat”. Plata rămâne disponibilă ulterior din fluxul obișnuit. Nu marca automat `Prezent`. Aceste două separări fac posibilă singura alegere solicitată: lunar sau ședință.
- **propunere:** păstrează „Adaugă cursant” pentru persoane care lipsesc din sugestii și o legătură „Formular complet” pentru voucher/excepții. Prima versiune are acțiuni individuale rapide, fără reînrolare automată a tuturor.
- **propunere:** fluxul compact poate fi disponibil și pe mobil pentru recepție și rolurile superioare; nu extinde dreptul de înrolare la instructor. Respectă restricțiile de dată și de rol existente, inclusiv modul `todayOnly`. O eventuală înrolare retroactivă păstrează auditul fluxului complet.

## Repere pentru Claude — constatări locale de verificat înainte de implementare

- **propunere:** pornește din `src/features/dashboard/GrupaDashboardPage.tsx`: există deja `FostiSection`, buton „Reînrolează” și `EnrollmentForm` precompletat cu client/curs. Lista e ascunsă în `todayOnly`, iar acțiunile de înrolare sunt ascunse pe mobil prin `canDeskActionsHere`. Componenta nu transmite data rosterului formularului existent.
- **propunere:** nu reutiliza neschimbată selecția `fosti` din `src/features/dashboard/api/grupa.ts`: ea pornește de la înrolări începute în ultimele 180 zile, apoi citește prezențele. Cerința nouă pornește de la prezențele efective în cele 30 zile raportate la data selectată. Pagina folosește `getGrupaDashboard`; `src/features/prezente/api.ts` este un alt consumator, cu selecție diferită.
- **propunere:** reutilizează logica din `src/features/plati/components/EnrollmentForm/index.tsx`: lunar apelează `createInrolari`, pe ședință apelează `rezervaLocOpen`. Acesta din urmă acceptă 0 lei și cere locația de lucru. Nu copia calculul prețurilor sau logica financiară într-un al doilea flux.
- **propunere:** verifică în DB protecția împotriva dublurilor/concurenței pentru lunar, ședință și suprapunerea lor. `createInrolari` are verificare frontend pentru abonamente suprapuse, insuficientă ca garanție concurentă. Dezactivarea butonului la salvare nu înlocuiește garanția serverului. Dacă există deja ședințe plătite în aceeași lună, alegerea lunar trebuie să urmeze o regulă explicită de conversie/regularizare; până la verificarea ei, trimite acest caz la formularul complet, fără abonament nou creat orbește.
- **propunere:** invalidează rosterul, sugestiile, înscrierile și rezervările relevante după succes; afișează eșecurile prin mecanismul global existent. Paginează istoricul și sparge filtrele mari conform convențiilor proiectului. Orice RPC nou respectă gardurile de rol și revocările din AGENTS.md.

## Validare la implementare

- **propunere:** verifică început de lună cu abonament vechi închis, participant pe ședință din luna trecută, limita exactă de 30 zile, prezențe la alt curs, acces deja existent, două recepții care apasă simultan, schimbarea datei rosterului, lună de start sezon, abonament după 15, ședințe deja plătite înainte de alegerea lunar, lipsă tarif/sesiune și capacitate depășită. Sugestiile trebuie să lase contoarele și sumele neschimbate până la alegerea explicită; înscrierea nu produce încasare sau prezență.
- **propunere:** Claude verifică apoi type-check, build și smoke test pe desktop/mobil, cu curățarea datelor de test conform workflow-ului proiectului.
