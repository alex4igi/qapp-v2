# Inspirație portal membri — TwinkleStar (EASYSCHOOL)

> Analiză a portalului de membru de la **TwinkleStar** (școală de limbi străine / cursuri & examene Cambridge, Iași), folosit ca referință pentru modulul nostru **qapp-membri** (zona de membru self-service pentru clienți/familii).
>
> - **Platformă**: EASYSCHOOL, produs de [Easy Software Solutions (ESS)](https://www.easymedical.ro) — același vendor face și soft medical. E un produs SaaS generic, nu construit special pentru ei.
> - **URL analizat**: `https://cursuriexamene.twinklestar.ro`
> - **Cont folosit**: cont de părinte cu 2 copii înrolați (Alexia + Felix).
> - **Plăți online**: Netopia (VISA/Mastercard).
> - **Data analizei**: 2026-06-15.
> - Screenshot: [docs/inspiratie-portal-membri/01-cursuri.png](./inspiratie-portal-membri/01-cursuri.png)

---

## 1. Structura portalului (ce vede un părinte logat)

Portalul are **5 secțiuni** în meniul de sus + un **selector global de copil** (combobox) prezent pe aproape fiecare pagină. Tot ce vezi e filtrat pe copilul selectat.

| # | Secțiune | URL | Ce conține |
|---|----------|-----|-----------|
| 1 | **Cursuri și examene recomandate** | `/CoursesTwinkleStar/IndexCourses` | Catalog de cursuri pe care le poate cumpăra/înrola părintele singur, cu plată (integrală sau în rate). Coș + total + buton CONTINUA. |
| 2 | **Detalii plăți** | `/PaidCourses/IndexPaidCourses` | Per curs achiziționat: grafic de rate cu dată scadență, valoare, status `ACHITAT` / buton `PLĂTEȘTE`. Plată online Netopia. |
| 3 | **Activități** | `/StudentFiles/IndexActivities` | **Jurnal de lecție** per ședință: dată, prezent Da/Nu, „Am lucrat", „Temă" + linkuri resurse (audio, PDF, YouTube). Selector grupă + „Rezultate/Istoric". |
| 4 | **Fișă cursant** | `/StudentFiles/IndexStudentFiles` | Profil complet al copilului, **editabil de părinte**: date copil, date mamă, date tată, adresă, date juridice (firmă pt facturare). |
| 5 | **Familie** | `/UserApplicants/IndexUserApplicants` | Lista copiilor sub cont (tip cursant Minor/Adult, status `Confirmat`) + buton „+ ADAUGĂ" copil nou. |

Plus pagina de cont `/Identity/Account/Manage` (date login, schimbare parolă) și flux de „Cont nou" / „Am uitat parola".

---

## 2. Analiză detaliată per secțiune

### 2.1 Detalii plăți — *cea mai valoroasă pentru noi*

Pentru fiecare curs achiziționat se afișează un card cu titlul grupei (ex: „PreYLE (Tiny Stars) / Sâmbătă 11:00-11:50 Tiny Stars Daria Bertea — Sediu Iași Nicolina / An școlar 2025-2026") și un **tabel de rate**:

| Descriere | Data rată | Valoare | Status |
|-----------|-----------|---------|--------|
| Înscriere | 16/09/2025 | 80 | ACHITAT |
| Rată | 17/09/2025 | 210 | ACHITAT |
| Rată | 17/10/2025 | 210 | ACHITAT |
| ... | ... | ... | ... |
| Rată | 17/09/2026 | 225 **(Reducere 10%)** | **PLĂTEȘTE** |
| Manuale | 10/06/2027 | 170 | PLĂTEȘTE |

Observații cheie:
- Graficul de rate e **fix, cu scadențe lunare** (ziua 17 a lunii) — exact modelul nostru de tranșe la „Full copii / Part-time".
- Rândurile achitate sunt read-only; doar prima rată neachitată (sau cele scadente) au buton `PLĂTEȘTE` activ → **plată online card prin Netopia**.
- Reducerea (ex: 10% reînscriere) e afișată **inline pe rândul de rată**, transparent.
- Linii separate pentru taxe non-abonament: `Înscriere`, `Manuale`, `Concurs`.
- Fiecare card de curs are link direct la `Activități` (jurnalul grupei respective).

**De ce contează pentru noi**: avem deja modelul de rate/scadențe (vezi memoria [[project-pret-sedinta-doua-preturi]], invariant suma_baza, reduceri family/cross-sell). Ne lipsește **vizualizarea pentru client + plata online**. Aceasta e exact piesa pe care portalul lor o rezolvă elegant.

### 2.2 Activități — jurnal de lecție (foarte puternic pentru retenție)

Listă cronologică inversă, o intrare per ședință:
- **Data** ședinței
- **Prezent**: Da / Nu
- **Am lucrat**: text liber, descriere detaliată a lecției (ce s-a predat)
- **Temă**: ce are de făcut acasă
- **Linkuri resurse**: audio de pronunție, PDF cu jocuri, canale YouTube

Selector de grupă (dacă copilul e în mai multe) + buton „REZULTATE / ISTORIC" (`?handler=History`) pt anii trecuți.

**De ce contează**: e un instrument de **transparență + engagement părinte** excelent. Părintele vede exact ce face copilul, dacă a fost prezent, ce temă are. Pentru noi (dans) echivalentul ar fi: ce coregrafie/elemente s-au lucrat, prezența la ședință, eventual link la un video demonstrativ. Crește percepția de valoare și reduce churn-ul.

> Atenție la efort: la ei textul „Am lucrat / Temă" e scris manual de profesor după fiecare ședință. E muncă recurentă pentru instructori. Vezi secțiunea 4 (decizii).

### 2.3 Fișă cursant — profil editabil de client

Părintele poate edita (`/StudentFiles/EditStudentFile`):
- **Date cursant**: nume, prenume, data nașterii, email, telefon, „Date facturare" (ex: „Datele mamei").
- **Date mamă** / **Date tată**: nume, email, telefon (separat).
- **Adresă**: județ, localitate, sector, stradă, nr, bloc, ap.
- **Date juridice**: bancă, cont, Reg Com, CIF, formă juridică, adresă firmă — pentru cei care vor **factură pe firmă**.

**De ce contează**: degrevează recepția de actualizarea datelor de contact și facturare. La noi avem deja `clienti` + familii; un formular self-service de actualizare ar reduce munca de recepție. Modelul „date mamă / date tată separate + cine e plătitorul" se mapează pe structura noastră de familie.

### 2.4 Familie — multi-copil sub un cont

- Tabel: Nume, Email, Telefon, **Tip cursant** (Minor/Adult), Data nașterii, **Status** (Confirmat).
- Buton „+ ADAUGĂ" → formular aplicant nou.

Formularul de adăugare copil (`/UserApplicants/EditUserApplicant`) cere:
- Tip cursant: **Minor / Adult** (radio).
- Email, Nume/Prenume copil, Data nașterii.
- **Părinte**: Mama / Tata (radio) + nume/prenume/telefon reprezentant legal.
- Adresă completă (județ dropdown România, localitate, sector, stradă, nr, bloc, ap).

**De ce contează**: confirmă modelul **un cont → mai mulți copii**, cu selector global de copil. Statusul `Confirmat` sugerează un flux de validare din partea școlii (clientul adaugă, școala confirmă) — protejează datele.

### 2.5 Cursuri recomandate — self-enrollment cu plată

Catalog de cursuri disponibile pentru copilul selectat, cu: nume curs, perioadă, **disponibil la sediu X**, valoare totală, câmp pt valoarea ratei, checkbox „Selectează", „Detalii curs". Coș cu Total + CONTINUA → checkout.

**De ce contează**: e înrolarea self-service. Pentru noi e mai sensibil (capacitate grupe, validare nivel/vârstă, OPEN class vs recurent) — vezi [[project-rezervari-open-class]]. Probabil **Fază ulterioară**, nu MVP.

---

## 3. Ce merită să adoptăm în qapp-membri

Prioritizat după raport valoare/efort și pe ce avem deja în backend:

### 🟢 MVP (valoare mare, ne bazăm pe ce există deja)
1. **Selector global de copil/membru** în header-ul portalului — un cont vede toți membrii familiei, totul filtrat pe cel selectat. (Avem deja familii în DB.)
2. **„Detalii plăți" — grafic de rate read-only** per înrolare: descriere, scadență, valoare, reducere inline, status Achitat/De plată. Mapăm direct pe modelul nostru de rate + restanțe. (Vezi [[project-pret-sedinta-doua-preturi]], [[project-statistica-prezente-achitare]].)
3. **Fișă membru editabilă** (date contact + date facturare firmă), cu status „Confirmat" pe modificările sensibile.

### 🟡 Faza 2 (valoare mare, efort/decizii mai mari)
4. **Plată online card** pe rate restante. La ei = Netopia. Noi trebuie să alegem procesatorul (Netopia/Stripe) și să-l legăm de încasări → înregistrare automată în `/financiar`.
5. **Jurnal de lecție „Activități"** (prezent + ce s-a lucrat + temă + resurse). Decizie de proces: cine completează și cât de des (vezi secțiunea 4).
6. **„+ Adaugă membru"** self-service cu flux de confirmare din partea recepției.

### 🔵 Faza 3 / opțional
7. **Self-enrollment** din catalog (cursuri recomandate) — complicat la noi din cauza capacității/nivelului; de făcut după ce portalul de bază e validat.

---

## 4. Decizii / capcane de discutat cu user-ul

- **Jurnalul de lecție = muncă recurentă pt instructori.** La TwinkleStar profesorul scrie după fiecare ședință un paragraf „Am lucrat" + „Temă". La 650+ membri activi și 11 instructori, e cost real. Variante: (a) opțional per grupă; (b) doar prezență + temă scurtă din template; (c) îl legăm de modulul [[project-evaluari-module]] existent. **De clarificat scope-ul înainte de a construi.**
- **Plata online** introduce comisioane, reconciliere, refund-uri, facturare. Trebuie aliniat cu fluxul actual financiar și cu esemneaza/contracte.
- **Securitate/RLS**: portalul lor leagă strict cont↔copii↔grupe. La noi trebuie RLS dur: un părinte vede DOAR membrii lui și DOAR plățile/activitățile lor. (Avem deja disciplină RLS — vezi [[project-roluri-rbac-plan-2026-05-27]].)
- **App separată vs modul.** Conform [[project-zona-membru-client]], zona de membru e planificată ca **app nouă separată pe același Supabase**. Portalul TwinkleStar confirmă că un set restrâns de 5 ecrane e suficient pentru MVP.
- **Status „Confirmat"** pe aplicanți: util ca poartă anti-abuz când clientul își editează/adaugă date. De prevăzut un mic worklist de confirmare la recepție.

---

## 5. Mapare pe modelul nostru de date (orientativ)

| Ecran TwinkleStar | Sursă în qapp v2 |
|-------------------|------------------|
| Selector copil + Familie | `clienti` + relația de familie |
| Fișă cursant | `clienti` (date contact) + date facturare firmă |
| Detalii plăți (rate) | `enrollments` + rate/scadențe + `incasari` (status achitat) + reduceri family/cross-sell |
| Activități (prezent) | `prezente` |
| Activități (ce s-a lucrat/temă) | **nou** — eventual extensie pe [[project-evaluari-module]] |
| Cursuri recomandate | `cursuri` (filtrate pe sezon+locație, vezi [[project-selectoare-curs-sezon-locatie]]) |

---

## 6. Concluzie

TwinkleStar folosește un SaaS generic (EASYSCHOOL/ESS) și totuși acoperă fix nevoile unei zone de membru: **vizibilitate plăți + plată online + transparență activitate + autogestionare date + multi-copil**. Pentru qapp-membri, primii 3 piloni (selector copil, detalii plăți read-only, fișă editabilă) sunt MVP-ul natural, deja susținut de modelul nostru de date. Plata online și jurnalul de lecție sunt următoarea fază, fiecare cu decizii de proces/cost de luat cu user-ul.
