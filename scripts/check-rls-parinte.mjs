// Verifică invariantul de securitate al portalului de membri: ORICE tabel din
// schema public trebuie să aibă RLS activat + politica restrictivă
// `deny_parinte_direct` (conturile `parinte` accesează doar prin RPC).
//
// Gap-ul istoric: loop-ul care aplică gardul rulează doar la momentul migrației,
// deci tabelele create ulterior rămân neacoperite până la următoarea re-rulare
// (vezi 20260705090000_reapply_deny_parinte_guard.sql).
//
// Rulare:  node scripts/check-rls-parinte.mjs
// Exit 0 = totul acoperit; exit 1 = există tabele descoperite (listate).
// DE RULAT după orice migrație care creează tabele noi.

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)
const URL_ = env.VITE_SUPABASE_URL
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !SERVICE) throw new Error('lipsesc cheile în .env.local')

const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } })

const { data, error } = await svc.rpc('rls_parinte_gap_report')
if (error) throw new Error(`rls_parinte_gap_report: ${error.message}`)

if (!data || data.length === 0) {
  console.log('✅ Toate tabelele din public au RLS + gardul deny_parinte_direct.')
  process.exit(0)
}

console.log(`⚠️  ${data.length} tabele descoperite:\n`)
for (const row of data) console.log(`  - ${row.tabel}: ${row.problema}`)
console.log(
  '\nFix: re-rulează loop-ul de gard (vezi 20260705090000_reapply_deny_parinte_guard.sql)' +
    ' sau adaugă politica manual în migrația tabelului nou.',
)
process.exit(1)
