// Test izolat pentru use_client_credit (folosește creditul existent: allocate / refund).
// NU lasă date în urmă. Rulează: node scripts/test-use-credit.mjs
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

const ids = { familie: null, client: null, cursA: null, cursB: null, enr: [] }
const paidOf = async (enrId) => {
  const { data } = await admin.from('incasari').select('suma').eq('inregistrare', enrId)
  return (data ?? []).reduce((a, i) => a + Number(i.suma), 0)
}
const restOf = async (enrId) => (await admin.from('plati_inrolari').select('rest').eq('id_enrollment', enrId).single()).data?.rest
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
  const fam = await admin.from('familii').insert({ nume_familie: 'ZZTEST UseCredit (de sters)' }).select('id').single()
  ids.familie = fam.data.id
  const cl = await admin.from('clienti').insert({ nume: 'ZZTEST', prenume: 'UseCredit', familia: ids.familie }).select('id').single()
  ids.client = cl.data.id
  const ca = await admin.from('cursuri').insert({ numele: 'ZZTEST UC A', facultativ: false }).select('id').single()
  ids.cursA = ca.data.id
  const cb = await admin.from('cursuri').insert({ numele: 'ZZTEST UC B', facultativ: false }).select('id').single()
  ids.cursB = cb.data.id

  const user = createClient(SB, ANON, { auth: { persistSession: false } })
  const auth = await user.auth.signInWithPassword({ email: 'claude.qa@quasardance.ro', password: 'QappTest2026!' })
  if (auth.error) throw new Error('login admin: ' + auth.error.message)
  const adjust = async (args) => { const { data, error } = await user.rpc('adjust_enrollment_price', args); if (error) throw new Error('adjust: ' + error.message); return data }
  const useCredit = async (args) => { const { data, error } = await user.rpc('use_client_credit', args); if (error) throw new Error('use_credit: ' + error.message); return data }

  // ── E) folosire credit → alocare la altă înrolare ───────────────────────
  log('\nE) Folosește credit → alocă la altă înrolare')
  const srcE = await mkEnr(ids.cursA, '2026-06-01', 260); await payEnr(srcE, 260)
  await adjust({ p_enrollment: srcE, p_new_suma: 190, p_motiv: 'setup E', p_surplus_action: 'credit' }) // credit 70
  assert(near(await restOf(srcE), -70), 'setup: srcE are credit -70')
  const tgtE = await mkEnr(ids.cursB, '2026-07-01', 260)
  const rE = await useCredit({ p_client: ids.client, p_amount: 70, p_action: 'allocate', p_target_type: 'enrollment', p_target_id: tgtE })
  assert(near(rE.used, 70) && near(rE.remaining_credit, 0), `used/remaining = 70/0 (${JSON.stringify(rE)})`)
  assert(near(await restOf(srcE), 0), 'srcE: credit consumat (rest 0)')
  assert(near(await paidOf(tgtE), 70), 'tgtE: plătit 70')

  // ── F) folosire credit → restituire ─────────────────────────────────────
  log('\nF) Folosește credit → restituire')
  const srcF = await mkEnr(ids.cursA, '2026-05-01', 260); await payEnr(srcF, 260)
  await adjust({ p_enrollment: srcF, p_new_suma: 190, p_motiv: 'setup F', p_surplus_action: 'credit' }) // credit 70
  assert(near(await restOf(srcF), -70), 'setup: srcF are credit -70')
  const rF = await useCredit({ p_client: ids.client, p_amount: 70, p_action: 'refund' })
  assert(near(rF.used, 70), `used = 70 (${JSON.stringify(rF)})`)
  assert(near(await restOf(srcF), 0), 'srcF: rest 0 după restituire')
  const negF = (await admin.from('incasari').select('suma, observatii').eq('inregistrare', srcF).lt('suma', 0)).data
  assert((negF ?? []).length === 1 && near(negF[0].suma, -70), 'srcF: încasare -70 (restituire credit)')

  // ── G) capare la restul țintei ──────────────────────────────────────────
  log('\nG) Alocare capată la restul țintei')
  const srcG = await mkEnr(ids.cursA, '2026-04-01', 260); await payEnr(srcG, 260)
  await adjust({ p_enrollment: srcG, p_new_suma: 190, p_motiv: 'setup G', p_surplus_action: 'credit' }) // credit 70
  const tgtG = await mkEnr(ids.cursB, '2026-08-01', 20) // rest doar 20
  const rG = await useCredit({ p_client: ids.client, p_amount: 70, p_action: 'allocate', p_target_type: 'enrollment', p_target_id: tgtG })
  assert(near(rG.used, 20), `used capat la 20 (${JSON.stringify(rG)})`)
  assert(near(await paidOf(tgtG), 20) && near(await restOf(tgtG), 0), 'tgtG: plătit 20, rest 0')
  assert(near(await restOf(srcG), -50), 'srcG: rămâne credit -50')

  log(`\n${fails === 0 ? '✅ TOATE OK' : '❌ ' + fails + ' FAIL'}`)
} catch (e) {
  fails++
  console.error('EROARE:', e.message)
} finally {
  await admin.from('incasari').delete().eq('client', ids.client)
  for (const enrId of ids.enr) await admin.from('enrollments').delete().eq('id', enrId)
  if (ids.cursA) await admin.from('cursuri').delete().eq('id', ids.cursA)
  if (ids.cursB) await admin.from('cursuri').delete().eq('id', ids.cursB)
  if (ids.client) await admin.from('clienti').delete().eq('id', ids.client)
  if (ids.familie) await admin.from('familii').delete().eq('id', ids.familie)
  log('cleanup: gata')
  process.exit(fails === 0 ? 0 : 1)
}
