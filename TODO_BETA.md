# TODO Beta — qapp v2

Triaj față de cele 6 criterii MVP definite de user (2026-06-04):

1. Cursuri / locație + studio (sală) + teacheri
2. Înrolare cursant + familie → încasare abonament
3. Kanban leads funcțional
4. Mesaje automatizate (SMS/email)
5. Încasări zilnic/periodic per locație
6. Prezențe instructori + cursanți la grupe

Stare gate-uri la triaj: `tsc -b` ✅ · `npm run build` ✅ (902 module, 0 erori).

---

## 🔴 Blochează beta (must-have înainte de trimis la testeri)

| Item | Criteriu | Pe cine cade | Stare |
|------|----------|--------------|-------|
| Activare TheMarketer **production** (ieșire din sandbox) + credit SMS | #4 | **User** | ⏸ TODO user |
| Validare domeniu `quasardance.ro` pe DNS Hetzner (SPF + DKIM + DMARC) pentru email | #4 | **User** | ⏸ TODO user |
| ~~Date de seed reale în Supabase~~ → **migrare v1→v2 LIVRATĂ** | #1,2,5,6 | Claude | ✅ import complet + verificat |

> Codul de SMS/email e gata (wrapper TheMarketer + cron-uri + dedup `sms_logs`); rulează în sandbox/stub până la activarea de mai sus. Nu e nimic de scris în cod pentru #4 — doar activare provider + DNS.

### Migrare date v1 (PocketBase) → v2 (Supabase) — 2026-06-05
Backup `auto_pb_backup_qapp_20260604000000.zip` → `data.db`. Script: `scripts/migrate/import.mjs` (+ `lib.mjs`).
- Sursă: 6.336 clienți, 626 familii, 200 cursuri, 32 teacheri, 39.917 înrolări, 52.715 încasări, 173.253 prezențe, 239 leads.
- UUID v5 determinist din pb-id (idempotent, upsert pe `id`); FK validate față de id-urile importate (orfanele → null); sezon atribuit după dată; `incasari.locatie`/`categorie` + `cursuri.locatie` + `clienti.status` derivate; enum-uri leads vechi mapate; `--wipe` curăță TEST întâi.
- **Sample (40 clienți) verificat în browser:** ✅ cursuri pe locație+sală+teacher, ✅ profil client cu familie+înrolări lunare+plăți+restanțe, ✅ financiar cu locație/categorie derivate, ✅ 0 erori consolă.
- **Import complet — reconciliere (2026-06-05):**
  - Contoare v1↔v2 1:1 pe toate tabelele (prezențe −1 = dedup duplicat real v1 pe `(enrollment,data)`).
  - Total financiar **4.415.723 RON** identic v1=v2 (la leu).
  - Înrolări 100% cu curs+sezon; `clienti.status` Activ 4683/Inactiv 1653; metode plată Cash 49.070/Card 2.135/Transfer 1.447/Revolut 63.
  - Dashboard randează tot setul: restanțe 381.796 RON, 0 erori consolă.
- **TODO user după import:**
  - Poze clienți/teacheri NU s-au migrat (fișiere în storage PocketBase — migrare separată).
  - Re-legare `app_metadata.locatie_id` pt cei ~4 useri (locațiile au id-uri noi).
  - Locațiile au denumirile v1 („Galeriile Stefan cel Mare" vs „Ștefan cel Mare") — redenumire opțională.
  - ~~Înrolări lunare de iunie 2026 lipsesc~~ → REZOLVAT: nu lipseau, erau datate la ultima zi a lunii precedente (convenție v1). Fix aplicat (`fix_enrollment_months.mjs`, 6197 rânduri → ziua 1 a lunii facturate). Vezi `project_conventie_luna_inrolari`. Iunie apare corect cu restanță.
  - `SUPABASE_SERVICE_ROLE_KEY` rămas în `.env.local` (fără prefix VITE → nu ajunge în bundle client) — poate fi șters dacă nu mai e nevoie.

### Rezultat smoke test (2026-06-04, browser localhost, logat ca Owner)

**Zero erori în consolă** pe toate paginile testate. Toate cele 6 flow-uri randează corect:

| Criteriu | Pagină testată | Rezultat |
|----------|----------------|----------|
| 1 | /cursuri | ✅ grupate pe locație, coloane Teacher/Locație/Sală/Nivel/Înscriși |
| 2 | modal „Înrolare nouă" | ✅ client + curs + tip plată + voucher + logică sezon prorata |
| 3 | /leads | ✅ kanban 9 coloane, filtre, carduri, export CSV |
| 5 | /financiar | ✅ 6 tab-uri, per locație/sală/curs/profesor, breakdown metode plată |
| 6 | /pontaj-staff + /grupa/:id | ✅ pontaj cu durate + roster grupă (Prezenți/Absenți/Inactivi/Programați) |

**NU sunt bug-uri de cod blocante.** Blocajele reale sunt de DATE, nu de cod:

- [ ] **Date reale de seed** — în DB sunt doar date „TEST". Locațiile (Nicolina, Quasar 4 Kids, Ștefan cel Mare) + sălile (Studio 1/2) există, dar:
  - cursurile sunt toate „TEST", majoritatea **fără teacher asignat**, 4/8 **fără locație**
  - nu există clienți/familii reali → 0 RON peste tot
  - → fără date reale nu poți face beta pe criteriile 1, 2, 5, 6
- [ ] (opțional) curățare date TEST din DB înainte de seed-ul real

---

## 🟢 După beta (mai vedem)

Toate explicit marcate „viitor / nu acum" în memorie — NU blochează cele 6 criterii:

| Item | Sursă (memorie) |
|------|-----------------|
| Rol părinte — platformă client-facing self-service | `project_rol_parinte_viitor` |
| Calendar programări private (cursuri 1-la-1 cost staff+client) | `project_calendar_programari_private` |
| Workshop-uri ocazionale (modul Plăți noi dedicat vs integrare) | `project_workshopuri_ocazionale` |
| Trupe modelate explicit (MiniQ's/UNIQ/etc., nu doar `nivel='Trupa'`) | `project_trupe_dezvoltate_mai_mult` |
| Redesign funnel leads (flag_streak, activity log, intake automat rafinat) | `project_funnel_leads_redesign` |
| Vacanțe → impact pe salarii teacheri (acum doar sezon) | `project_vacante_impact_salariu` |
| Evoluție pe luni în /statistici (nice-to-have rămas din reînscrieri) | `project_reinscrieri_si_sezoane_revizuire` |
| Email digest săptămânal via TheMarketer (#4 din post-implementare RBAC) | `project_roluri_rbac_todos_postimplem` |

---

_Ultima actualizare: 2026-06-04. Secțiunea „Bug-uri găsite la smoke test" se completează după testul în browser._
