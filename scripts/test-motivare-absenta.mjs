// Test izolat pentru aproba_motivare_absenta. NU lasă date în urmă.
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

const ids = { client: null, familie: null, curs: null, enrIun: null, enrIul: null, inc: null }
const PRZ = []
let fails = 0
const assert = (cond, msg) => { if (cond) log('  ✓', msg); else { fails++; log('  ✗ FAIL:', msg) } }

try {
  // 0) familie + client de test
  const fam = await admin.from('familii').insert({ nume_familie: 'ZZTEST Motivare (de sters)' }).select('id').single()
  ids.familie = fam.data.id
  const cl = await admin.from('clienti').insert({ nume: 'ZZTEST', prenume: 'Motivare', familia: ids.familie }).select('id').single()
  ids.client = cl.data.id

  // 1) curs recurent 2×/săpt (prag = 4)
  const curs = await admin.from('cursuri').insert({
    numele: 'ZZTEST Curs Motivare', zile: ['Luni', 'Miercuri'], facultativ: false,
  }).select('id').single()
  if (curs.error) throw new Error('curs: ' + curs.error.message)
  ids.curs = curs.data.id

  // 2) înrolare iunie (Per luna, 200 lei, deja plătită 200) + înrolare iulie (țintă credit)
  const enrIun = await admin.from('enrollments').insert({
    client: ids.client, cursul: ids.curs, tip_plata: 'Per luna',
    suma: 200, suma_baza: 200, data_incepere: '2026-06-01', data_final: '2026-06-30', activ: true, reziliat: false,
  }).select('id').single()
  if (enrIun.error) throw new Error('enr iun: ' + enrIun.error.message)
  ids.enrIun = enrIun.data.id

  const enrIul = await admin.from('enrollments').insert({
    client: ids.client, cursul: ids.curs, tip_plata: 'Per luna',
    suma: 200, suma_baza: 200, data_incepere: '2026-07-01', data_final: '2026-07-31', activ: true, reziliat: false,
  }).select('id').single()
  ids.enrIul = enrIul.data.id

  const inc = await admin.from('incasari').insert({
    client: ids.client, inregistrare: ids.enrIun, suma: 200, categorie: 'Abonament', data: '2026-06-05',
  }).select('id').single()
  if (inc.error) throw new Error('incasare: ' + inc.error.message)
  ids.inc = inc.data.id

  // 3) 5 absențe în iunie (> prag 4 → eligibil scutire)
  for (const d of ['2026-06-01', '2026-06-03', '2026-06-08', '2026-06-10', '2026-06-15']) {
    const p = await admin.from('prezente').insert({
      client: ids.client, enrollment: ids.enrIun, data: d, status: 'Absent',
    }).select('id').single()
    PRZ.push(p.data.id)
  }
  log('✓ seed: client + curs 2×/săpt + înrolare iun (plătită 200) + iul + 5 absențe')

  // 4) apel RPC ca ADMIN (is_admin trece de gard)
  const user = createClient(SB, ANON, { auth: { persistSession: false } })
  const auth = await user.auth.signInWithPassword({ email: 'claude.qa@quasardance.ro', password: 'QappTest2026!' })
  if (auth.error) throw new Error('login admin: ' + auth.error.message)

  const res = await user.rpc('aproba_motivare_absenta', { p_enrollment: ids.enrIun, p_observatii: 'TEST motivare' })
  if (res.error) throw new Error('rpc: ' + res.error.message)
  log('✓ RPC →', JSON.stringify(res.data))

  // 5) asserts
  assert(res.data.motivate === 5, '5 absențe marcate Motivat')
  assert(res.data.absente === 5, 'absente=5')
  assert(res.data.prag === 4, 'prag=4 (2×2 ședințe/săpt)')
  assert(res.data.scutit === true, 'scutit=true (5 > 4)')
  assert(res.data.credit === 'luna_urmatoare', 'credit mutat pe luna următoare')

  const enrAfter = (await admin.from('enrollments').select('suma, suma_baza').eq('id', ids.enrIun).single()).data
  assert(Number(enrAfter.suma) === 0 && Number(enrAfter.suma_baza) === 0, 'iunie suma=0 ȘI suma_baza=0')

  const incAfter = (await admin.from('incasari').select('inregistrare').eq('id', ids.inc).single()).data
  assert(incAfter.inregistrare === ids.enrIul, 'încasarea 200 mutată pe înrolarea iulie (credit)')

  const motivat = (await admin.from('prezente').select('status').eq('enrollment', ids.enrIun)).data
  assert(motivat.every((p) => p.status === 'Motivat'), 'toate prezențele lunii = Motivat')

  const audit = (await admin.from('motivari_absenta').select('id, scutit, absente').eq('enrollment', ids.enrIun)).data
  assert(audit.length === 1 && audit[0].scutit === true, 'rând audit motivari_absenta scris')

  log(fails === 0 ? '\n✅ TOATE ASSERT-URILE TREC' : `\n❌ ${fails} assert eșuat`)
} catch (e) {
  console.error('✗', e.message); fails++
} finally {
  // cleanup în ordine inversă FK
  if (PRZ.length) await admin.from('prezente').delete().in('id', PRZ)
  await admin.from('motivari_absenta').delete().eq('client', ids.client)
  if (ids.inc) await admin.from('incasari').delete().eq('id', ids.inc)
  if (ids.enrIun) await admin.from('enrollments').delete().eq('id', ids.enrIun)
  if (ids.enrIul) await admin.from('enrollments').delete().eq('id', ids.enrIul)
  if (ids.curs) await admin.from('cursuri').delete().eq('id', ids.curs)
  if (ids.client) await admin.from('clienti').delete().eq('id', ids.client)
  if (ids.familie) await admin.from('familii').delete().eq('id', ids.familie)
  log('✓ cleanup done')
  process.exitCode = fails === 0 ? 0 : 1
}
