// Backfill re-rulabil: cursurile (mai ales cele clonate pe sezon) care au
// `cursuri.teacher` setat dar NU au rândul corespunzător în `cursuri_teacheri`
// devin inaccesibile teacherului (RLS-ul trece prin teacher_can_access_curs(),
// care verifică M:N). Acest script umple golul, idempotent.
//
// Rulare: node scripts/fix-cursuri-teacheri-mn.mjs
// De re-rulat după re-importul v1 sau orice clonare de sezon făcută înainte de
// patch-ul din clone_sezon (vezi migrația 20260621_clone_sezon_cursuri_teacheri).

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(fileURLToPath(new URL('../.env.local', import.meta.url)), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const log = (...a) => console.log(...a)

// 1) Toate cursurile cu titular legacy setat.
const { data: cursuri, error: e1 } = await admin
  .from('cursuri')
  .select('id, teacher')
  .not('teacher', 'is', null)
if (e1) throw e1

// 2) Rândurile M:N existente (titular sau asistent).
const { data: existente, error: e2 } = await admin
  .from('cursuri_teacheri')
  .select('curs_id, teacher_id')
if (e2) throw e2

const seen = new Set(existente.map((r) => `${r.curs_id}|${r.teacher_id}`))

// 3) Perechile lipsă (curs + titular legacy fără rând M:N).
const lipsa = cursuri
  .filter((c) => !seen.has(`${c.id}|${c.teacher}`))
  .map((c) => ({ curs_id: c.id, teacher_id: c.teacher, rol: 'titular' }))

log(`Cursuri cu titular legacy: ${cursuri.length}`)
log(`Rânduri M:N existente:     ${existente.length}`)
log(`Perechi lipsă de inserat:  ${lipsa.length}`)

if (lipsa.length === 0) {
  log('✓ Nimic de făcut — toate cursurile au rândul M:N.')
  process.exit(0)
}

// 4) Insert idempotent (service role ocolește RLS; ignoram conflictele).
const { error: e3 } = await admin
  .from('cursuri_teacheri')
  .upsert(lipsa, { onConflict: 'curs_id,teacher_id', ignoreDuplicates: true })
if (e3) throw e3

log(`✓ Inserate ${lipsa.length} rânduri M:N (rol=titular).`)
