# Runbook de incident — date personale, conturi, bani

> Pentru momentul în care ceva nu e în regulă: un cont folosit de altcineva, date care au ieșit,
> plăți ciudate, un secret scăpat. Scris pentru Alex și pentru agentul care te ajută.
> Faza 4 din planul de securizare. Ultima revizie: 28 sept. 2026.

## 0. Primele 15 minute

1. **Notează ora** la care ai aflat. De aici curg cele 72 de ore pentru ANSPDCP (§4).
2. **Nu șterge nimic.** Jurnalele (`audit_log`, `securitate_digest`, logurile Supabase și Vercel) sunt
   dovada. Pe Supabase Free logurile se păstrează doar o zi, deci exportă-le acum dacă e cazul.
3. **Oprește scurgerea**, nu repara tot. Alege din §1 doar întrerupătorul care se potrivește.
4. Scrie într-un document (nu în WhatsApp): ce s-a întâmplat, de când, ce date, câți oameni, ce ai făcut și la ce oră.
   Același text devine notificarea din §4.

## 1. Întrerupătoare (de la cel mai mic la cel mai mare)

| Situație | Ce faci | Efect | Revenire |
|---|---|---|---|
| Un cont de staff compromis | Supabase → Authentication → Users → contul → **Ban user**; apoi „Sign out user". Schimbă-i rolul în `admin-users` dacă e nevoie | Doar omul acela e scos | Unban + parolă nouă + 2FA |
| Un cont de portal compromis | SQL: `update portal_accounts set status = 'disabled' where email = '…'; delete from portal_sessions where account_id = (select id from portal_accounts where email = '…');` | Familia aceea nu mai intră | `status = 'active'` + link de resetare |
| Atac pe portal (ghicit de parole, spam la resetare) | Supabase → Edge Functions → Secrets: `PORTAL_LOGIN_DISABLED = 1` | Nimeni nu se mai loghează și nu mai cere resetare; sesiunile deja deschise mor într-o oră. Staff-ul nu e afectat | Șterge secretul |
| Toți părinții trebuie scoși imediat | SQL: `delete from portal_sessions;` (+ întrerupătorul de mai sus) | Toate sesiunile de portal se închid la următoarea reîmprospătare (max. 1 h) | Se loghează din nou |
| Trafic de atac pe site sau pe aplicație | Vercel → proiectul → Firewall → **Attack Challenge Mode** ON (pe fiecare proiect: site, qapp v2, portal) | Toți vizitatorii trec printr-o verificare de browser | OFF din același loc |
| Formularul de pe site aruncă leaduri false | Supabase → Secrets: schimbă `INTAKE_SECRET` (site-ul nu mai poate scrie până nu primește valoarea nouă în Vercel) | Formularul întoarce eroare | Pune aceeași valoare în Vercel (`INTAKE_SECRET`) și redeploy site |
| Plăți ciudate | Netopia → panou → suspendă POS-ul / cere dezactivarea temporară | Nu mai intră plăți online | Reactivare în panou |

## 2. Rotirea secretelor

Rotește **doar ce ar fi putut scăpa**, în ordinea de mai jos (de la cel mai periculos). După fiecare,
verifică pe loc că aplicația merge — un secret rotit pe jumătate oprește încasările.

| # | Secret | Unde se schimbă | Unde se pune valoarea nouă | Atenție |
|---|---|---|---|---|
| 1 | Parola contului Google Workspace / Supabase / Vercel / GitHub al celui compromis | La furnizor | — | + 2FA, + „sign out all sessions" |
| 2 | `SUPABASE_SERVICE_ROLE_KEY` (dă acces la TOT) | Supabase → Settings → API Keys → creează o cheie secretă nouă, apoi o dezactivezi pe cea veche | Secretele edge functions (automat), `.env.local` în qapp v2 și qapp-membri, orice script | Nu o pune niciodată în Vercel sau în browser |
| 3 | Secretul JWT al proiectului = `PORTAL_JWT_SECRET` | Supabase → JWT Keys → rotire | Supabase Secrets (`PORTAL_JWT_SECRET`), `.env.local` | ⚠️ Schimbă și cheile anon/service vechi și deloghează pe **toată lumea** (staff + părinți). Doar dacă secretul chiar a scăpat |
| 4 | `NETOPIA_API_KEY`, `NETOPIA_POS_SIGNATURE` | Panoul Netopia | Supabase Secrets | Testează o plată de 1 leu după |
| 5 | `THEMARKETER_REST_KEY` (trimite SMS/email în numele școlii) | theMarketer → API | Supabase Secrets **și** Vercel (site) | Verifică un SMS de test |
| 6 | `FGO_KEYS` (facturi) | FGO | Supabase Secrets | |
| 7 | `META_*` (reclame, leaduri) | Meta Business → System users | Supabase Secrets, Vercel (site: `META_CAPI_ACCESS_TOKEN`) | |
| 8 | `CRON_SECRET`, `INTAKE_SECRET`, `SHEETS_INTAKE_SECRET`, `CONTRACT_INTERNAL_SECRET` | Generezi tu (`openssl rand -hex 32`) | Supabase Secrets + locul care îl trimite: pentru `CRON_SECRET`, Supabase → Vault → `cron_secret` (îl citește `cron_call_headers()`); pentru intake, Vercel (site) și scriptul Google Sheets | Cron-urile pică tăcut dacă Vault-ul are valoarea veche |
| 9 | `ADMIN_PASSWORD`, `ADMIN_AUTH_SECRET` (admin site) | Generezi tu | Vercel (site) | Rotirea lui `ADMIN_AUTH_SECRET` deloghează adminul site-ului |
| 10 | `DATABASE_URL` (Neon, baza site-ului) | Neon → Roles → reset password | Vercel (site) | |
| 11 | `TURNSTILE_SECRET_KEY` | Cloudflare → Turnstile | Vercel (site), Supabase Secrets | |

Cheile care stau în browser (`VITE_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_*`) sunt publice prin natura lor —
nu se rotesc pentru că „au scăpat", ci doar împreună cu #3.

## 3. Ce verifici după

- `audit_log` pe perioada incidentului: cine a modificat/șters încasări, datorii, clienți (pagina **Audit**).
- `securitate_digest` (ultimele 90 de zile): blocări de plafon, conturi noi, schimbări de admini.
- Supabase → Logs → API / Auth / Edge Functions: IP-urile și rutele atacatorului.
- Rulează gardienii: `node scripts/check-rls-parinte.mjs`, `check-rls-marketing.mjs`, `check-rls-teacher.mjs`,
  `check-anon-rpc.mjs`, `check-views.mjs`, `check-citire-anon.mjs`, `check-drepturi-tabele.mjs`, `check-audit-bani.mjs`.
- Dacă au fost atinse date: restaurează din backup (Supabase Pro → Backups, sau exportul din `~/Documents/quasar-backup/`).

## 4. Obligații legale (GDPR art. 33–34)

> De confirmat cu juristul; textul de mai jos e cadrul, nu consultanță.

- **Breșă = orice** acces neautorizat, pierdere, modificare sau divulgare de date personale — inclusiv un
  laptop pierdut sau un email trimis greșit cu lista de clienți.
- **ANSPDCP în 72 de ore** de la momentul în care ai aflat, dacă breșa poate afecta oamenii (aproape
  întotdeauna, când sunt telefoane, CNP-uri, date de copii sau bani). Formular online pe
  dataprotection.ro → „Notificare încălcare securitate date". Dacă nu ai toate detaliile, notifici ce știi
  și completezi ulterior.
- **Oamenii afectați se anunță „fără întârziere nejustificată"** când riscul e ridicat (CNP, date de
  card, parole, date despre copii). Mesaj simplu: ce s-a întâmplat, ce date, ce ai făcut, ce să facă ei, pe cine sună.
- **Orice breșă se trece în registrul de breșe** (§5), chiar dacă decizi că nu trebuie notificată — cu motivul.
- Furnizorii (Supabase, Vercel, theMarketer, Netopia, FGO, Meta) au obligația să te anunțe pe tine; tu anunți ANSPDCP.

## 5. Registrul de breșe

Un rând pe incident, în `Management/GDPR/registru-brese.md` (în afara git-ului — conține date):
data aflării · ce s-a întâmplat · date și număr de persoane · măsuri luate · notificat ANSPDCP (da/nu, dată, motiv) ·
notificat persoane (da/nu, dată).

**Primul rând de trecut:** 20 sept. 2026 — `opt_out_list` (5.934 nume/telefoane) și `datorii_rest`
citibile cu cheia publică; închis în aceeași zi (migrația `20260920104407`); fără semne de acces extern,
nedemonstrabil pe planul Free. Decizia de notificare de discutat cu juristul (vezi raportul de audit §3.5).
