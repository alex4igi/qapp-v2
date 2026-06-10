# Integrare Meta Lead Ads → Qapp (Leads)

Lead-urile din campaniile Facebook/Instagram **Lead Ads** intră automat în
coloana „Nou" din pipeline. Codul (webhook-ul `intake-meta-lead`) e deja
deployat — mai rămâne configurarea pe partea Meta, descrisă mai jos.

```
Callback URL: https://cbftxkwvoboqahzsldcp.supabase.co/functions/v1/intake-meta-lead
```

## Ce face webhook-ul

- La fiecare lead nou dintr-un formular Lead Ads, Meta notifică webhook-ul;
  acesta ia datele lead-ului din Graph API și creează lead-ul în CRM.
- **Sursă**: campania „Meta Ads" (+ numele campaniei/ad-ului în observații și
  `utm_campaign`).
- **Câmpuri standard** preluate: nume, prenume, telefon, email.
- **Întrebări custom** din formular: dacă numele întrebării conține
  „interes"/„curs", „locație" sau „grupă"/„vârstă", răspunsul se mapează automat
  pe câmpurile CRM (cu aceleași aliasuri ca site-ul — ex. „KPOP Dance" → K-pop).
  Orice răspuns nemapabil ajunge în observații, nu se pierde.
- **Deduplicare**: pe `leadgen_id` (Meta retrimite notificările la timeout) și
  pe telefon (ca tot intake-ul).

## Pași de configurare (o singură dată)

### 1. Aplicație Meta
- [developers.facebook.com](https://developers.facebook.com) → **Create App** →
  tip **Business**, legată de Business Manager-ul Quasar Dance.

### 2. Token de acces
Recomandat: **System User token** din Business Manager (nu expiră):
- Business Settings → Users → System Users → Add (rol Admin nu e necesar, Employee ajunge)
- Assign Assets → pagina de Facebook Quasar Dance (acces Full control nu e necesar; „Manage" ajunge)
- Generate Token → selectează aplicația de la pasul 1 + permisiunile:
  `leads_retrieval`, `pages_show_list`, `pages_manage_metadata`, `pages_read_engagement`
- Pentru utilizare doar pe paginile proprii prin System User **nu e nevoie de App Review**.

### 3. Secrets în Supabase
```bash
npx supabase secrets set \
  META_VERIFY_TOKEN=<un string aleator ales de noi, ex. generat cu `openssl rand -hex 16`> \
  META_PAGE_ACCESS_TOKEN=<token-ul de la pasul 2>
```

### 4. Webhook în Meta App
- App Dashboard → **Webhooks** → New Subscription → **Page**
- Callback URL: cea de mai sus; Verify Token: exact valoarea `META_VERIFY_TOKEN`
- Subscribe la field-ul **`leadgen`**
- Meta face un GET de verificare → funcția răspunde automat cu challenge-ul.

### 5. Abonarea paginii la aplicație
Din Graph API Explorer sau curl (cu page token):
```bash
curl -X POST "https://graph.facebook.com/v21.0/<PAGE_ID>/subscribed_apps?subscribed_fields=leadgen&access_token=<PAGE_TOKEN>"
```

### 6. Test
- [Lead Ads Testing Tool](https://developers.facebook.com/tools/lead-ads-testing/) —
  creează un lead de test pe pagină.
- Verifică logs: `npx supabase functions logs intake-meta-lead`
- Verifică în /leads coloana „Nou".
- **Atenție**: lead-ul de test are date dummy — șterge-l din CRM după verificare.

## Recomandare pentru formularele Lead Ads

Ca maparea automată să funcționeze, numește întrebările custom așa încât să
conțină cuvintele-cheie și folosește ca opțiuni de răspuns valorile cunoscute:

| Întrebare (exemplu) | Opțiuni recomandate |
|---------------------|---------------------|
| „Ce curs te interesează?" | Street Dance, K-pop, Acrobatică, Zumba, Nu știu încă |
| „Locația preferată" | Quasar Centru, Quasar Nicolina |
| „Grupa de vârstă" | Tiny, Junior, Varsity, Teens, Students, Adults |
