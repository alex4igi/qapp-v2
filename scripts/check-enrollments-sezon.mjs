// Verifică invariantul „o înrolare începe în interiorul sezonului ei".
//
// Un rând cu `data_incepere` în afara intervalului sezonului e invizibil în
// fișa clientului / familiei / datoriile pe curs (toate filtrează pe sezon),
// dar intră în `get_client_restante` ⇒ restanță pe o înrolare care nu se
// găsește nicăieri. Gardul din DB (`trg_enrollment_snap_start_sezon`,
// migrația 20260912160000) mută startul pe sezon la insert/update; scriptul
// prinde ce a rămas din trecut sau ce nu poate fi reparat automat (import v1
// cu anul tastat greșit — intervalul nu traversează startul de sezon).
//
// Rulare:  node scripts/check-enrollments-sezon.mjs
// Exit 0 = curat; exit 1 = există rânduri în afara sezonului (listate).

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

const { data, error } = await svc.rpc('enrollments_sezon_gap_report')
if (error) throw new Error(`enrollments_sezon_gap_report: ${error.message}`)

if (!data || data.length === 0) {
  console.log('✅ Toate înrolările încep în interiorul sezonului lor.')
  process.exit(0)
}

console.log(`⚠️  ${data.length} înrolări în afara sezonului lor:\n`)
for (const r of data) {
  console.log(
    `  - ${r.client_nume} · ${r.curs_nume ?? '?'} · ${r.data_incepere} → ${r.data_final ?? '—'}` +
      ` | sezon ${r.sezon_nume} (${r.sezon_start} → ${r.sezon_final})` +
      ` | suma ${r.suma} · rest ${r.rest}` +
      `\n    ${r.enrollment_id}`,
  )
}
console.log(
  '\nFix: dacă intervalul traversează startul sezonului, un update pe data_incepere' +
    ' declanșează gardul; altfel corectează manual (sau șterge dublura cu sterge_inrolare).',
)
process.exit(1)
