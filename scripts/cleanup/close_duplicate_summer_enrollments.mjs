// Curățare dubluri înrolări în sezonul de vară „Vara 2026" (declanșat de cazul
// Obreja/Ciornei). Șterge DOAR rânduri fără plată ȘI fără prezență:
//   - Ciornei Medeea @ Varsity BEG: a doua înrolare Per-luna iulie (dublură reală, disc=26)
//   - Baciu Alexandra @ Dans Junior: înrolare Per-luna iunie stray (fără activitate)
// Rândurile cu plată/prezență (Mihoci, Deliu, Udrea = drop-in/familie legitime) NU se ating.
// Re-rulabil: dacă rândurile lipsesc deja, le sare. După ștergere re-scan + recalc discount.
// Rulare: node scripts/cleanup/close_duplicate_summer_enrollments.mjs

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const db = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const VARA = 'e475cebc-2706-425a-ba56-ede51f8abd88'
const TARGETS = [
  { id: '2dd61aca-a9e5-433a-85ff-4a3c42d17542', of: 'Ciornei Medeea (dublură Per-luna iulie, disc=26)' },
  { id: '034fc9d4-769c-44c9-b1b6-6fcee8396e33', of: 'Baciu Alexandra (Per-luna iunie stray)' },
]

const affectedClients = new Set()

for (const t of TARGETS) {
  const { data: enr } = await db.from('enrollments')
    .select('id, client, cursul, data_incepere, data_final, tip_plata, suma, politica_discount, reziliat')
    .eq('id', t.id).maybeSingle()
  if (!enr) { console.log(`SKIP ${t.of} — rândul nu există (deja șters).`); continue }

  const { count: plati } = await db.from('incasari').select('id', { count: 'exact', head: true }).eq('inregistrare', t.id)
  const { count: prez } = await db.from('prezente').select('id', { count: 'exact', head: true }).eq('enrollment', t.id)
  if ((plati ?? 0) > 0 || (prez ?? 0) > 0) {
    console.log(`ABORT ${t.of} — are plati=${plati} prezente=${prez}, NU șterg.`)
    continue
  }
  const { error } = await db.from('enrollments').delete().eq('id', t.id)
  if (error) { console.log(`EROARE la ștergere ${t.id}:`, error.message); continue }
  affectedClients.add(enr.client)
  console.log(`DELETED ${t.of} — ${t.id}`)
}

// Re-scan: 2x Per-luna active pe același (client, curs, data_incepere) în Vara 2026
const { data: perLuna } = await db.from('enrollments')
  .select('client, cursul, data_incepere')
  .eq('sezon_id', VARA).eq('activ', true).eq('reziliat', false).eq('tip_plata', 'Per luna')
const seen = new Map()
const remaining = []
for (const e of perLuna || []) {
  const k = `${e.client}|${e.cursul}|${e.data_incepere}`
  if (seen.has(k)) remaining.push(k); else seen.set(k, true)
}
console.log(`\nRe-scan dubluri Per-luna same (client,curs,data): ${remaining.length}`)
if (remaining.length) console.log(remaining)

// Recalc discount pentru clienții afectați (repară politica_discount rămasă)
for (const c of affectedClients) {
  const { error } = await db.rpc('recalculate_pool_discount', { p_client: c })
  console.log(`recalculate_pool_discount(${c}):`, error ? error.message : 'ok')
}
console.log('\nGata.')
