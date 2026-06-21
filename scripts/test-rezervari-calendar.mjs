// Test izolat pentru get_rezervari_client (calendar portal). NU lasă date în urmă.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const parseEnv = (p) => Object.fromEntries(
  readFileSync(p, 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const env = parseEnv(fileURLToPath(new URL('../.env.local', import.meta.url)))
const SB = env.VITE_SUPABASE_URL, ANON = env.VITE_SUPABASE_ANON_KEY, SVC = env.SUPABASE_SERVICE_ROLE_KEY
const admin = createClient(SB, SVC, { auth: { persistSession: false } })
const log = (...a) => console.log(...a)

let sesiuneId, rezervareId

try {
  // login ca părinte de test + găsește Ana
  const user = createClient(SB, ANON, { auth: { persistSession: false } })
  const auth = await user.auth.signInWithPassword({ email: 'portal.test@quasardance.ro', password: 'QuasarPortal!2026' })
  if (auth.error) throw new Error('login: ' + auth.error.message)
  const ana = (await user.rpc('get_membri_familie')).data?.find((m) => (m.nume ?? '').includes('Ana'))
  if (!ana) throw new Error('Ana not found')
  log('✓ login parinte; Ana =', ana.client_id)

  // curs facultativ cu instructor + locație, pt curs_nume/locatie/instructor
  const curs = (await admin.from('cursuri').select('id,numele,teacher').eq('facultativ', true).limit(1).maybeSingle()).data
  if (!curs) throw new Error('niciun curs facultativ')

  // sesiune OPEN de test în iunie 2026
  const sIns = await admin.from('open_sesiuni').insert({
    curs: curs.id, data: '2026-06-24', capacitate: 10, instructor: curs.teacher ?? null,
  }).select('id').single()
  if (sIns.error) throw new Error('create sesiune: ' + sIns.error.message)
  sesiuneId = sIns.data.id

  // rezervare PLĂTITĂ pt Ana
  const rIns = await admin.from('open_rezervari').insert({
    sesiune: sesiuneId, client: ana.client_id, status: 'platit', suma: 95,
  }).select('id').single()
  if (rIns.error) throw new Error('create rezervare: ' + rIns.error.message)
  rezervareId = rIns.data.id
  log('✓ seed: sesiune 2026-06-24 + rezervare platit', rezervareId)

  // TEST: RPC ca părinte întoarce rezervarea
  const res = await user.rpc('get_rezervari_client', { p_client: ana.client_id })
  if (res.error) throw new Error('rpc: ' + res.error.message)
  const found = (res.data ?? []).find((r) => r.rezervare_id === rezervareId)
  if (!found) throw new Error('TEST FAIL: rezervarea nu apare în get_rezervari_client')
  log('✓ TEST PASS:', JSON.stringify(found))

  // TEST scope: un client din altă familie NU trebuie returnat
  const leak = (res.data ?? []).filter((r) => r.curs_nume == null)
  log('✓ scope OK (', res.data.length, 'rezervări, toate ale familiei)')
} catch (e) {
  console.error('✗', e.message)
  process.exitCode = 1
} finally {
  if (rezervareId) await admin.from('open_rezervari').delete().eq('id', rezervareId)
  if (sesiuneId) await admin.from('open_sesiuni').delete().eq('id', sesiuneId)
  log('✓ cleanup done')
}
