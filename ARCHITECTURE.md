# Arhitectura qapp v2

Document pentru developer (uman sau Claude) care contribuie cod la `qapp v2/`.
Pentru context business (școala Quasar Dance, roluri, abonamente, fluxuri) vezi `CLAUDE.md`-ul din workspace.

---

## Stack

- **Vite** + **React 19** SPA + **TypeScript**
- **Supabase** (Postgres + Auth + RLS + Edge Functions + pg_cron)
- **TanStack React Query** (cache, staleTime 30s, refetchOnWindowFocus false) — `src/main.tsx`
- **React Router v7** — declarat în `src/App.tsx`
- **Tailwind CSS** — fără `tailwind.config.ts`, folosește `@theme inline` în `index.css`
- **dnd-kit** pentru drag-and-drop (kanban leads)
- **Recharts** pentru grafice (`/statistici`)

---

## Convenția per modul (`src/features/<domain>/`)

Toate feature-urile trăiesc sub `src/features/<domain>/`. Convenția internă:

```
features/<domain>/
├── index.ts            # barrel — DOAR dacă alte module consumă >3 entități publice
├── api/                # mutații + queries DB
│   ├── index.ts        #   (sau `api.ts` flat pentru module mici cu 1 concern)
│   └── <subdomain>.ts  #   un fișier per sub-domeniu (ex: payments, enrollments, refunds)
├── types.ts            # tipuri feature-specific (form types, view types)
├── constants.ts        # label-uri, opțiuni dropdown, enum-uri locale
├── pages/              # componente la nivel de rută (declarate în App.tsx)
│   ├── <Domain>ListPage.tsx
│   └── <Domain>ProfilePage.tsx
├── components/         # bucăți presentational (carduri, rânduri, badge-uri)
├── modals/             # un modal per fișier
├── tabs/               # un tab per fișier (când pagina are tab-uri)
├── hooks/              # hook-uri specifice modulului
└── utils/              # helpers (export csv, calc, sms triggers)
```

**Modulul de referință**: `src/features/leads/` — fiecare tranziție kanban are propriul modal (`ScheduleModal`, `ContactareModal`, `PierdutModal`, `WaitingListModal`, `ConversieModal`), `constants.ts` declară cele 9 coloane, `api.ts` ține mutațiile, `sms.ts` ține declanșatorul SMS. Când ai dubii cum să organizezi un modul, citește acolo.

### Reguli de spargere (judecată, nu prag rigid)

1. **Un fișier = un concern.** Dacă citești un fișier și găsești 2 lucruri care se schimbă independent, se sparge.
2. **Tab-uri și modale se sparg agresiv.** Câștigul: modifici un tab fără să atingi pe celelalte.
3. **`api.ts` flat e ok pentru module mici.** Când amestecă concern-uri (ex: plăți + înrolări + ajustări) → `api/payments.ts`, `api/enrollments.ts`, etc.
4. **Restul aplicației consumă doar `pages/`** dintr-un modul, via `App.tsx`. NU se importă componente interne între module — dacă două module au nevoie de același cod, urcă în `src/components/` sau `src/lib/`.
5. **Importuri directe**, nu barrel-uri agresive. `App.tsx` importă `@/features/leads/LeadsPage`, nu `@/features/leads`. Folosește `index.ts` doar când e necesar.

---

## Liantul (cross-cutting) — NU se modifică în refactorizările de modul

| Punct | Cale | Rol |
|---|---|---|
| Router | `src/App.tsx` | declară toate rutele, grupate pe matricea de acces |
| Layout shell | `src/components/layout/AppLayout.tsx` | wrap-uiește `<Outlet/>` cu Header + TopNav + WorkingDayBanner |
| Header | `src/components/layout/Header.tsx` | nav + user menu + locație globală |
| TopNav / QuickActions | `src/components/layout/{TopNav,QuickActions}.tsx` | navigare laterală + acțiuni rapide |
| Nav config | `src/components/layout/navConfig.ts` | 4 secțiuni (Clienți / Statistici / Studio / Personal); `visibleSections(role)` filtrează prin `ROUTE_ACCESS` |
| RBAC matrix | `src/lib/rolesMatrix.ts` | **SINGLE SOURCE OF TRUTH** pentru rol × rută; helpers `isOwner`, `isPrivileged`, `canChangeLocatie`, `canManageRole` |
| Route guard | `src/components/ProtectedRoute.tsx` | gating per rol; folosit în App.tsx împreună cu `ROUTE_ACCESS['/path']` |
| Auth | `src/hooks/useAuth.tsx` | context global sesiune + rol + locatieId + `signIn`/`signOut`/`endShift` |
| Working date | `src/hooks/useWorkingDate.tsx` | data de lucru curentă (YYYY-MM-DD), `isToday`, `resetToToday` |
| Working locatie | `src/hooks/useWorkingLocatie.tsx` | locația selectată (localStorage), `locatieId`/`options`/`locked`/`canChange` |
| Supabase | `src/lib/supabase.ts` | client singleton; toate modulele importă de aici |
| Tipuri DB | `src/types/database.ts` | generate din Supabase (`npm run gen:types`) |
| Enum-uri UI | `src/lib/enums.ts` | toate dropdown-urile (sex, status, nivel curs, metodă plată, etc.) |
| Lookups | `src/lib/lookups.ts` | fetcher-i React Query pentru relații (teacheri, săli, locații, sezoane, cursuri) |
| Audit | `src/lib/auditLog.ts` | RPC helper pentru `audit_log_record` |
| Format | `src/lib/format.ts` | formatRON și alți formattter-i |
| Fetch all | `src/lib/fetchAll.ts` | `fetchAllRows` — paginare peste plafonul PostgREST `max_rows=1000`; OBLIGATORIU pentru exporturi CSV și agregări client-side |
| Class names | `src/lib/cn.ts` | concat Tailwind classes |
| CSV | `src/lib/csv.ts` | export CSV |
| UI primitives | `src/components/ui/` | 14 componente: Button, Modal, DataTable, Combobox, Tabs, Select, etc. |

### Contractul modulului cu liantul

- Modulul **consumă** liantul (`@/lib/*`, `@/components/ui/*`, `@/hooks/*`) liber.
- Modulul **expune** doar `pages/*` către `App.tsx`.
- Modulul **NU expune** componente/modale/api către alte module. Dacă apare nevoia → urcă în liant.
- Liantul **nu importă** din `features/*` (cu excepția App.tsx care e dispatcher de rute).
- Orice rută nouă = update în **3 locuri**: `App.tsx` (Route), `rolesMatrix.ts` (ROUTE_ACCESS), `navConfig.ts` (NavItem).

---

## Rute & acces (snapshot)

5 roluri: `owner`, `admin`, `manager`, `front_desk`, `teacher` (parinte rămâne scope viitor).

Grupuri pre-definite în `rolesMatrix.ts`:
- `ALL_STAFF` = owner+admin+manager+front_desk
- `PRIVILEGED` = owner+admin+manager
- `ADMIN_OR_OWNER` = owner+admin
- `OWNER_ONLY` = owner
- `WITH_TEACHER` = ALL_STAFF + teacher
- `TEACHER_ONLY` = teacher

Pentru lista completă rută → roluri permise, vezi `ROUTE_ACCESS` în `src/lib/rolesMatrix.ts`. Aceasta este referința unică — atât `ProtectedRoute`, cât și `navConfig.visibleSections()` derivă din ea.

---

## State & contexte

3 contexte React (nu Zustand/Redux):
- `AuthContext` (useAuth) — sesiune Supabase, rol, locatieId
- `WorkingDateContext` (useWorkingDate) — data de lucru (poate fi schimbată din Header pentru retroactiv)
- `WorkingLocatieContext` (useWorkingLocatie) — locația globală selectată

Restul = React Query (`useQuery` / `useMutation`) per feature, cu invalidare după mutație.

---

## Database

- Migrații: `qapp v2/supabase/migrations/*.sql`
- Tipuri generate: `npm run gen:types` → `src/types/database.ts`. **Baza e partajată cu
  `../qapp-membri`** — după orice migrație, regen în AMBELE repo-uri (vezi CLAUDE.md).
- Aplicare migrații: `npx supabase db push` (vezi [[feedback-aplica-migrate-singur]] în memorie — NU cere user-ului să ruleze SQL manual)
- Interogare ad-hoc remote (fără psql): `npx supabase db query "select ..." --linked`
- View-uri și RPC-uri DB folosite pentru rapoarte (`/statistici`, `/financiar`, restanțe)
- **pg_cron: TOATE joburile trăiesc în migrații** (din 2026-07-05; fostul `cron-setup.sql`
  manual a fost absorbit în `20260705110000_cron_qapp_jobs_formalize.sql`). Joburi:
  SMS dimineața (morning-a/b cu gardă 10:00 local), mutări leads seara, sfârșit de sezon,
  statusuri client (Activ↔Inactiv↔EXclient), anulare promo reînscrieri, expirare holduri
  OPEN, pull Meta leads, drenări SMS (programare/review/amânate), remindere contracte,
  audit digest, pontaj auto-close. Verificare: `select jobname, schedule from cron.job`.

### Capcane infra (citește înainte de operațiuni pe proiectul Supabase)

- **`supabase config push` clobberează `[auth]`**: config.toml de aici setează
  `site_url = membri.quasardance.ro` pe proiectul PARTAJAT. Nu rula `config push`
  pentru altceva decât ce vrei explicit să schimbi — poate strica login-ul portalului.
- **RLS portal**: orice tabel nou primește gardul restrictiv `deny_parinte_direct`
  (migrația `20260705090000`). Verificare: `node scripts/check-rls-parinte.mjs`.
- **PostgREST `max_rows=1000`** (config.toml): query-urile care au nevoie de toate
  rândurile folosesc `fetchAllRows` din `src/lib/fetchAll.ts`, altfel trunchiere silențioasă.
- **qbot** (`../qbot/`): sursă parcată intenționat (branch `feature/qbot-paused`);
  nu există copii sincronizate în app-uri — nu rula `sync.mjs` fără decizie explicită.

---

## Comenzi utile

```bash
npm run dev          # Vite dev server (http://localhost:5173 sau următorul liber)
npm run build        # build de producție
npx tsc -b           # type-check (rapid, fără build complet)
npm run gen:types    # regenerare types/database.ts din Supabase
npx supabase db push # aplică migrațiile locale pe Supabase remote
```

---

## Refactorizări modulare

**Planul inițial în 5 faze (plati / cursuri / clienti / setari / dashboard) e FĂCUT**
(2026-07-05: fazele 1, 2, 3, 5 complet; faza 4 parțial — `setari/api.ts` a rămas flat).

Monoliți rămași (audit 2026-07-05), în ordinea priorității — fiecare o sesiune,
comportament identic:

| Modul | Fișier | Linii | Țintă |
|---|---|---|---|
| ~~`leads/`~~ | ~~`LeadModal.tsx`~~ | ~~1081~~ | ✅ FĂCUT 2026-07-05: `LeadModal/` (index 675 + rail, stepper, 6 secțiuni, styles, helpers) |
| ~~`reinscrieri/`~~ | ~~`ReinscrieriPage.tsx`~~ | ~~877~~ | ✅ FĂCUT 2026-07-05: pagină 106 + `components/{CampanieBoard,LegacyBoard,Kpi}` + `modals/{CampanieCursModal,LegacyCursModal}`; fluxul clasic PĂSTRAT (decizie user) |
| ~~`leads/`~~ | ~~`api.ts`~~ | ~~798~~ | ✅ FĂCUT 2026-07-05: `api/{crud,transitions,programari,import,conversie}.ts` + barrel |
| `plati/` | `components/EnrollmentForm/index.tsx` | 754 | sub-secțiuni reale (folderul există, corpul e monolit) |
| `plati/` | `modals/PlataNouaModal/DatoriiUnificateTab.tsx` | 739 | spargere pe secțiuni — DOAR după push-ul lucrului facturare in-flight |
| `dashboard/` | `GrupaDashboardPage.tsx` | 636 | extrage `ClientCard`/`RosterList` la scope de modul |
| ~~`financiar/`~~ | ~~`api.ts`~~ | ~~560~~ | ✅ FĂCUT 2026-07-05: `api/{restante-views,rapoarte,incasari,restante}.ts` + barrel |
| ~~`statistici/`~~ | ~~`api.ts`~~ | ~~510~~ | ✅ FĂCUT 2026-07-05: `api/{interval,financiar,sezoane,prezente,leads,teacheri}.ts` + barrel |
| ~~`statistici/`~~ | ~~`StatisticiPage.tsx`~~ | ~~686~~ | ✅ FĂCUT 2026-08-03: shell ~150 + `sections/` (13 componente, fiecare cu query-urile ei); tot ce e sub fold în `LazySection` (`@/components/ui`), `STAT_QO` staleTime 5 min |
| `familii/` | `FamilieProfilePage.tsx` | 509 | schelet de modul |
| ~~`setari/`~~ | ~~`api.ts`~~ | ~~318~~ | ✅ FĂCUT 2026-07-05: `api/{locatii,sali,sezoane,sms}.ts` + barrel |

Transversal — **query hardening FĂCUT 2026-07-05**: audit complet al select-urilor
nelimitate (≈100 situri). Majoritatea sunt sănătoase (filtrate per client/zi/curs/lună);
cele 4 cu risc real de trunchiere la `max_rows=1000` au primit `fetchAllRows`:
încasările per eveniment (evenimente/api + dashboard/api/events — participanți/sume),
prezențele agregate pe zi (dashboard/api/courses), lista completă /opt-out
(opt-out/api — era deja trunchiată: 5.456 rânduri reale vs 1.000 afișate).
Singurul fan-out `Promise.all` per-rând real: restanțieri per curs în
dashboard/api/preview (~10-15 cursuri/zi — acceptabil, lăsat). La query-uri noi pe
tabele în creștere: filtrează strict SAU folosește `fetchAllRows`.

**Workflow per sesiune** (conform memoriei `feedback-workflow`):
1. Refactor pur (fără schimbare de comportament)
2. `npx tsc -b` verde
3. `npm run build` verde
4. Smoke test Playwright pe fluxurile vizate
5. Cleanup date de test din Supabase
6. Raport scurt + întrebare „continuăm cu următorul?"
