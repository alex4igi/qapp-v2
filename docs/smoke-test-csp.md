# Smoke test CSP — site, qapp v2, portal

De rulat după **orice** schimbare de Content-Security-Policy sau după ce o aplicație începe să încarce
ceva de pe un domeniu nou (widget, tracker, imagini, iframe). O sursă lipsă din listă e blocată de browser
**fără niciun mesaj vizibil** pentru utilizator — singurele urme sunt consola și tabela `csp_reports`.

## Unde stau politicile

| Aplicație | Fișier | Mod |
|---|---|---|
| qapp v2 (`qapp-v2.vercel.app`) | `qapp v2/vercel.json` | activ |
| Portal (`membri.quasardance.ro`) | `qapp-membri/vercel.json` | activ |
| Site (`www.quasardance.ro`) | `Website React/quasar-dance/next.config.mjs` (obiectul `CSP`) | Report-Only până la confirmare |

Toate trei trimit rapoartele la `https://www.quasardance.ro/api/csp-report` → tabela `csp_reports` din Neon
(baza site-ului): un rând pe (aplicație, directivă, origine blocată, pagină) cu numărătoare. Colectorul păstrează
doar originea și calea (fără query string; `/semneaza/<token>` → `/semneaza/:token`) și ignoră extensiile de browser.

```sql
select app, directive, blocked, page, n, last_seen from csp_reports order by last_seen desc;
```

## Regula de testare (importantă)

- **Încărcare completă a paginii** (navigare directă la URL, nu click în aplicație) și **consola citită de la 0 ms**.
  Un listener `securitypolicyviolation` pus după încărcare ratează resursele din primul render — așa a scăpat
  sigla Netopia pe 24 sept. 2026.
- **Cache:** o schimbare doar de antete (fără cod nou) nu schimbă `index.html`; browserul primește 304 și poate păstra
  politica veche. Testează într-un context curat (fereastră privată / profil Playwright nou) și ține minte că
  vizitatorii cu pagina în cache primesc politica nouă abia la următorul deploy cu cod.
- „Trece” = zero mesaje `Content Security Policy` în consolă și zero rânduri noi în `csp_reports` pentru
  pagina testată, iar funcționalitatea se vede (imagine încărcată, iframe vizibil, date în tabel).
- O încălcare provocată (`fetch('https://example.com')` din consolă) trebuie să apară ca rând în `csp_reports`
  cu `app` corect — dovada că raportarea merge. Șterge rândurile de test după.

## Fluxuri

Conturi: staff `reference_test_account` (claude.qa, admin); portal: `node scripts/seed-portal-test.mjs` →
testezi → **`node scripts/seed-portal-test.mjs --teardown` obligatoriu** (încasările de test apar în /plati).

| # | Flux | Ce verifici |
|---|---|---|
| 1 | Login staff (qapp v2) și login portal | intră, fără încălcări |
| 2 | Plată Netopia (portal → Plăți → Plătește) | până la redirectul spre `secure.mobilpay.ro` (navigare — CSP nu o atinge) + pagina de întoarcere; **fără plată reală** |
| 3 | Voucher (portal) | aplicarea unui voucher pe fixture |
| 4 | Semnare contract (`/semneaza/:token`) | link real de test → semnare → descărcare |
| 5 | Documente (portal → Documente) | listă + descărcare |
| 6 | Editor PDF (qapp v2 → Contracte → Șabloane → un șablon) | PDF-ul se desenează (`canvas`), worker pdfjs pornit |
| 7 | Rostere cu poze (qapp v2: grupă + eveniment) | `clienti.foto`/`teacheri.poza` — la 24 sept. 2026 toate goale; dacă apar URL-uri, verifică domeniul |
| 8 | Site, fără acord și cu „Accept toate” | /, /orar, /program-si-preturi, /contact (Maps), 4× /cursuri/* (YouTube), /despre-noi + un slug (Unsplash), /quiz, /back-to-dance-school + /multumim, /admin/login (Turnstile); GA4 `/g/collect` și Meta `/tr` pleacă după acord. **Fără înscriere reală** (creează lead în CRM) |

## Istoric rulări

| Data | Cine | Rezultat |
|---|---|---|
| 2026-09-24 | Claude (Playwright, producție) | **Trece.** Raportare: încălcare provocată ajunge în `csp_reports` din toate 3 aplicațiile. Site (Report-Only): 14 pagini, cu și fără acord cookie — 0 încălcări; Maps, YouTube, Turnstile, GA4 `/g/collect`, Meta `/tr` merg. Portal (activ, fixture seed→teardown): login, Plăți, Rezervări, Documente, Profil, /semneaza — 0 încălcări, sigla Netopia încărcată. qapp v2 (activ): login, 9 pagini, editor PDF (canvas) — 0. Poze: `clienti.foto`, `teacheri.poza`, `profil_teacher.poza` toate goale. **Neexecutat, acoperit prin cod:** plata Netopia și voucherul (ambele = cerere spre Supabase + navigare spre mobilpay; click-ul ar crea o comandă reală pe care teardown-ul nu o șterge), semnare cap-coadă (cerere doar spre `contract-public` pe Supabase + canvas local). |
