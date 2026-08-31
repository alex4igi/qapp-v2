# qapp v2 — instrucțiuni pentru Claude

## Ce este

**qapp v2** este rescrierea pe stack standard (**Vite + React 19 + TypeScript + Supabase**) a aplicației „Qapp" — sistem complet de management pentru școala de dans **Quasar Dance**: clienți, familii, cursuri, înrolări, prezențe, încasări, restanțe, vouchere, leads, SMS, evenimente, inventar, evaluări, salarii teacheri, pontaj staff.

A doua versiune înlocuiește v1 construită în Noodl (no-code vizual) cu backend PocketBase. Sursele v1 sunt arhivate în `../_archive/qapp v2/v1 sources/` pentru referință; codul activ trăiește integral în `src/`.

## Leads

Modulul real de leads trăiește în `src/features/leads/` (e și modulul de referință pentru
organizarea codului). Fostul prototip separat „Qleads" (Next.js) a fost abandonat și șters
din workspace — dacă apar referințe la el, sunt istorice.

## Arhitectura codului

Vezi **[ARCHITECTURE.md](./ARCHITECTURE.md)** — schelet standard per modul, liantul cross-cutting (RBAC, auth, Supabase, lookups, UI primitives), contractul modul↔liant, plan de refactor pentru bulgări monolitici existenți.

**Modulul de referință** când organizezi cod: `src/features/leads/`.

## Comenzi

```bash
npm run dev          # Vite dev server
npm run build        # build de producție
npx tsc -b           # type-check
npm run gen:types    # regenerare src/types/database.ts din Supabase
npx supabase db push # aplică migrațiile locale pe Supabase remote
```

**Regulă types partajate:** baza de date e comună cu `../qapp-membri`. După ORICE migrație aplicată, regenerează `src/types/database.ts` în AMBELE repo-uri (`npm run gen:types` în fiecare) — altfel portalul rămâne cu tipuri vechi.

**Regulă RLS portal:** orice tabel nou trebuie să primească gardul restrictiv `deny_parinte_direct` (vezi migrația `20260705090000_reapply_deny_parinte_guard.sql`). Verificare: `node scripts/check-rls-parinte.mjs` după fiecare migrație care creează tabele.

**Regulă RLS marketing:** același lucru pentru rolul `marketing` (agenția externă de ads). RLS-ul de bază dă `select using (true)` oricărui cont autentificat, deci un tabel nou fără gard devine automat citibil de agenție. Fiecare tabel nou primește ori `deny_marketing_direct` (deny total), ori `deny_marketing_insert/update/delete` (read-only, doar pentru tabelele de atribuire) — decizie explicită, nu default. Vezi `20260828220100_rol_marketing_rls.sql`. Verificare: `node scripts/check-rls-marketing.mjs`.

**Regulă anon pe RPC (securitate):** default privileges Supabase acordă `anon` EXECUTE pe orice funcție nouă, iar `auth_role()` cade pe `front_desk` pentru requesturile fără rol — deci un RPC `security definer` devine apelabil cu cheia publică dacă nu revoci `anon`. La FIECARE funcție `security definer` nouă adaugă în migrație `revoke execute on function <sig> from anon, public;` (staff/portal rămân pe grantul `authenticated`). Excepție doar dacă funcția e chemată dintr-o politică RLS pentru rolul public. Verificare: `node scripts/check-anon-rpc.mjs` după orice migrație care creează funcții. (Audit 2026-07-17: `20260717150000` + `150100` au închis 110+96 funcții expuse.)

## Convenții cod

- **Limba**: română pentru UI (etichete, mesaje, denumiri domeniu în DB); engleză pentru cod (variabile, funcții, fișiere, componente).
- **TypeScript** obligatoriu.
- **Comentarii**: minim. Doar pentru WHY non-evident (constrângeri, invariante subtile, bug-uri workaround). Nu narăm WHAT-ul.
- **Server-side guarantees** prin RLS + RPC; UI-ul nu validează ce DB-ul deja validează.

## Workflow per modul (validat de user)

Pentru fiecare modul nou sau refactor:
1. Construiește / refactor
2. `npx tsc -b` verde
3. `npm run build` verde
4. Smoke test în browser (Playwright dacă e cazul)
5. Cleanup date de test în Supabase (DB-ul rămâne curat)
6. Raport scurt + întrebare „continuăm?"

## Context business

**Regulile de preț și reduceri** (promo reînscriere, −10% family/cross-sell,
penalizarea pe scadență) stau în **[docs/reguli-preturi-reduceri.md](./docs/reguli-preturi-reduceri.md)** —
sursa de adevăr, cu maparea regulă → loc în cod. Citește-o înainte să atingi
`recalculate_pool_discount`, `preview_pool_discount` sau `cancel_discount_familie_restant`.

Pentru detalii despre Quasar Dance (companie, instructori, trupe, abonamente, locații, surse leads, pipeline conversie), vezi memoria persistentă (`MEMORY.md` și fișierele `project_*.md` din `~/.claude/projects/.../memory/`). Memoriile sunt sursa principală de adevăr pentru context business — ARCHITECTURE.md descrie doar codul.
