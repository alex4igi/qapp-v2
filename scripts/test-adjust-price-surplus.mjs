// Test izolat pentru adjust_enrollment_price (surplus: allocate/refund/credit + fix suma_baza).
// NU lasă date în urmă. Rulează: node scripts/test-adjust-price-surplus.mjs
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

let fails = 0
const assert = (cond, msg) => { if (cond) log('  ✓', msg); else { fails++; log('  ✗ FAIL:', msg) } }
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.01

const ids = { familie: null, client: null, cursA: null, cursB: null, datorie: null, enr: [] }
const paidOf = async (enrId) => {
  const { data } = await admin.from('incasari').select('suma').eq('inregistrare', enrId)
  return (data ?? []).reduce((a, i) => a + Number(i.suma), 0)
}
const datoriePaid = async (datId) => {
  const { data } = await admin.from('incasari').select('suma').eq('datorie', datId)
  return (data ?? []).reduce((a, i) => a + Number(i.suma), 0)
}
const mkEnr = async (curs, luna, suma) => {
  const { data, error } = await admin.from('enrollments').insert({
    client: ids.client, cursul: curs, tip_plata: 'Per luna',
    suma, suma_baza: suma, data_incepere: luna, activ: true, reziliat: false,
  }).select('id').single()
  if (error) throw new Error('mkEnr: ' + error.message)
  ids.enr.push(data.id)
  return data.id
}
const payEnr = async (enrId, suma) => {
  const { error } = await admin.from('incasari').insert({
    client: ids.client, inregistrare: enrId, data: '2026-06-14', suma, metoda: 'Card', categorie: 'Abonament',
  })
  if (error) throw new Error('payEnr: ' + error.message)
}

try {
  const fam = await admin.from('familii').insert({ nume_familie: 'ZZTEST Surplus (de sters)' }).select('id').single()
  ids.familie = fam.data.id
  const cl = await admin.from('clienti').insert({ nume: 'ZZTEST', prenume: 'Surplus', familia: ids.familie }).select('id').single()
  ids.client = cl.data.id
  const ca = await admin.from('cursuri').insert({ numele: 'ZZTEST Curs A', facultativ: false }).select('id').single()
  ids.cursA = ca.data.id
  const cb = await admin.from('cursuri').insert({ numele: 'ZZTEST Curs B', facultativ: false }).select('id').single()
  ids.cursB = cb.data.id

  // client autentificat (admin) pentru guard-ul RPC
  const user = createClient(SB, ANON, { auth: { persistSession: false } })
  const auth = await user.auth.signInWithPassword({ email: 'claude.qa@quasardance.ro', password: 'QappTest2026!' })
  if (auth.error) throw new Error('login admin: ' + auth.error.message)
  const call = async (args) => {
    const { data, error } = await user.rpc('adjust_enrollment_price', args)
    if (error) throw new Error('rpc: ' + error.message)
    return data
  }

  // ── A) allocate → înrolare ──────────────────────────────────────────────
  log('\nA) Alocare surplus la altă înrolare')
  const srcA = await mkEnr(ids.cursA, '2026-06-01', 260); await payEnr(srcA, 260)
  const tgtA = await mkEnr(ids.cursB, '2026-07-01', 260) // țintă neplătită
  const rA = await call({ p_enrollment: srcA, p_new_suma: 190, p_motiv: 'test A', p_surplus_action: 'allocate', p_target_type: 'enrollment', p_target_id: tgtA })
  assert(near(rA.surplus, 70) && near(rA.moved, 70) && near(rA.credit_left, 0), `result surplus/moved/credit = 70/70/0 (${JSON.stringify(rA)})`)
  assert(near(await paidOf(srcA), 190), 'sursa A: plătit 190')
  assert(near(await paidOf(tgtA), 70), 'ținta A: plătit 70')
  const eA = (await admin.from('enrollments').select('suma, suma_baza').eq('id', srcA).single()).data
  assert(near(eA.suma, 190) && near(eA.suma_baza, 190), 'sursa A: suma=suma_baza=190 (invariant reparat)')

  // ── B) allocate → datorie one-off (bilet/merch) ─────────────────────────
  log('\nB) Alocare surplus la o datorie one-off (Merch)')
  const srcB = await mkEnr(ids.cursA, '2026-05-01', 260); await payEnr(srcB, 260)
  const dat = await admin.from('datorii').insert({ client: ids.client, categorie: 'Merch', descriere: 'ZZTEST tricou', suma_datorata: 100 }).select('id').single()
  ids.datorie = dat.data.id
  const rB = await call({ p_enrollment: srcB, p_new_suma: 200, p_motiv: 'test B', p_surplus_action: 'allocate', p_target_type: 'datorie', p_target_id: ids.datorie })
  assert(near(rB.surplus, 60) && near(rB.moved, 60), `result surplus/moved = 60/60 (${JSON.stringify(rB)})`)
  assert(near(await paidOf(srcB), 200), 'sursa B: plătit 200')
  assert(near(await datoriePaid(ids.datorie), 60), 'datoria: plătit 60')
  const incB = (await admin.from('incasari').select('categorie').eq('datorie', ids.datorie).single()).data
  assert(incB.categorie === 'Merch', 'încasarea mutată pe datorie are categoria Merch')

  // ── C) credit (rămâne pe rând, vizibil) ─────────────────────────────────
  log('\nC) Lasă drept credit în cont')
  const srcC = await mkEnr(ids.cursA, '2026-04-01', 260); await payEnr(srcC, 260)
  const rC = await call({ p_enrollment: srcC, p_new_suma: 190, p_motiv: 'test C', p_surplus_action: 'credit' })
  assert(near(rC.surplus, 70) && near(rC.credit_left, 70) && near(rC.moved, 0), `result surplus/credit_left = 70/70 (${JSON.stringify(rC)})`)
  assert(near(await paidOf(srcC), 260), 'sursa C: plătit rămâne 260')
  const piC = (await admin.from('plati_inrolari').select('rest').eq('id_enrollment', srcC).single()).data
  assert(near(piC.rest, -70), 'sursa C: rest = -70 (credit vizibil)')
  const eC = (await admin.from('enrollments').select('suma_baza').eq('id', srcC).single()).data
  assert(near(eC.suma_baza, 190), 'sursa C: suma_baza=190 (invariant reparat)')

  // ── D) refund (încasare negativă) ───────────────────────────────────────
  log('\nD) Restituire bani')
  const srcD = await mkEnr(ids.cursA, '2026-03-01', 260); await payEnr(srcD, 260)
  const rD = await call({ p_enrollment: srcD, p_new_suma: 190, p_motiv: 'test D', p_surplus_action: 'refund' })
  assert(near(rD.refunded, 70), `result refunded = 70 (${JSON.stringify(rD)})`)
  assert(near(await paidOf(srcD), 190), 'sursa D: net plătit 190 (după credit note -70)')
  const piD = (await admin.from('plati_inrolari').select('rest').eq('id_enrollment', srcD).single()).data
  assert(near(piD.rest, 0), 'sursa D: rest = 0')
  const negD = (await admin.from('incasari').select('suma').eq('inregistrare', srcD).lt('suma', 0)).data
  assert((negD ?? []).length === 1 && near(negD[0].suma, -70), 'sursa D: există o încasare -70 (restituire)')

  log(`\n${fails === 0 ? '✅ TOATE OK' : '❌ ' + fails + ' FAIL'}`)
} catch (e) {
  fails++
  console.error('EROARE:', e.message)
} finally {
  // cleanup (incasari → datorii → enrollments → cursuri → client → familie)
  for (const enrId of ids.enr) await admin.from('incasari').delete().eq('inregistrare', enrId)
  if (ids.datorie) { await admin.from('incasari').delete().eq('datorie', ids.datorie); await admin.from('datorii').delete().eq('id', ids.datorie) }
  await admin.from('incasari').delete().eq('client', ids.client)
  for (const enrId of ids.enr) await admin.from('enrollments').delete().eq('id', enrId)
  if (ids.cursA) await admin.from('cursuri').delete().eq('id', ids.cursA)
  if (ids.cursB) await admin.from('cursuri').delete().eq('id', ids.cursB)
  if (ids.client) await admin.from('clienti').delete().eq('id', ids.client)
  if (ids.familie) await admin.from('familii').delete().eq('id', ids.familie)
  log('cleanup: gata')
  process.exit(fails === 0 ? 0 : 1)
}
