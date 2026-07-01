// One-shot: normalizează `cursuri.ora` de forma "bare hour" ("19") la "HH:MM"
// ("19:00") în sezonul ACTIV. Motiv: o oră fără minute făcea cursul să dispară
// din calendarul de închirieri și din verificarea de conflict (timeToMinutes
// cerea strict HH:MM). Idempotent — rulabil de mai multe ori.
//
//   node scripts/fix-open-class-ora.mjs         # arată ce ar schimba (dry-run)
//   node scripts/fix-open-class-ora.mjs --apply # aplică

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const db = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const APPLY = process.argv.includes('--apply')

const { data: sezon } = await db
  .from('sezoane').select('id, numele_sezonului').eq('stare', 'activ').maybeSingle()
if (!sezon) { console.log('Niciun sezon activ. Stop.'); process.exit(0) }
console.log(`Sezon activ: ${sezon.numele_sezonului} (${sezon.id})`)

const { data: cursuri, error } = await db
  .from('cursuri').select('id, numele, ora').eq('sezon', sezon.id)
if (error) { console.error(error); process.exit(1) }

// bare hour: doar cifre (1-2), fără ":"
const bare = (cursuri ?? []).filter((c) => c.ora != null && /^\d{1,2}$/.test(String(c.ora).trim()))
if (!bare.length) { console.log('Nimic de corectat (nicio oră „bare hour").'); process.exit(0) }

console.log(`\nDe corectat: ${bare.length}`)
for (const c of bare) console.log(`  "${c.numele}"  ora="${c.ora}" → "${String(c.ora).trim()}:00"`)

if (!APPLY) { console.log('\n(dry-run — rulează cu --apply pentru a aplica)'); process.exit(0) }

for (const c of bare) {
  const nou = `${String(c.ora).trim()}:00`
  const { error: uErr } = await db.from('cursuri').update({ ora: nou }).eq('id', c.id)
  if (uErr) { console.error(`❌ ${c.numele}:`, uErr.message); process.exit(1) }
  console.log(`✅ ${c.numele} → ${nou}`)
}
console.log('\nGata.')
