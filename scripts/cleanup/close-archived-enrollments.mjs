// One-time backfill (re-rulabil): închide data_final pe înrolările rămase deschise
// (data_final=NULL) din sezoanele DEJA arhivate. Folosește RPC-ul canonic
// close_season_open_enrollments(sezon) — aceeași regulă ca going-forward.
//
// Sezonul activ / planificat NU e atins (doar stare='arhivat').
// Rulare: node scripts/cleanup/close-archived-enrollments.mjs

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

const { data: sezoane, error } = await db
  .from('sezoane')
  .select('id, numele_sezonului, data_final, stare')
  .eq('stare', 'arhivat')
  .order('data_final', { ascending: true })
if (error) throw error

console.log(`Sezoane arhivate: ${sezoane.length}`)
let total = 0
for (const s of sezoane) {
  const { data: closed, error: rpcErr } = await db.rpc('close_season_open_enrollments', {
    p_sezon: s.id,
  })
  if (rpcErr) { console.error(`  ✗ ${s.numele_sezonului}: ${rpcErr.message}`); continue }
  total += closed ?? 0
  console.log(`  ✓ ${s.numele_sezonului} (final ${s.data_final}): ${closed} înrolări închise`)
}
console.log(`\nTotal înrolări delimitate: ${total}`)
