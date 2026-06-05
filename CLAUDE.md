# qapp v2 — instrucțiuni pentru Claude

## Ce este

**qapp v2** este rescrierea pe stack standard (**Vite + React 19 + TypeScript + Supabase**) a aplicației „Qapp" — sistem complet de management pentru școala de dans **Quasar Dance**: clienți, familii, cursuri, înrolări, prezențe, încasări, restanțe, vouchere, leads, SMS, evenimente, inventar, evaluări, salarii teacheri, pontaj staff.

A doua versiune înlocuiește v1 construită în Noodl (no-code vizual) cu backend PocketBase. Sursele v1 sunt în `v1 sources/` pentru referință, dar codul activ trăiește integral în `src/`.

## NU confunda cu Qleads

În workspace există și un folder `qleads/` — acesta e un **draft test (Next.js prototype), NU producție**. Modulul real de leads din qapp v2 trăiește în `src/features/leads/`. CLAUDE.md de la nivelul workspace-ului (`../CLAUDE.md`) descrie Qleads, nu qapp v2 — ignoră-l când lucrezi aici.

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

Pentru detalii despre Quasar Dance (companie, instructori, trupe, abonamente, locații, surse leads, pipeline conversie), vezi memoria persistentă (`MEMORY.md` și fișierele `project_*.md` din `~/.claude/projects/.../memory/`). Memoriile sunt sursa principală de adevăr pentru context business — ARCHITECTURE.md descrie doar codul.
