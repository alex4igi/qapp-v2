# scripts/ — utilitare one-off (migrări de date, backfill, mentenanță)

Index al scripturilor rulate manual contra Supabase remote. **Nu** fac parte din
build sau din migrațiile SQL — sunt corecții/operații de date punctuale.

## De ce contează lista asta

Datele scrise de aceste scripturi trăiesc DOAR în baza live (NU în migrații SQL).
La un **restore de back-up vechi** se pierd și trebuie reaplicate. Vezi
`project_pret_sedinta_doua_preturi` (memorie) pentru detaliile despre back-up.

## Convenții

- **Dry-run implicit.** Scrierea se face doar cu un flag explicit (`--apply` sau
  similar). Verifică întâi output-ul de dry-run.
- Citesc credențiale din `.env.local` (`SUPABASE_SERVICE_ROLE_KEY`).
- Idempotente pe cât posibil (sigure de re-rulat).
- Orice script nou → adaugă un rând în tabelul de mai jos.

## Scripturi

| Script | Scop | Rulare | Stare |
|--------|------|--------|-------|
| [`fix-prices/run.mjs`](fix-prices/run.mjs) | Backfill prețuri cursuri recurente: `pret_sedinta = round(pret_anual/(zile×35))`, repară `pret_anual=0`, `pret_sedinta_reziliere=50`, șterge cursuri recurente fără înrolări | `node scripts/fix-prices/run.mjs [--apply]` | Rulat 2026-06-07. Idempotent — de reaplicat după orice restore vechi. |
| [`migrate/import.mjs`](migrate/import.mjs) | Migrare completă v1 (PocketBase) → v2 (Supabase): clienți, înrolări, încasări, prezențe etc. | `node scripts/migrate/import.mjs [--sample] [--wipe]` | Rulat la setup-ul v2. NU re-rula pe prod fără `--sample`. |
| [`migrate/fix_enrollment_months.mjs`](migrate/fix_enrollment_months.mjs) | Corectează luna înrolărilor „Per luna" (v1 ultima zi → v2 ziua 1) | `node scripts/migrate/fix_enrollment_months.mjs [--apply]` | One-off post-migrare. |

## Șablon pentru un script nou de backfill

```js
// scripts/<nume>/run.mjs — descriere scurtă + reguli + dată
import fs from 'node:fs'
const APPLY = process.argv.includes('--apply')
const env = fs.readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim()
const URL_ = get('VITE_SUPABASE_URL')
const KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
// 1) citește, 2) calculează + print dry-run, 3) if (APPLY) PATCH/DELETE
```
