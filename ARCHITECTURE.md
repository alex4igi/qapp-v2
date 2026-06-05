# Arhitectura qapp v2

Document pentru developer (uman sau Claude) care contribuie cod la `qapp v2/`.
Pentru context business (școala Quasar Dance, roluri, abonamente, fluxuri) vezi `CLAUDE.md`-ul din workspace.

---

## Stack

- **Vite** + **React 19** SPA + **TypeScript**
- **Supabase** (Postgres + Auth + RLS + Edge Functions + pg_cron)
- **TanStack React Query** (cache, staleTime 30s, refetchOnWindowFocus false) — `src/main.tsx`
- **React Router v6** — declarat în `src/App.tsx`
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
- Tipuri generate: `npm run gen:types` → `src/types/database.ts`
- Aplicare migrații: `npx supabase db push` (vezi [[feedback-aplica-migrate-singur]] în memorie — NU cere user-ului să ruleze SQL manual)
- View-uri și RPC-uri DB folosite pentru rapoarte (`/statistici`, `/financiar`, restanțe)
- pg_cron job-uri pentru:
  - SMS dimineața (programări azi)
  - Auto-mutări leads (nu_a_venit, nurture)
  - Statusuri client (Activ ↔ Inactiv ↔ EXclient)
  - Anulare promo reînscrieri

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

## Refactorizări modulare în curs / planificate

Cinci faze, una per sesiune, fiecare lasă comportament identic, doar mută cod:

| Fază | Modul | Fișier sursă | Linii | Țintă |
|---|---|---|---|---|
| 1 | `plati/` | `api.ts` | 740 | `api/{payments,enrollments,refunds,reconciliations}.ts` |
| 1 | `plati/` | `EnrollmentForm.tsx` | 506 | `components/EnrollmentForm/` (sub-secțiuni) |
| 1 | `plati/` | `PlataNouaModal.tsx` | 450 | `modals/PlataNouaModal/` (tabs) |
| 2 | `cursuri/` | `CursProfilePage.tsx` | 737 | `tabs/{Activi,Inactivi,Restantieri,Detalii}Tab.tsx` |
| 2 | `cursuri/` | `api.ts` | 572 | `api/{courses,schedule}.ts` |
| 2 | `cursuri/` | `CursForm.tsx` | 505 | sub-secțiuni (Detalii / Program / Tarife) |
| 3 | `clienti/` | `ClientProfilePage.tsx` | 715 | `tabs/*Tab.tsx` (10+ tab-uri) |
| 4 | `setari/` | `UtilizatoriSection.tsx` | 598 | List + EditModal + InvitatieModal + ResetPasswordModal |
| 4 | `setari/` | `SezoaneSection.tsx` | 539 | List + Edit + Arhivare + integrare clone wizard |
| 4 | `setari/` | `SezonCloneWizard.tsx` | 503 | `wizard/Step{1..N}.tsx` |
| 5 | `dashboard/` | `api.ts` | 536 | `api/{kpi,charts,activity}.ts` |

**Workflow per fază** (conform memoriei `feedback-workflow`):
1. Refactor pur (fără schimbare de comportament)
2. `npx tsc -b` verde
3. `npm run build` verde
4. Smoke test Playwright pe fluxurile vizate
5. Cleanup date de test din Supabase
6. Raport scurt + întrebare „continuăm cu următorul?"
