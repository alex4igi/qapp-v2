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

**Regulă gard de rol în RPC (securitate):** tokenul de portal (`parinte`) și contul agenției (`marketing`) au rolul Postgres `authenticated`, deci pot chema prin API ORICE funcție pe care `authenticated` are EXECUTE — iar o funcție `security definer` ocolește gardurile `deny_parinte_direct`/`deny_marketing_*` de pe tabele. La fiecare funcție `security definer` nouă decizi explicit: (a) o cheamă doar cron-ul / o edge function cu service_role / altă funcție definer → `revoke execute ... from authenticated, anon, public; grant execute ... to service_role;`; (b) o cheamă aplicația de staff → prima instrucțiune din corp e gardul de rol (`if (select auth_role()) in ('parinte','marketing'[, 'teacher']) then raise exception 'Acces refuzat.' using errcode = '42501'; end if;`, sau listă albă); (c) o cheamă portalul → scopare pe `client_member_ids()` / `current_familie()`. Audit 2026-09-20 (`20260920123550`): 27 de funcții revocate + 18 cu gard adăugat — un părinte logat putea citi telefoanele leadurilor și își putea activa singur prețul promo.

**Regulă view-uri (securitate):** un view din `public` fără `security_invoker = true` rulează ca owner (`postgres`) și **ocolește RLS** — oricine are SELECT pe view vede tot ce e în tabelele de bază, iar default privileges dau SELECT lui `anon`. Așa au ajuns publice `opt_out_list` (5.934 nume/telefoane) și `datorii_rest` (audit 2026-09-20, migrația `20260920104407`). Orice view nou: `create view ... with (security_invoker = true) as ...` + `revoke all on <view> from anon` dacă nu e destinat paginilor publice. Excepțiile asumate (`bilete_publice`, `produse_publice`: citire publică, fără date personale) sunt listate în `scripts/check-views.mjs`. Verificare: `node scripts/check-views.mjs` după orice migrație care creează view-uri.

**Regulă citire anonimă (securitate):** o politică scrisă `for select using (true)` **fără `to authenticated`** se aplică rolului `public`, deci și lui `anon` — adică oricui are cheia publică din browser. Așa a stat citibil `vacante` (migrația `20260920164228`). Orice politică de citire nouă primește explicit `to authenticated` (sau `to anon` dacă e intenționat publică). Verificare: `node scripts/check-citire-anon.mjs` — lovește API-ul cu cheia publică pentru fiecare tabel/view ȘI caută în catalog politici `using (true)` pe rolul public (prinde și tabelul gol azi). Atenție: RLS care refuză tot răspunde **200 cu zero rânduri**, nu 403 — „cererea a trecut" nu e un semnal de gaură. Excepțiile asumate (`tarife_publice`, `bilete_publice`, `produse_publice`) sunt listate în script.

**Regulă drepturi de tabel (securitate):** `anon` și `authenticated` au voie DOAR la SELECT/INSERT/UPDATE/DELETE. TRUNCATE **nu trece prin RLS** — un `truncate incasari` ar goli tabela indiferent de politici — iar REFERENCES/TRIGGER/MAINTAIN sunt drepturi de DDL/mentenanță. Supabase le acordă implicit pe toate; migrația `20260920163732` le-a revocat pe cele 127 de tabele existente și a strâns default privileges pentru rolul `postgres` (cel cu care rulează migrațiile). ⚠️ Default privileges ale platformei (`supabase_admin`) NU se pot schimba de aici: un tabel creat din dashboard-ul Supabase primește înapoi drepturile largi. Verificare: `node scripts/check-drepturi-tabele.mjs` după orice tabel nou, mai ales dacă a fost creat din UI.

**Regulă urme pe bani (securitate):** `authenticated` NU mai are UPDATE/DELETE pe `incasari` și nici UPDATE pe `datorii` (migrația `20260920151546`). Modificarea unei încasări trece prin `edit_incasare` / `corecteaza_metoda_incasare` / `delete_incasare` — RPC-uri `security definer` care cer motiv și scriu rândul din `audit_log` în ACEEAȘI tranzacție. Ștergerea unei datorii e prinsă de trigger-ul `trg_audit_datorie_stearsa`. Nu adăuga un `.update()`/`.delete()` direct pe aceste tabele din browser: n-ar mai lăsa urmă și oricum primește `42501`. Pe `datorii` nu punem trigger de UPDATE — recalculul reducerilor atinge mii de rânduri și ar îneca jurnalul. Verificare: `node scripts/check-audit-bani.mjs`.

**Regulă gard de rol în edge functions (securitate):** `verify_jwt = true` verifică DOAR semnătura, iar cheia publică `anon` din orice browser e un JWT valid semnat — deci o funcție care se mulțumește cu ea acceptă oricine. Orice edge function chemată din aplicația de staff începe cu `requireStaffRole(req, <listă>, admin)` din `supabase/functions/_shared/staffAuth.ts`; listele de acolo oglindesc `ROUTE_ACCESS` din `src/lib/rolesMatrix.ts` (când diverg, butonul e vizibil și acțiunea dă 403 — vezi contract-send, 2026-09-03). Fără rol în token = refuz; **niciun `role ?? 'front_desk'`**. Funcțiile de cron rămân pe `refuzaApelStrain` din `_shared/cronAuth.ts`. Verificare: `node scripts/check-edge-roles.mjs` (cere funcțiile deployate) și `npx deno check supabase/functions/*/index.ts`.

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

**Procedura pe statusurile de leads** (ce face recepția, ce face aplicația, toate drumurile către
Nurture) stă în **[docs/procedura-leads-kanban.md](./docs/procedura-leads-kanban.md)**. Textele pe care
le vede recepția au o singură sursă: `src/features/leads/procedura.ts` — tooltipurile din aplicație ȘI
secțiunile pe coloane din ghidul public. **După orice modificare în `procedura.ts` rulează
`npm run gen:ghid`** (`-- --check` verifică). Citește documentul înainte să atingi `cron-evening`,
`cron-morning`, `prune_expired_leads` sau pragurile de nurture.

**Regulile de preț și reduceri** (promo reînscriere, −10% family/cross-sell,
penalizarea pe scadență) stau în **[docs/reguli-preturi-reduceri.md](./docs/reguli-preturi-reduceri.md)** —
sursa de adevăr, cu maparea regulă → loc în cod. Citește-o înainte să atingi
`recalculate_pool_discount`, `preview_pool_discount` sau `cancel_discount_familie_restant`.

**Grila de salarizare a instructorilor** (propunere sept. 2026, neimplementată) stă în
**[docs/grila-salarizare-instructori.md](./docs/grila-salarizare-instructori.md)** — bază pe rang ×
nivel, bonus KPI în trei trepte, praguri de 8 și 14 cursanți, diurnă și plată pe eveniment.
⚠️ Conține și definiția corectă a lui „cursant plătitor": **`reziliat` NU înseamnă că omul a plecat**
(e bifat și pe lunile încheiate) — se filtrează pe `data_reziliere`. Citește-o înainte să atingi
`calculeaza_salariu_teacher` sau orice numărătoare de cursanți pe lună.

**Salarizarea managerului de studio** (decisă 14 sept. 2026, neimplementată) stă în
**[docs/bonus-manager-studio.md](./docs/bonus-manager-studio.md)** — bază pe locație, bonus pe încasări
(rata lunii verificată la finalul lunii următoare) și bonus pe ocupare (locuri ocupate / capacitatea grupelor).

Pentru detalii despre Quasar Dance (companie, instructori, trupe, abonamente, locații, surse leads, pipeline conversie), vezi memoria persistentă (`MEMORY.md` și fișierele `project_*.md` din `~/.claude/projects/.../memory/`). Memoriile sunt sursa principală de adevăr pentru context business — ARCHITECTURE.md descrie doar codul.
