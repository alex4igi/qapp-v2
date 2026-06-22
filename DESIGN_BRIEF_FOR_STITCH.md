# Qapp v2 — Design Brief for Google Stitch

> **Scop:** Acest document descrie complet interfața aplicației **Qapp v2** ca să poată fi reconstruită / redesenată în Google Stitch **fără screenshot-uri**. Descrie sistemul de design (culori, tipografie, componente), structura de navigație și **fiecare ecran** ca layout + componente + date afișate.
>
> **Cum se folosește în Stitch:** Citește întâi secțiunile 1–3 (context, design system, shell de navigație) ca să stabilești limbajul vizual. Apoi fiecare ecran din secțiunea 4+ este un prompt de sine stătător — descrie layout-ul, componentele și datele unei pagini. Etichetele de UI sunt în **română** (păstrate verbatim) pentru că aplicația este în română; restul descrierii e în engleză.

---

## 1. Context produs

**Qapp v2** este un sistem intern complet de management pentru o școală de dans (**Quasar Dance**, Iași). Folosit de ~4 persoane (recepție + manageri) plus instructori (teacheri). Acoperă: clienți, familii, cursuri, înrolări, prezențe, încasări, restanțe, vouchere, leads (pipeline de conversie), SMS, evenimente, inventar, evaluări, salarii teacheri, pontaj staff, rapoarte financiare și statistici.

- **Densitate de informație: mare.** Este un tool intern de tip „business app / admin dashboard”, nu un site de marketing. Prioritate pe claritate, tabele dense, acțiuni rapide, nu pe spațiu alb generos.
- **Roluri** (afectează ce vede fiecare): `owner`, `admin`, `manager`, `front_desk` (recepție), `teacher` (instructor). Teacherii văd un subset drastic redus (doar grupele lor + evaluări).
- **Limba UI:** română. Codul e engleză, dar tot ce vede utilizatorul e română.

### Branding
- **Galben Quasar:** `#FFD600` (culoarea de brand principală — accente, butoane primare, avataruri, stări active)
- **Galben închis (hover):** `#E6C000`
- **Negru:** `#000000` (text principal, logo background)
- **Gri text:** `#6B6B6B`
- **Gri deschis (fundal/borduri):** `#F3F3F3`
- **Fundal aplicație:** gri foarte deschis (`#F3F3F3`)
- **Font:** system-ui / Segoe UI / Roboto, sans-serif.
- **Logo:** imagine PNG „Q” galben-negru, pe un dreptunghi negru cu colțuri rotunjite, în stânga sus.

---

## 2. Design system (vocabular de componente)

Stitch ar trebui să trateze aceste elemente ca un set consistent reutilizat pe toate ecranele.

### Culori semantice
| Rol | Culoare | Folosire |
|-----|---------|----------|
| Brand / primar | Galben `#FFD600` | butoane primare, highlight, avatar, tab activ, ring în jurul cardurilor |
| Succes | Verde (`green-600/700`, `emerald-700`) | plătit, prezent, profit pozitiv, status „Convertit” |
| Pericol / restanță | Roșu (`red-600`) | restanțe, absent, erori, sume neachitate, butoane danger |
| Avertizare | Amber/Orange (`amber-500/600`) | programat, atenție, status intermediar, banner „lucrezi pe altă zi” |
| Info | Albastru (`blue-600/700`) | linkuri, status „Contactat”, badge „Lead” |
| Neutru | Gri (`#6B6B6B`, `#F3F3F3`) | text secundar, borduri, fundaluri carduri, stări goale |

### Primitive UI
- **Button** — 4 variante:
  - `primary`: fundal galben, text negru, hover galben-închis. Rounded-md, font-semibold, px-3.5 py-2.
  - `secondary`: fundal alb, bordură gri deschis, text negru, hover gri deschis.
  - `danger`: fundal roșu, text alb.
  - `ghost`: transparent, text gri, hover gri deschis.
- **PageHeader** — în capul fiecărei pagini: titlu mare bold negru (text-2xl) la stânga, subtitlu gri dedesubt (opțional), grup de butoane de acțiune la dreapta.
- **DataTable** — tabel alb cu colțuri rotunjite și bordură gri deschis. Header pe fundal gri deschis (`bg-gray-light/60`), text bold. Rânduri cu bordură subțire jos, hover gri deschis dacă sunt clickabile, cursor pointer. Coloane sortabile au săgeți (`▲`/`▼`/`⇅`) lângă header. Stare goală: text gri centrat pe un rând. Sumele sunt aliniate la dreapta.
- **Modal** — overlay negru semi-transparent (`black/40`), card alb centrat cu colțuri rotunjite (rounded-xl), shadow-xl, max-height 90vh, scroll intern. Header: titlu bold (text-lg) la stânga + buton „✕” (ghost) la dreapta, bordură jos. Conținut cu padding p-5. Footer (opțional): butoane aliniate la dreapta cu bordură sus — de regulă „Anulează” (secondary) + acțiune (primary/danger). Dimensiuni: md (max-w-lg), lg (max-w-2xl), xl (max-w-4xl).
- **Tabs** — rând de butoane cu bordură de jos. Tab activ: bordură-jos galbenă (2px) + text negru. Inactiv: text gri, hover negru.
- **Field** — wrapper label + input. Label mic deasupra inputului.
- **TextInput / Select / TextArea** — inputuri albe cu bordură gri deschis, colțuri rotunjite (rounded-md), focus → bordură galbenă.
- **Combobox** — input căutabil cu dropdown filtrabil (autocomplete). Folosit pentru selectarea clientului/familiei/cursului din liste mari. Are buton „✕” pentru clear, săgeată „▾”, și un dropdown cu rezultate (rând principal + rând secundar gri mai mic). Highlight galben deschis pe item-ul navigat.
- **Spinner** — indicator de încărcare centrat.
- **Badge / pill** — etichete mici rotunjite colorate (text [10px]–[11px]), folosite masiv pentru status, sursă, interes, grupă de vârstă etc.

---

## 3. Shell de navigație (layout global)

Toate paginile autentificate trăiesc într-un layout comun, full-screen, pe coloane:

```
┌──────────────────────────────────────────────────────────────────────┐
│ HEADER (bară galben-translucid, bordură galben-închis jos)             │
│ [Logo Q]  [ TopNav: taburi de secțiune ]   [📍Locație|📅Dată] 📚 🔔 (AB)│
├──────────────────────────────────────────────────────────────────────┤
│ (BANNER galben de avertizare — apare DOAR dacă lucrezi pe altă zi)     │
├────────────┬─────────────────────────────────────────────────────────┤
│ SIDEBAR    │                                                          │
│ (w-40 alb) │   MAIN CONTENT (scroll, padding p-6)                     │
│ Quick      │   <Outlet — conținutul paginii curente>                 │
│ Actions    │                                                          │
└────────────┴─────────────────────────────────────────────────────────┘
```

### Header (sus, full-width)
- Bară orizontală pe **fundal galben translucid** (`yellow/30`), bordură galben-închis jos, padding px-6 py-3, înălțime ~modestă.
- **Stânga:** logo „Q” pe dreptunghi negru rotunjit (link spre Dashboard).
- **Centru:** `TopNav` — taburi de secțiune (vezi mai jos).
- **Dreapta** (grup de controale, gap mic):
  1. **Pill context de lucru** — card alb cu bordură, conține: `📍` + selector locație (dropdown „Toate locațiile” / locații; sau text fix dacă rolul are locație blocată), separator vertical, `📅` + input dată (ziua de lucru).
  2. `📚` — buton pătrat (icon) spre ghiduri & manual (deschide /prezentari într-un tab nou).
  3. `🔔` — buton pătrat notificări, cu **badge roșu rotund** în colț cu numărul de necitite (afișează „9+” dacă >9).
  4. **Avatar cont** — cerc negru cu inițialele utilizatorului în galben, ring galben. Click → meniu cont.

### TopNav (taburi de secțiune, centru header)
Patru „secțiuni” afișate ca **taburi cu colțuri rotunjite sus** (font-semibold, text negru, fundal alb-translucid; activ = alb + shadow). La **hover** se deschide un **dropdown** sub tab cu link-urile din secțiune (item activ = fundal galben). Secțiunile și itemii:

- **Clienți:** Clienți · Familii · Leads · Recuperare · Plăți · Prezențe · Evaluări · Notificări SMS · Opt-out
- **Statistici:** Overview · Situație zilnică · Financiar · Statistici · Scorecard CC
- **Studio:** Cursuri · Teacheri · Feedback · Vouchere · Inventar · Evenimente · Concursuri · Campanii · Reînscrieri · Ofertă publică · Setări
- **Personal:** Salariul meu · Anunțuri · Feedback aplicație · Audit log · Pontaj staff · Organizație

> Vizibilitatea per rol variază (teacherii văd doar un link plat „Evaluări” în loc de taburi). Pentru redesign, presupune varianta completă (admin/owner).

### Sidebar stânga (Quick Actions)
- Coloană îngustă albă (w-40), bordură dreapta. Conține 4 butoane „acțiune rapidă” stivuite vertical, fiecare cu un icon rotund alb + etichetă, pe fundal galben-translucid:
  - `$` **Plată nouă**
  - `🎓` **Înrolare nouă**
  - `👤` **Lead nou**
  - `＋` **Client nou**
- Fiecare deschide un modal. (Pentru teacher, sidebar-ul e gol/ascuns.)

### Banner „zi de lucru” (condițional)
- Dacă utilizatorul a schimbat data de lucru pe altceva decât azi: bară amber sub header, centrată: `⚠️ Atenție: lucrezi pe ziua {dată}, nu pe ziua de azi.` + buton „Revino la azi ✕”.

### Meniu cont (dropdown din avatar)
Card alb dropdown la dreapta: email + badge rol (negru cu text galben). Itemi: `💬 Trimite feedback`, `📢 Anunț nou` (dacă permis), separator, `🏁 Încheie tura` (doar recepție), `↪ Ieșire`.

---

## 4. Ecranul cheie — DASHBOARD (cu grupe & rostere)

> **Acesta este ecranul cel mai important de redesenat corect.** Are două niveluri: (A) Dashboard-ul principal cu „cercuri” de grupe + carduri de lucru; (B) Dashboard-ul unei grupe = rosterul cu carduri de cursanți pentru marcat prezența.

### 4A. Dashboard principal (`/`)

**Scop:** Privirea de start a recepției — bani azi, ce e de făcut azi, și grupele programate azi ca „cercuri” clickabile.

**Layout (de sus în jos):**

1. **PageHeader:** titlu „Dashboard”. La dreapta (dacă există >1 sală): un dropdown „Toate sălile” pentru filtrare.

2. **Bandă de 3 KPI-uri** (grid 3 coloane, fiecare un card mic):
   - Carduri pe **fundal violet** (`violet-700`), text alb, centrate, colțuri rotunjite.
   - `Încasări azi: {sumă RON}` · `Total restanțe: {sumă RON}` · `Programări azi: {număr}`.

3. **Card „⚡ De lucrat azi (lead-uri)”** — card alb cu bordură:
   - Header: titlu bold `⚡ De lucrat azi (lead-uri) — {total}` la stânga + link `Deschide în Leads →` (galben închis) la dreapta.
   - Conținut: grilă pe 2–3 coloane cu rânduri „etichetă + număr colorat”:
     - `⚑ Marcate pentru revenire` (roșu), `📅 Programați azi la demo` (albastru), `📞 Callback scadent` (orange), `🕐 Noi, necontactate >24h` (gri), `⏳ Fără follow-up >7 zile` (amber), `💤 Inactive >30 zile` (gri).
   - Dacă nimic: `Nimic urgent în lead-uri azi. 🎉`.

4. **Card „📞 Datornici de sunat”** (apare DOAR dacă există datornici) — card alb cu **bordură roșie**:
   - Header pe fundal roșu deschis: `📞 Datornici de sunat ({n})` + link `Vezi toți →`.
   - Listă (max 8 rânduri), fiecare: nume client (link) · `{n} rate · {n}z` (gri mic) · sumă restanță (roșu bold, aliniat dreapta) · buton `📞` (loghează apel).

5. **Grila de grupe „cercuri”** — titlu implicit, apoi un **grid de carduri circulare** (grid 2 col mobil → 5 col desktop). Fiecare card = o grupă programată azi:
   - **Cerc mare** (h-28 w-28) cu **bordură groasă colorată** (8px) și un **număr mare în centru** = câți cursanți prezenți.
     - Culoarea inelului: **roșu** dacă 0 prezenți; **orange** dacă <50% din înscriși prezenți; **verde** dacă ≥50%.
   - Sub cerc: nume grupă (bold), apoi linie gri mică `{oră} · {sală} · {teacher}`, apoi `{prezenți} / {înscriși} înscriși`.
   - Tot cardul e clickabil → deschide dashboard-ul grupei (4B).
   - Dacă nicio grupă azi: card gri centrat `Niciun curs programat în ziua selectată.`

6. **Grafic „Încasări vs Restanțe (cursurile zilei)”** — titlu mic bold, apoi un bar chart (recharts) cu încasări vs restanțe per curs din ziua respectivă.

> **Varianta teacher:** titlu „Grupele mele azi”, subtitlu „Click pe o grupă pentru a marca prezența cursanților”. Fără KPI-uri, fără carduri de lucru, fără grafic — doar grila de cercuri cu grupele lui.

### 4B. Dashboard grupă / Roster (`/grupa/:cursId`)

**Scop:** Lista de cursanți a unei grupe la o anumită zi, sub formă de **carduri cu poză**, pentru marcat prezența cu un singur click. Acesta e „rosterul cu clienți”.

**Layout:**

1. **PageHeader:** titlu = numele cursului; subtitlu = `{oră} · {teacher} · {sală}`; la dreapta buton „← Înapoi”.

2. **Bară de contoare** — card alb cu bordură, rând orizontal cu 4 contoare (etichetă mică uppercase gri + număr mare bold):
   - `PREZENȚI` · `ABSENȚI` · `INACTIVI` · `PROGRAMAȚI`.

3. **Grila de carduri cursant** (grid 2 col mobil → 6 col desktop). Fiecare card de cursant:
   - Card cu colțuri rotunjite, bordură, **fundal colorat după status:**
     - `prezent` → verde deschis (`green-200`)
     - `absent` → roșu deschis (`red-200`)
     - `programat` → amber foarte deschis (`amber-50`) — *aceștia sunt leads programați azi*
     - `inactiv` → gri deschis
   - **Poză rotunjită** (h-20 w-20) sus, centrată — pe fond alb; dacă nu există poză, un emoji `👤` mare gri. **Click pe poză = comută Prezent ↔ Absent** (acțiunea principală). Pentru cursanți inactivi, click pe poză = „Reactivează” / „Înrolare nouă”.
   - **Badge „Lead”** (colț dreapta-sus, albastru) dacă rândul e un lead programat (nu un cursant real).
   - **Nume** centrat sub poză (text colorat după status).
   - **Rând de butoane mici rotunde** jos (h-7 w-7 fiecare):
     - `🎂` (galben, dacă e ziua cursantului azi — tooltip „La mulți ani!”)
     - `$` (roșu, dacă are restanță — tooltip „Restanță: {sumă}”; deschide modal de plată)
     - `👤` (alb — spre profilul cursantului sau spre pipeline-ul de leads)
     - icon **WhatsApp** verde (dacă are telefon valid — scrie părintelui)
   - Dacă rosterul e gol: `Niciun cursant sau lead în roster.`
   - **Important:** ordinea cardurilor rămâne stabilă la toggle prezent/absent (nu se re-sortează grila la fiecare click).

4. **Modale declanșate:** plată nouă (din `$`), înrolare nouă (la reactivare facultativ).

---

## 5. Module „Clienți” (listă + profil)

### 5.1 Clienți — listă (`/clienti`)
- **Header:** „Clienți” · subtitlu „{total} clienți” · buton „+ Client nou”.
- **Filtre:** câmp căutare („Caută după nume, telefon, email…”) + dropdown status („Toate statusurile” / Activ / Inactiv / EXclient).
- **Tabel:** Nume · Telefon · Email · Status · (buton „📞 Reactivare” doar pe rânduri Inactiv/EXclient). Rând clickabil → profil.
- **Paginare** jos: „Pagina X din Y” + „← Anterior” / „Următor →”.
- **Modal „Client nou”/„Editează client”** (grid 2 col): Nume, Prenume, Email, Telefon, Telefon 2, Data nașterii, Sex (M/F), Status, Mărime tricou (XS–XXL), Familie (combobox + „+ Familie nouă”), Unitatea de învățământ, Link contract.

### 5.2 Client — profil (`/clienti/:id`)
- **Header:** nume complet + status; butoane „← Înapoi”, WhatsApp (verde, dacă telefon valid), „Editează”.
- **Layout 2 coloane:** sidebar stânga (w-64) + zonă tab-uri dreapta.
- **Sidebar (card alb):** avatar cerc galben cu inițiale (128px), nume bold centrat, listă: Vârsta, Familia, „În sezonul” (dropdown sezon), Cursuri (listă), buton „+ Înrolează” (full-width).
- **Tab-uri:** „Detalii înrolări” · „Detalii prezențe” · „Detalii personale” · „Documente”.
  - **Detalii înrolări:** grupate pe curs (card per curs cu buton „Reziliază”); fiecare înrolare = lună · tip (Recurent/Facultativ) · status plată (verde „✓ Achitat (X RON)” sau roșu „(X RON rest)”) + butoane ghost `💰 Ajustează` / `📦 Mută` / `🩺 Motivează` (după rol).
  - **Detalii prezențe:** tabel Nume curs · Data · Status (● Prezent verde / ● Absent roșu / ● Motivat amber).
  - **Detalii personale:** secțiuni-carduri Bio / Contact / Altele + secțiune Opt-out marketing (checkbox + motiv) + secțiune cont portal.
  - **Documente:** listă documente (icon tip + titlu + badge expirare colorat + link „Deschide ↗” + 🗑) și formular de adăugare (Tip, Titlu, Link Google Drive, Expiră la, Observații).
- Teacherii văd doar „Detalii prezențe” + „Detalii personale” (minimal).

### 5.3 Familii — listă (`/familii`)
- **Header:** „Familii” · „{total} familii” · „+ Familie nouă”.
- **Căutare:** „Caută după nume, reprezentant, telefon…”.
- **Tabel:** Familie · Reprezentant · Telefon · Email. Rând → profil familie.
- **Modal „Familie nouă”:** Nume familie, Nume/Prenume reprezentant, Email, Telefon, Telefon 2, Metodă plată, Metodă comunicare, Observații, checkbox „Dorește să apară în poze”.

### 5.4 Familie — profil (`/familii/:id`)
- **Header:** „Familia {nume}” + „← Înapoi” + „Editează”.
- **Sidebar:** avatar galben cu inițiale familie, „Reprezentanți” (linkuri), „Balanța” (rest/total RON), „În sezonul” (dropdown), „Membri (n)” (linkuri spre clienți), buton „+ Adaugă membru”.
- **Tab-uri:** „Detalii înrolări” (tabel cu înrolările tuturor membrilor: Nume membru · Nume curs · Data începerii · Tipul înrolării · Status plată) · „Detalii personale” (Bio/Contact/Altele + Opt-out + cont portal).
- **Modal „Adaugă membri”:** căutare + checklist de clienți (cu badge amber „deja în {familie}” pentru cei din altă familie) + buton „Asociază (n)”.

---

## 6. Module „Clienți” — operațional

### 6.1 Plăți (`/plati`)
- **Header:** „Plăți” · „{total} înrolări” · „+ Înrolare nouă”.
- **Căutare:** „Caută după client sau curs…”.
- **Tabel:** Client (link) · Curs · Început · Tip plată · Total (RON, dreapta) · Plătit (RON, dreapta) · Rest (roșu bold dacă >0, dreapta) · buton „+ Plată”.
- **Paginare** jos.

#### Modal „Plată nouă” (xl, min-height mare)
- **3 tab-uri:** „Abonament” · „Open” · „Incasare manuală”.
- **Abonament = formular Înrolare** (vezi mai jos).
- **Open:** Client (combobox) · Curs (doar facultative) · Dată · indicator „Locuri sesiune: X/Y”.
- **Incasare manuală:** Client · Curs · Sumă (RON) · Dată · Metodă plată · Observații.

#### Modal „Înrolare nouă” (EnrollmentForm, lg)
- Client (combobox „— caută client după nume sau telefon —”), alerte eligibilitate, Curs (combobox grupat: Grupe → Trupe → Facultative), grid „Tip plată” (Per lună / Per an / Per ședință) + „Data semnării/începerii”, Voucher (dropdown opțional „{cod} — {valoare}”), **box rezumat preț** (Preț base / Voucher / Total), **preview plată lunară** (lună cu zile + sumă, pentru recurent), checkbox „Forțează re-înrolare” (admin), avertismente capacitate (galben „⚠️ Curs plin (X/Y)”).

#### Modal „Adaugă plată” (IncasareForm)
- Box rezumat sus (Client — Curs, Total / Plătit / Rest). Câmpuri: Sumă încasată (RON, default = rest) + Dată · Metodă plată · Observații. Listă „Plăți anterioare” jos (dată · metodă — sumă).

### 6.2 Prezențe (`/prezente`)
- **Header:** „Prezențe” · „Marchează prezența pe ședință”.
- **Filtre:** Curs (combobox „— alege curs —”) + Data ședinței (input dată).
- **Tabel custom:** Client · Status. Coloana status = **toggle cu 3 butoane**: `Prezent` (verde activ) / `Absent` (roșu activ) / `Motivat` (amber activ); inactive = alb cu bordură.
- Stări: „Alege un curs pentru a marca prezențele.” / „Niciun client înscris activ la acest curs.”

### 6.3 Recuperare restanțe (`/recuperare`)
- **Header:** „Recuperare restanțe” · „Datornici activi cu 2+ rate neachitate — de sunat”.
- **Filtre:** Locație + Sezon (auto = sezon activ).
- **Rezumat:** „{n} datornici de sunat · rest total {sumă}” (roșu).
- **Tabel:** Client (link) · Telefon · Rest (roșu bold) · Rate (nr) · Întârziere (`{n}z`, color-coded: roșu >50z, amber >14z) · Ultima prezență · Ultim apel (`{dată} · {rezultat}` sau „niciodată”) · buton „📞 Loghează apel”.
- Gol: „Niciun datornic activ cu 2+ rate neachitate. 🎉”.
- **Modal „Loghează apel recuperare”:** box rest, Canal (📞 Telefon / 💬 SMS / ✉️ Email / 📩 DM — button group), Rezultat („A plătit / promite” verde / „Revine cu plata” amber / „Refuză / nu plătește” roșu — button group), Sumă promisă (opțional), Observații.

### 6.4 Notificări SMS (`/sms`)
- **Header:** „Notificări SMS” · „{total} în coadă” · butoane „Generează SMS-uri”, „+ SMS manual” (manager+), „Trimite cele de trimis” (primary, cu confirmare).
- **Filtru:** status (De trimis / In curs de trimitere / Trimis / Esuat).
- **Tabel:** Telefon · Mesaj (2 rânduri clamp) · Status (text colorat: amber/albastru/verde/roșu) · Planificat · Trimis · buton „Șterge”.
- Gol: „Coada de SMS-uri este goală.”

### 6.5 Opt-out comunicare (`/opt-out`)
- **Header:** „Opt-out comunicare” · „{n}/{total} persoane cu opt-out marketing” · „Export CSV”.
- **Filtre:** căutare + tip (Toate / Clienți / Leads / Familii).
- **Tabel:** Tip (badge) · Nume (link) · Email · Telefon · Motiv · Data · buton „Revert”.
- **Notă GDPR** (box albastru jos): opt-out blochează doar marketing; tranzacționalele continuă.
- Gol: „Nimeni nu a fost marcat cu opt-out. 🎉”.

### 6.6 Evaluări (`/evaluari`)
- **Header:** „Evaluări” · „{total}” · „+ Evaluare nouă”.
- **Filtre:** căutare cursant + profesor (ascuns la teacher) + curs.
- **Tabel:** Cursant · Curs · Profesor · Data · Scor mediu („X.X / 5”).

---

## 7. LEADS — pipeline Kanban (`/leads`) — *modul de referință*

**Scop:** Pipeline de conversie a prospecților, ca o **tablă Kanban** cu 9 coloane, drag & drop.

**Layout:**
1. **Header:** „Leads” · „Pipeline conversie lead-uri” · toggle „Pipeline | Rapoarte” · „+ Lead nou”.
2. **Bară de filtre:** căutare („Caută nume, telefon…”) · Sursă (dropdown) · Grupă vârstă · Locație · buton Reset (dacă filtre active).
3. **Panou „⚡ De lucrat azi”** (collapsible, bordură/fundal amber): header cu total + badge-uri colorate per grup; expandat = grupuri (Reminders, Programați azi, Callback scadent, Noi necontactate, Fără follow-up, Inactive) cu rânduri lead.
4. **Tabla Kanban:** 9 coloane orizontale, scroll orizontal, fiecare cu header (label + count badge + „+”).

**Cele 9 coloane** (cu culoarea lor):
| Coloană | Culoare fundal/text |
|---------|--------|
| **Nou** | zinc/gri |
| **Contactat** | albastru deschis |
| **Waiting List** | mov deschis |
| **Programat** | amber deschis |
| **A venit** | emerald deschis |
| **Nu a venit** | roșu deschis |
| **Convertit** | verde (terminal) |
| **Pierdut** | zinc muted (terminal) |
| **Nurture** | roz deschis (are buton export CSV) |

**Card de lead** (lat ~280px): steguleț roșu (dacă flag reminder) + nume (bold) + vârstă + badge „Azi” (verde, dacă creat azi); iconuri dreapta (WhatsApp, 📞, ✏️ editează); nume părinte (`👤`); telefon; rând de badge-uri (Interes colorat, Grupă galben, Sursă indigo, sub-status); locație (`📍`); programare (`🗓 {dată}` amber); motiv pierdut (italic); „Ultima acțiune: {timp relativ}”. **Drag & drop** între coloane declanșează modale specifice (programare, pierdut, etc.). Coloanele terminale nu se mai pot trage.

**Badge-uri Interes (culori):** Street Dance (sky), K-pop (pink), Acrobatică (cyan), Zumba (fuchsia), Nu știu încă (zinc).

**Modale leads** (toate cu structura standard Modal):
- **Lead nou / Editare** (tab-uri „Detalii” + „Istoric”): grid 2 col — Prenume, Nume*, Telefon* (avertisment duplicat), Email, Nume părinte, Data nașterii, Sursă (campanie)*, Locație preferată, Interes, Grupă vârstă, Status, Data programare, Sub-status (dacă Contactat), Motiv pierdut (dacă Pierdut), Observații.
- **Programează ședință gratuită:** Data și ora*, Data nașterii*, avertisment vacanță, Grupă vârstă*, Curs* (filtrat pe grupă/zi/locație).
- **Lead pierdut — motiv:** butoane rapide de motiv (Programul nu coincide, Copilul nu vrea, A găsit altă școală, Prea scump, etc.) + textarea custom.
- **Marchează contactarea:** Sub-status (De revenit / Nu răspunde) + Data și ora + Notă.
- **Adaugă pe lista de așteptare:** Interes + Grupă dorită + Detalii.
- **Finalizare înscriere:** detectează client existent (checkbox „Leagă lead-ul de clientul existent”) sau formular client nou (Prenume, Nume, Telefon, Email, Data nașterii, Sex, Link contract).
- **Loghează contact:** Canal (📞/💬/✉️/📩) + Rezultat (Reușit/Follow-up/Pierdut) + Data callback (dacă follow-up) + Observații.
- **Istoric:** timeline cu iconuri (📋 creat, ➡️ status, ⚑ flag, 📝 notă, ✉️ SMS, ✏️ edit) + timp relativ.

**Rapoarte (toggle „Rapoarte”):** 3 KPI-uri sus (Total lead-uri / Convertiți verde / Rată conversie) + secțiune „Distribuție pe pipeline” (bare orizontale per status) + 4 tabele „Conversie pe sursă/interes/grupă/responsabil” (Total / Convertiți / Pierduți / Rată).

---

## 8. Module „Statistici” (rapoarte & dashboards)

> Convenție: **/financiar = tabele**, **/statistici = grafice (recharts)**.

### 8.1 Overview (`/overview`)
- **Header:** „Overview” + subtitlu (definiția „client activ”).
- **Secțiuni (manager+):** „Clienți activi” (pie pe locație + linie 12 luni), „Trend prezențe” (grupat pe instructor, carduri cu evoluția pe 6 săptămâni, highlight roșu pe cursurile în scădere), „Grad de ocupare cursuri” (listă cu bare colorate 🟢/🟡/🔴 + „{activ}/{capacitate}” + %), „Conversie lead → client” (4 KPI), „Profitabilitate instructori” (tabel marjă, doar admin+).
- **Front_desk:** doar card „Clienți activi”.
- **Teacher:** doar cursurile lui (ocupare + trend prezențe).

### 8.2 Situație zilnică (`/situatie-zilnica`)
- **Header:** „Situație zilnică” + selectoare Ziua (dată) și Locația.
- **Bandă rezumat:** „Total ziua: {sumă} | Cash | Card | Transfer | Revolut”.
- **Tabel „Încasări — {dată}”:** Client · Categorie · Detalii · Locație · Sumă · Metodă · Observații.
- **Card „Reconciliere cash”** (dacă locație selectată): Sistem (Cash), Fond ieri, Numărat, Dif. (color-coded), De depus, Fond mâine, Notițe.

### 8.3 Financiar (`/financiar`) — tab-uri de tabele
**Header:** „Financiar”. Tab-uri (manager+ văd 6, front_desk văd 3):
- **Raport pe zile:** filtre De la/Până la + Tip raport (Toate locațiile/Locație/Sala/Curs/Profesor) + Export CSV. Bandă rezumat (Încasări + split metode + Cheltuieli/Net). Tabel: Data · Încasări · Cash · Card · Transfer · Revolut · (Cheltuieli · Net).
- **Încasări:** filtre (căutare observații, De la, Până la, Locația, Categorie) + Export. Tabel: Data · Client · Categorie · Detalii · Locație · Metodă · Sumă · (Editează, manager+). Paginare 25/pag.
- **Cheltuieli** (manager+): filtre (căutare, date, Categorie, Achitată?) + „+ Cheltuială nouă”. Tabel: Nume · Categorie · Data · Valoare · Achitată (Da verde/Nu roșu) · Descriere.
- **Restanțe:** filtre (căutare, Locația, Cursul) + Export. Tabel: Client (link) · Curs · Locație · Început · Total · Plătit · Rest (badge „prescris” + strikethrough dacă prescris; altfel roșu bold).
- **Evoluție lunară** (manager+): sub-tab-uri Totale / Pe teacher / Pe locație. Tabele lunare cu bară de volum.
- **Reconcilieri cash:** filtre + tabel Data · Locație · Sistem (Cash) · Fond ieri · Numărat · Dif. (verde/amber/roșu) · De depus · Fond mâine · Notițe.

### 8.4 Statistici (`/statistici`) — grafice
**Header:** „Statistici” + selectoare De la luna / Până la luna + „Sezon curent”.
- **„Privire de ansamblu — {lună}”:** 4 KPI carduri (Venit luna curentă, Rată prezență, Ocupare grupe, Retenție) + 3 **donut charts** (Rată prezență galben/gri, Grad ocupare, Retenție membri).
- **„Financiar — interval ales”:** 4 KPI (Încasări, Cheltuieli [manager+], Profit [manager+], Restanțe).
- **Grafice (recharts):**
  - „Balanță locație” — stacked bar (Încasat + Datorie) per lună, filtru locație.
  - „Balanță curs” — stacked bar, filtru curs.
  - „Prezențe pe achitare” — grouped bar (Achitate verde / Neachitate roșu / Achitate din trecut albastru) per lună.
  - „Funnel leads — conversie & retenție” — funnel custom (Leads → Contact → Probă → Prezent → Înscriere → Retenție 90z).
  - „Mix metode de plată” — pie.
  - „Distribuție încasări” pe categorie — pie (Abonament/Bilet/Merch/Taxa).
  - „Distribuție cheltuieli” (manager+) — pie.
- **„Reînscrieri & Sezoane”:** donut reînscrieri + 4 KPI + bar „Încasări pe sezon”.

### 8.5 Scorecard call-center (`/scorecard`)
- **Header:** „Scorecard call-center” · „Activitate per operator…” · „⚙ Praguri” (admin).
- **Filtru:** Luna (input month). **Legendă:** 📉 Sub-standard · 👌 Standard · 🚀 Peste-standard · 🚩 Rafală suspectă · ⚠️ Decalaj.
- **Tab-uri:** Leads / Restanțe / Reactivări. Fiecare = tabel cu Operator (+ flag-uri) și coloane cu **badge-uri colorate** (📉 roșu / 👌 amber / 🚀 emerald):
  - **Leads:** Contacte (verif./total) · Viteză · Persistență · Igienă CRM · Follow-up · Conversie · Show-rate · Scor.
  - **Restanțe:** Contacte · Clienți · Recuperat (verif. ≤7z, verde) · Rest rămas (roșu) · Rată recuperare · Igienă · Scor.
  - **Reactivări:** Contacte · Clienți · Reactivați (verde) · Rată reactivare · Igienă · Scor.

---

## 9. Module „Studio”

### 9.1 Cursuri — listă (`/cursuri`)
- **Header:** „Cursuri” · „{total} cursuri” · „+ Curs nou” (manager+).
- **Filtre:** căutare „Nume curs…” + Sezon (default = activ).
- **Tabel grupat pe locație** (header secțiune uppercase gri „{LOCAȚIE} (n)”): Curs · Teacher · Locație · Sală · Zile · Nivel · Înscriși („12/25” sau „12”). Rând → profil curs.

### 9.2 Curs — profil (`/cursuri/:id`)
- **Header:** nume curs + subtitlu (nivel · grupă · suspendat) + „← Înapoi”, „Editează”, „📦 Arhivează/Dezarhivează”.
- **Sidebar:** avatar galben cu inițiale, „Ocupare” = `{activ}/{capacitate}` mare, color-coded (verde/amber/roșu/gri) + locuri libere.
- **Tab-uri:** „Clienți activi” (tabel # · Nume · Ultima prezență · Preț înrolare · [Reînscriere/Activează!]) · „Absenți” · „Restanțieri” (cu buton Plată) · „Clienți inactivi” · „Sesiuni OPEN” (doar facultativ) · „Detalii curs” (carduri General/Program/Prețuri).

### 9.3 Teacheri — listă (`/teacheri`)
- **Header:** „Teacheri” · „{total} teacheri” · „+ Teacher nou”.
- **Filtre:** căutare + Locație + Sezon.
- **Tabel:** Nume · Telefon · Email · Nivel. Rând → profil.

### 9.4 Teacher — profil (`/teacheri/:id`)
- **Header:** nume + nivel + „← Înapoi” + „📦 Arhivează”.
- **Sidebar:** avatar galben mare (h-44) + nume + nivel.
- **Tab-uri:** „Detalii cursuri” (tabel Curs · Clienți activi · Clienți înscriși · Balanța color-coded) · „Detalii salarii” (rezumat lună + accordion pe luni cu breakdown Grupă/Ședințe-săpt/Numărați/Prag/Sumă + buton confirmare admin) · „Detalii personale” (carduri + secțiune „Cont aplicație” admin) · „Evaluări” (manager+: tabel Perioadă · Scor mediu · Observații + „+ Evaluare nouă”).
- **Modal evaluare teacher:** Luna/An + 6 criterii cu butoane 1–5 (Punctualitate, Pregătire, Energie, Comunicare, Disciplină, Rezultate, Feedback cursanți) + Observații.

### 9.5 Feedback clienți (`/feedback`)
- „Feedback” · „{total}” · „+ Feedback nou”. Căutare. Tabel: Titlu · Tip · Detalii (clamp) · Rezolvat (Da verde/Nu gri).

### 9.6 Vouchere (`/vouchere`)
- „Vouchere” · „{total}” · „+ Voucher nou”. Căutare „cod sau descriere”. Tabel: Cod · Tip · Valoare · Valabilitate (`start → end`) · Utilizări.

### 9.7 Inventar (`/inventar`)
- „Inventar” · „{total}” · „+ Articol nou”. Căutare. Tabel: Articol · Categorie · Stoc (dreapta) · Preț · Portal (🌐 dacă public).

### 9.8 Evenimente (`/evenimente`)
- „Evenimente” · „{total}” · „+ Eveniment nou”. Filtre: căutare + An + butoane „Toate/Viitoare/Trecute”. Tabel: Eveniment · Data · Locație · Status · Portal (🌐).

### 9.9 Concursuri (`/concursuri`)
- „Concursuri” · „{total}” · „+ Concurs nou”. Căutare. Tabel: Concurs · Data · Locuri I / II / III (`X / Y / Z`).

### 9.10 Campanii promovare (`/campanii`)
- „Campanii promovare” · „{total}” · „+ Campanie nouă”. Căutare. Tabel grupat pe canal: Nume · Canal · Sub-canal · Buget · Rezultate vizate · Lead-uri · CAC (cost/lead).

### 9.11 Reînscrieri (`/reinscrieri`)
- „Campania Reînscrieri” + dropdown sezon. **Mod campanie activă:** card KPI (nume + status badge + 5 boxe KPI + progress bar) + tabel cursuri (Curs · Grupă · Eligibili · Taxă · Act · Reînscriși · Rămași · Ocupare toamnă color-coded) → modal per curs cu checkpointuri Taxă/Act/Reînscris. **Mod legacy:** info box „Creează campanie” + tabel cu „Activează” per client.

### 9.12 Ofertă publică portal (`/oferta-publica`)
- „Ofertă publică portal” · „Tarife și produse afișate pe portalul de membri”.
- **Tarife** (editabil): tabel Ordine · Program · Preț · Taxă rezervare · Activ (✓) + „+ Tarif” + modal.
- **Produse publice** (read-only, din Inventar): Ordine · Produs · Preț.
- **Bilete evenimente** (read-only, din Evenimente): Data · Eveniment · Locație · Preț bilet.

### 9.13 Setări (`/setari`)
- „Setări” · subtitlu rol + buton „Organizație →” (owner). Patru secțiuni stivuite:
  - **Locații:** tabel Nume · Adresă · Telefon · Hartă (📍). Modal cu Nume/Adresă/Telefon/Link Google Maps.
  - **Săli:** tabel Sală · Locație · Capacitate. Modal.
  - **Sezoane:** tabel Sezon (badge-uri PLANIFICAT/ACTIV/ARHIVAT + tip) · Început · Final · [Activează]. Butoane „+ Sezon (manual)” / „+ Sezon prin clonare”.
  - **Utilizatori:** tabel Email · Rol · Locație (clickabil) · Creat · Ultima logare · acțiuni (Rol / Parolă / Șterge). Modale create/rol/parolă/locație.

---

## 10. Module „Personal”

### 10.1 Salariul meu (`/salariul-meu`)
- „Salariul meu” · „Snapshot-uri lunare confirmate…”. Carduri expandabile per lună: „{Lună An}” + Total (RON) + status („✓ Plătit” verde / „⏳ În așteptare” amber). Expandat = tabel Grupă · Tip · Unități · Sumă.

### 10.2 Anunțuri (`/anunturi`)
- „Anunțuri” · „Mesaje către echipă…” · „📢 Anunț nou”. Tab-uri „Primite” (indicator ● necitit · Titlu · De la · Data) / „Trimise” (Titlu · Citit „X/total” · Data). Modal compose + modal detaliu.

### 10.3 Feedback aplicație (`/feedback-app`)
- „Feedback aplicație” (admin) / „Feedback-ul meu” (tester) · „+ Trimite feedback”. Filtre căutare + status. Tabel: Tip · Titlu · Autor · Pagina · Status (badge) · Data. Modal triere.

### 10.4 Notificări (`/notificari`)
- „Notificări” + subtitlu count + „↻ Generează digest acum” + „Marchează toate ca citite”. Tab-uri „De făcut” / „Toate” (cu badge count). Carduri notificare (● necitit + titlu + timp + body + acțiuni „Marchează rezolvat” / link-uri). Digest audit = box colorat.

### 10.5 Audit log (`/audit`)
- „Audit log” · „{n} acțiuni · grupate pe săptămână”. Filtre: Acțiune · Rol · Sezon + „Deschide tot”/„Închide tot”. Secțiuni săptămânale collapsible (header „Săpt. X → Y” + badge count) → rânduri: timestamp · badge rol · acțiune · detalii.

### 10.6 Pontaj staff (`/pontaj-staff`)
- „Pontaj staff” · „{n} sesiuni · {n} încheiate · {n} deschise”. Filtre De la/Până la + Export CSV. Tabel: Data · Utilizator (email + rol) · Locație · Start · Sfârșit · Durată („Xh Ym” sau amber „(deschisă)”) · Tip (label colorat).

---

## 11. Pagini speciale

### 11.1 Login (`/login`)
- Ecran centrat, neautentificat (fără shell). Logo Quasar Dance + formular email/parolă + buton de login. Branding galben-negru.

### 11.2 404
- Mesaj simplu „404 — Pagina nu există.” în shell.

---

## 12. Note de stil pentru redesign (rezumat pentru Stitch)

1. **Aplicație internă densă**, nu landing page — multe tabele, multe acțiuni inline, multe badge-uri de status.
2. **Galbenul `#FFD600` pe negru** este identitatea — folosește-l pentru accente/CTA, nu ca fundal mare (obositor). Fundalul general e gri foarte deschis, cardurile sunt albe.
3. **Cod de culori pentru status, consecvent peste tot:** verde = bun/plătit/prezent, roșu = problemă/restanță/absent, amber = atenție/în așteptare, albastru = info, gri = inactiv/neutru.
4. **Pattern-uri repetate:** PageHeader (titlu+subtitlu+acțiuni dreapta) → bară de filtre → DataTable cu paginare; SAU layout 2 coloane (sidebar avatar + tab-uri) pentru paginile de profil.
5. **Cardurile circulare de grupă** (cu inel colorat și număr de prezenți în centru) și **cardurile de cursant cu poză** (cu fundal colorat după status și butoane mici rotunde) sunt elementele vizuale cele mai distinctive — merită atenție specială la redesign.
6. **Modalele** au toate aceeași anatomie: overlay întunecat, card alb rotunjit, titlu + „✕”, conținut, footer „Anulează” + acțiune.
7. **Combobox-urile căutabile** înlocuiesc selectoarele simple oriunde lista e mare (clienți, cursuri, familii).
```
