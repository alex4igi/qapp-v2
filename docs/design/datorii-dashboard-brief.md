# Design brief — Dashboard Datorii (`/datorii`)

> Fișier de intrare pentru **Claude Design**. Descrie layout-ul, componentele și stările paginii noi de datorii din qapp v2 (CRM-ul staff Quasar Dance). Pagina rulează în shell-ul existent „Quasar OS": rail întunecat pe stânga, top bar cu selector de locație 📍, conținut pe fundal deschis.

## Branding & sistem vizual

- **Culori brand**: galben `#FFD600` (accent principal) + negru `#000000`. Fundal conținut deschis; cardurile: `rounded-2xl`, bordură subtilă, umbră mică.
- **Fonturi**: Poppins (titluri) + Inter (text) — sistemul existent din redesign-ul Quasar OS.
- **Culori semantice** (existente în app): verde `#10b981` (încasat / OK), roșu `#ef4444` (restant / critic), amber (avertisment), gri (neutru/prescris).
- **Limba UI: română.** Sume în RON, format `1.234 RON`.
- Grupul de meniu „Încasări" are accentul `#2fbf71` — pagina trăiește acolo.

## Cine o folosește

- **Front desk / manager**: văd locația lor (front_desk cu locație fixă e blocat pe ea). Scop: cine trebuie sunat azi, ce promisiuni au expirat, cum stăm față de țintă.
- **Admin / owner**: pot comuta 📍 pe „Toate locațiile" → apare secțiunea comparativă per locație. Scop: sănătatea recuperării per locație, trend.

## Conceptul-cheie: semaforul

**Rata restanțe %** = rest recuperabil / (încasat + rest recuperabil), pe definiția canonică (fără prescrise >2 ani, fără rezilieri, fără luni facturate în viitor, include datorii one-off).
Praguri (configurabile, din setările scorecard): **verde ≤5% · galben 5–7% · roșu >7%**. Semaforul apare: (1) pe KPI-ul de rată, (2) ca bulină per locație în tabelul comparativ.

## Layout — secțiuni de sus în jos

### 1. Header pagină
- Titlu „**Datorii**", subtitlu „Recuperare și evoluție restanțe — {Locație / toate locațiile}".
- Dreapta: buton secundar „⚙ Praguri" (doar admin/owner).

### 2. Rând KPI (5 carduri)
1. **Rest recuperabil** — suma mare, ton roșu. Ex: „18.450 RON".
2. **din care one-off** — bilete/taxe/merch. Ex: „1.120 RON".
3. **Datornici** — număr clienți. Ex: „64".
4. **Prescrise** — gri, hint „nu intră în total". Ex: „9.300 RON".
5. **Rata restanțe** — procent mare + fundal/ton după semafor (verde/galben/roșu), hint „țintă ≤5% · atenție ≤7%". Ex: „6,2%" pe galben.
- Sub rând, o linie mică gri: „net: fără prescrise, rezilieri și luni viitoare; include datorii one-off".

### 3. Grid 2 coloane: Donut colectare + Aging
- **Stânga — donut „Grad de încasare"**: 2 felii — Încasat (verde) vs Restant (roșu); procent mare în centru („92%"), sub el „din tot ce e facturabil". Legendă cu sume.
- **Dreapta — bar chart „Vechimea restanțelor"**: bucket-uri Nescadent / 0-30 / 31-60 / 61-90 / 90+ zile, culori verde→roșu, etichete cu suma pe fiecare bară + nr. clienți.

### 4. Evoluția soldului (full width)
- **Area chart stivuit, 12 luni**: sold abonamente (roșu deschis) + sold one-off (amber) stivuite; linie neagră „total". Axa Y în RON. Subtitlu: „sold restant la finalul fiecărei luni (balanță facturat − încasat)". Mesajul vizual: scade sau crește datoria?

### 5. Recuperare activă (full width, card)
- KPI-uri mici pe un rând: **Suma recuperată luna asta** (verde), **Contacte de recuperare**, **Clienți contactați**; selector de lună în colț; hint „plăți în max {N} zile după apel"; link „→ detalii per operator (Scorecard)".

### 6. Comparativ locații (DOAR pe „Toate locațiile")
- Tabel: Locație · Rest recuperabil · One-off · Prescris · Datornici · **Rata % + bulină semafor**. Sortat descrescător după rest. Rândul cu roșu iese vizual în evidență.

### 7. Promisiuni scadente (card, poate fi gol)
- Listă scurtă: Client (link) · Suma promisă · Data promisă · zile întârziere; promisiunile **încălcate pe roșu**, cele din următoarele 3 zile pe amber; buton 📞 pe rând.
- Empty state prietenos: „Nicio promisiune scadentă 🎉".

### 8. Worklist datornici (secțiunea mare de acțiune)
- Filtre pe un rând: **Sezon** (preset sezonul activ) · **„Are rată din luna"** (month picker) · linia „**64 datornici de sunat · rest total 18.450 RON**".
- **Top datornici** — strip orizontal de 5 mini-carduri deasupra tabelului: nume + suma (roșu bold) + zile întârziere.
- **Tabel** (sortabil): Client (link) · Telefon · **Rest** · Rate · **Întârziere** (>50z roșu, >14z amber) · Ultima prezență · Ultim apel (dată + rezultat) · **Promisiune** (dată + sumă; încălcată = roșu „încălcată") · Acțiuni: **📞 Loghează apel** · **Plată nouă** · **SMS**.
- Rândurile cu promisiune încălcată au fundal roșu foarte pal.

### Modal „Loghează apel" (extins)
- Câmpurile existente (rezultat apel, notițe, sumă promisă) + **NOU: „Promisiune de plată până la" (date picker, opțional)**.

## Stări de randat în mockup

1. **Front desk, o locație, semafor galben** — starea de bază (toate secțiunile fără comparativ).
2. **Owner, „Toate locațiile"** — cu secțiunea comparativă (3 locații: una verde, una galbenă, una roșie).
3. De arătat și empty state la Promisiuni.

## Date de exemplu realiste

Locații: „Ștefan cel Mare", „Nicolina", „Quasar for Kids". Nume clienți românești (ex. „Popescu Maria", „Ionescu Andrei"). Sume: rest total per locație 5.000–20.000 RON; datornici 20–70; rate 1–4; întârzieri 3–90 zile.
