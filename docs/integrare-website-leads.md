# Integrare formulare website → Qapp (Leads)

Acest document descrie cum trimiteți datele din formularul **„Programează
ședința demo"** (`#inscriere`) către CRM-ul Quasar Dance. Lead-ul apare automat
în coloana **„Nou"** din pipeline-ul recepției.

> **Doar formularul de înscriere/demo trimite lead-uri.** Formularul de pe
> `/contact` rămâne un simplu mesaj pe email — NU îl conectați la acest endpoint.

> Nu trebuie să construiți nimic în backend — există deja un endpoint public
> dedicat. Trebuie doar să faceți un `POST` cu un JSON din formular.

---

## Endpoint

```
POST https://cbftxkwvoboqahzsldcp.supabase.co/functions/v1/intake-website-lead
Content-Type: application/json
```

- **Fără header de Authorization** — endpoint public, CORS `*`, se poate apela
  direct din browser (fetch din JS pe pagină).
- Acceptă doar `POST` (plus `OPTIONS` pentru preflight CORS).

---

## Câmpurile din JSON (payload)

| Câmp | Obligatoriu | Tip / format | Note |
|------|:-----------:|--------------|------|
| `nume` | ✅ **DA** | text (min. 2 caractere) | numele de familie sau numele complet |
| `telefon` | ✅ **DA** | text | mobil RO; vezi validarea de mai jos |
| `prenume` | nu | text | |
| `nume_parinte` | nu | text | pentru înscrieri de copii |
| `email` | nu | text | dacă e valid → trimitem automat un email de confirmare |
| `data_nasterii` | nu | **`YYYY-MM-DD`** | orice alt format e ignorat (nu dă eroare) |
| `interes` | nu | text (vezi valorile acceptate) | acceptă și denumirile din dropdown-ul site-ului |
| `grupa_varsta` | nu | **enum** (vezi lista) | valoare în afara listei → ignorată |
| `locatia` | nu | text (vezi valorile acceptate) | acceptă și denumirile din dropdown-ul site-ului |
| `mesaj` | nu | text liber | ajunge în „observații" pe lead |
| `campanie` | nu | text | sursa lead-ului — vezi mai jos |
| `utm_source` | nu | text | pentru tracking ROI |
| `utm_medium` | nu | text | |
| `utm_campaign` | nu | text | |
| `campaign_id` | nu | text | id-ul campaniei din platforma de ads |
| `gclid` | nu | text | **Google Ads** — vezi mai jos |

### `gclid` (Google Ads)

Când cineva ajunge pe site dintr-o reclamă Google, Google adaugă în URL un
parametru `?gclid=…`. E identificatorul acelui click.

Ca să putem reconcilia lead-urile cu ce raportează Google Ads — și, mai
târziu, să trimitem înapoi în Google conversiile offline (cine s-a înscris
efectiv) — formularul trebuie să-l preia din query string și să-l trimită
în payload:

```js
const gclid = new URLSearchParams(location.search).get('gclid')
```

Recomandare: salvați-l în `sessionStorage` la prima încărcare a paginii —
vizitatorul poate naviga pe site înainte să completeze formularul, iar
parametrul se pierde din URL între timp.

Fără `gclid`, lead-urile Google rămân atribuite doar prin UTM-uri.

### Valori acceptate

**`interes`** — valori canonice: `Street Dance`, `K-pop`, `Acrobatică`, `Zumba`,
`Nu știu încă`. Maparea e tolerantă la diacritice/majuscule și acceptă explicit
denumirile actuale din dropdown-ul site-ului:

| Trimiteți (sau orice variantă a) | Devine în CRM |
|----------------------------------|---------------|
| `Street Dance` | Street Dance |
| `KPOP Dance`, `K-pop`, `kpop` | K-pop |
| `Gimnastică acrobatică`, `Acrobatică` | Acrobatică |
| `Zumba (Adulți)`, `Zumba` | Zumba |
| `Nu știu încă` | Nu știu încă |

**`grupa_varsta`** (exact, case-sensitive): `Tiny`, `Junior`, `Varsity`,
`Teens`, `Students`, `Adults`.

**`locatia`** — tolerantă la diacritice/majuscule:

| Trimiteți | Devine în CRM |
|-----------|---------------|
| `Quasar Centru`, `Ștefan cel Mare`, `Centru` | Ștefan cel Mare |
| `Quasar Nicolina`, `Nicolina` | Nicolina |
| `Quasar for Kids`, `Orice locație` | — (rămâne goală; textul ajunge în observațiile lead-ului) |

> O valoare nemapabilă la `interes`/`locatia` nu blochează lead-ul: câmpul
> rămâne gol în CRM, iar textul trimis ajunge în observații, ca recepția să-l vadă.

### `campanie`

Setați acest câmp ca să știm de unde a venit lead-ul (apare ca sursă în rapoarte):

- formularul `#inscriere` → `"Website – Înscriere"`

Dacă lipsește, sursa devine implicit `"Website quasardance.ro"`.

---

## Validare (ce acceptă / respinge endpoint-ul)

| Regulă | Comportament |
|--------|--------------|
| `nume` lipsă sau < 2 caractere | **respins** `400` |
| `telefon` lipsă | **respins** `400` |
| `telefon` nu e mobil RO valid | **respins** `400` (`field: "telefon"`) |
| `email` completat dar invalid | **NU** se respinge — se ignoră (lead-ul se creează fără email), iar răspunsul conține `warnings: ["email_invalid_ignorat"]` |
| `interes` / `locatia` nemapabile | câmp gol + textul trimis ajunge în observații, lead creat |
| `grupa_varsta` în afara enum-ului | ignorat (câmp gol), lead creat |
| `data_nasterii` în alt format | ignorat, lead creat |

**Telefon valid** = număr de mobil românesc. Sunt acceptate toate formatele
uzuale, se normalizează automat la `+40…`:

```
0741966387   ✅
+40741966387 ✅
0040741966387 ✅
741966387    ✅
(0741) 966 387 ✅   (spațiile/parantezele sunt ignorate)
```

Reguli: după eliminarea prefixului trebuie să rămână **9 cifre care încep cu 7**.
Fix și telefon (ex. `0232…`) sau numere incomplete → **respinse**.
**Recomandare:** validați telefonul și client-side, ca vizitatorul să primească
eroarea imediat în formular.

---

## Răspuns

**Succes** (status `200`):

```json
{ "created": true, "leadId": "uuid-ul-lead-ului" }
```

Cu email invalid ignorat:

```json
{ "created": true, "leadId": "...", "warnings": ["email_invalid_ignorat"] }
```

**Telefon deja existent** (deduplicare — nu se creează duplicat):

```json
{ "created": false, "leadId": "uuid-existent", "reason": "telefon existent" }
```

> Tratați și `created:false` ca **succes** pentru vizitator (afișați „Mulțumim,
> te contactăm"). Înseamnă doar că persoana e deja în sistem.

**Eroare de validare** (status `400`):

```json
{ "error": "Număr de telefon invalid. Folosește un număr de mobil românesc (ex: 07XXXXXXXX).", "field": "telefon" }
```

---

## Exemplu de cod (copy-paste)

```js
async function trimiteLead(formData) {
  const res = await fetch(
    "https://cbftxkwvoboqahzsldcp.supabase.co/functions/v1/intake-website-lead",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nume: formData.nume,
        prenume: formData.prenume || null,
        telefon: formData.telefon,
        email: formData.email || null,
        interes: formData.interes || null,       // ex: "KPOP Dance" — se mapează automat
        grupa_varsta: formData.grupa || null,     // ex: "Teens"
        locatia: formData.locatia || null,        // ex: "Quasar Centru" — se mapează automat
        mesaj: formData.mesaj || null,
        campanie: "Website – Înscriere",
        // opțional, dacă aveți UTM-urile din URL:
        utm_source: formData.utm_source || null,
        utm_medium: formData.utm_medium || null,
        utm_campaign: formData.utm_campaign || null,
      }),
    }
  );

  const data = await res.json();
  if (res.ok) {
    // data.created === true (lead nou) sau false (deja existent) — ambele OK
    return { ok: true };
  } else {
    // afișați data.error (eventual lângă câmpul data.field)
    return { ok: false, error: data.error, field: data.field };
  }
}
```

### Echivalent `curl` (pentru test rapid)

```bash
curl -X POST \
  "https://cbftxkwvoboqahzsldcp.supabase.co/functions/v1/intake-website-lead" \
  -H "Content-Type: application/json" \
  -d '{"nume":"Test","telefon":"0740123456","interes":"KPOP Dance","locatia":"Quasar Centru","campanie":"Website – Înscriere"}'
```

---

## Note finale

- **Deduplicare pe telefon:** trimiterea de două ori cu același număr nu creează
  un al doilea lead.
- **Anti-spam:** endpoint-ul e public. Recomandăm un honeypot field sau un
  rate-limit simplu pe formular (pe partea voastră) dacă apare spam.
- **Câmpuri minime acceptabile:** doar `nume` + `telefon` valid. Restul ajută
  recepția, dar nu sunt obligatorii.
