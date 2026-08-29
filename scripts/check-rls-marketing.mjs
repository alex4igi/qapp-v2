// Verifică invariantul de securitate al rolului `marketing` (agenția externă de
// ads): ORICE tabel din schema public trebuie să aibă RLS activat + una dintre
// cele două forme de gard — `deny_marketing_direct` (deny total) sau
// `deny_marketing_insert/update/delete` (read-only, pentru tabelele din allowlist).
//
// Fără gard, un tabel nou e citibil de agenție: RLS-ul de bază dă
// `select using (true)` oricărui cont autentificat.
//
// Gap-ul e același ca la `parinte`: loop-ul rulează doar la momentul migrației,
// deci tabelele create ulterior rămân descoperite (vezi
// 20260828220100_rol_marketing_rls.sql).
//
// Rulare:  node scripts/check-rls-marketing.mjs
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

const { data, error } = await svc.rpc('rls_marketing_gap_report')
if (error) throw new Error(`rls_marketing_gap_report: ${error.message}`)

if (!data || data.length === 0) {
  console.log('✅ Toate tabelele din public au RLS + gardul deny_marketing_*.')
  process.exit(0)
}

console.log(`⚠️  ${data.length} tabele descoperite:\n`)
for (const row of data) console.log(`  - ${row.tabel}: ${row.problema}`)
console.log(
  '\nFix: re-rulează loop-ul de gard (vezi 20260828220100_rol_marketing_rls.sql)' +
    ' sau adaugă politica manual în migrația tabelului nou.' +
    '\nAtenție: tabel nou = decizie explicită — allowlist (read-only) sau deny total.',
)
process.exit(1)
