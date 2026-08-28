// Test izolat: cancel_expired_reinscrieri() respectă scadența REALĂ a ratei
// (sezoane.scadenta_prima_rata / _ultima_rata), nu „ziua 15". NU lasă date în urmă.
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

const ids = { curs: null, clienti: [], sezoane: [], enr: [] }
const PRET = 300, PROMO = 250

const pad = (n) => String(n).padStart(2, '0')
const today = new Date()
const Y = today.getFullYear(), M = today.getMonth() + 1
const lunaCurenta = `${Y}-${pad(M)}-01`
const lunaUrm = M === 12 ? `${Y + 1}-01-01` : `${Y}-${pad(M + 1)}-01`
const zi = (d) => `${Y}-${pad(M)}-${pad(d)}`
const ieri = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
const peste3 = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)

async function mkSezon(nume, prima, ultima) {
  const r = await admin.from('sezoane').insert({
    numele_sezonului: nume, tip: 'principal', stare: 'planificat',
    data_incepere: zi(5), data_final: `${Y + 1}-06-10`,
    scadenta_prima_rata: prima, scadenta_ultima_rata: ultima,
  }).select('id').single()
  if (r.error) throw new Error('sezon: ' + r.error.message)
  ids.sezoane.push(r.data.id)
  return r.data.id
}
async function mkClient(sufix) {
  const r = await admin.from('clienti').insert({ nume: 'ZZTEST', prenume: `Promo ${sufix}` })
    .select('id').single()
  if (r.error) throw new Error('client: ' + r.error.message)
  ids.clienti.push(r.data.id)
  return r.data.id
}
async function mkInrolare(client, sezon, data) {
  const r = await admin.from('enrollments').insert({
    client, cursul: ids.curs, sezon_id: sezon, tip_plata: 'Per luna',
    suma: PROMO, suma_baza: PROMO, data_incepere: data,
    activ: true, reziliat: false, este_reinscriere: true,
  }).select('id').single()
  if (r.error) throw new Error('inrolare: ' + r.error.message)
  ids.enr.push(r.data.id)
  return r.data.id
}
async function mkIncasare(enr, client, suma) {
  const r = await admin.from('incasari').insert({
    client, inregistrare: enr, suma, metoda: 'Cash', categorie: 'Abonament', data: zi(2),
  }).select('id').single()
  if (r.error) throw new Error('incasare: ' + r.error.message)
  return r.data.id
}
const enrRow = async (id) =>
  (await admin.from('enrollments').select('suma, este_reinscriere, promo_anulat_la').eq('id', id).single()).data

try {
  const curs = await admin.from('cursuri').insert({
    numele: 'ZZTEST Curs Promo Scadenta', zile: ['Luni'],
    pret_lunar: PRET, pret_lunar_promo: PROMO,
  }).select('id').single()
  if (curs.error) throw new Error('curs: ' + curs.error.message)
  ids.curs = curs.data.id

  // Snapshot promo real, ca să dovedim că nu se atinge nimic din producție
  const inainte = (await admin.from('enrollments')
    .select('id, suma, este_reinscriere').eq('este_reinscriere', true).eq('reziliat', false)
    .not('id', 'in', `(${ids.enr.join(',') || '00000000-0000-0000-0000-000000000000'})`)).data ?? []

  // CAZ 1 — prima rată cu scadență în VIITOR (azi e ziua ${M}/${today.getDate()} > 15)
  const s1 = await mkSezon('ZZTEST Sezon prima-rata viitoare', peste3, null)
  const c1 = await mkClient('viitor')
  const e1 = await mkInrolare(c1, s1, lunaCurenta)
  const e1n = await mkInrolare(c1, s1, lunaUrm)

  // CAZ 2 — prima rată cu scadență DEPĂȘITĂ (ieri)
  const s2 = await mkSezon('ZZTEST Sezon prima-rata trecuta', ieri, null)
  const c2 = await mkClient('trecut')
  const e2 = await mkInrolare(c2, s2, lunaCurenta)
  const e2n = await mkInrolare(c2, s2, lunaUrm)

  // CAZ 3 — fără scadențe explicite (ziua 15, deja trecută) dar rata e ACHITATĂ
  const s3 = await mkSezon('ZZTEST Sezon fara scadente', null, null)
  const c3 = await mkClient('achitat')
  const e3 = await mkInrolare(c3, s3, lunaCurenta)
  await mkIncasare(e3, c3, PROMO)

  // CAZ 4 — fără scadențe explicite (ziua 15 trecută), NEACHITAT → fallback ziua 15
  const c4 = await mkClient('neachitat15')
  const e4 = await mkInrolare(c4, s3, lunaCurenta)

  const user = createClient(SB, ANON, { auth: { persistSession: false } })
  const auth = await user.auth.signInWithPassword({
    email: 'claude.qa@quasardance.ro', password: 'QappTest2026!',
  })
  if (auth.error) throw new Error('login admin: ' + auth.error.message)

  const rpc = await user.rpc('cancel_expired_reinscrieri')
  if (rpc.error) throw new Error('rpc: ' + rpc.error.message)
  log(`\ncancel_expired_reinscrieri() → ${rpc.data} rânduri retrogradate\n`)

  log('── CAZ 1: scadența primei rate în viitor (azi > 15) → promo PĂSTRAT')
  const r1 = await enrRow(e1), r1n = await enrRow(e1n)
  assert(Number(r1.suma) === PROMO && r1.este_reinscriere === true, 'rata curentă rămâne pe promo')
  assert(Number(r1n.suma) === PROMO && r1n.este_reinscriere === true, 'rata viitoare rămâne pe promo')
  assert(r1.promo_anulat_la === null, 'promo_anulat_la neatins')

  log('\n── CAZ 2: scadența primei rate depășită → promo ANULAT pe tot restul sezonului')
  const r2 = await enrRow(e2), r2n = await enrRow(e2n)
  assert(Number(r2.suma) === PRET && r2.este_reinscriere === false, 'rata restantă trece pe preț întreg')
  assert(Number(r2n.suma) === PRET && r2n.este_reinscriere === false, 'rata viitoare trece pe preț întreg')
  assert(r2.promo_anulat_la !== null, 'promo_anulat_la marcat (KPI pierderi)')

  log('\n── CAZ 3: fără scadențe pe sezon (ziua 15 trecută) dar ACHITAT → promo PĂSTRAT')
  const r3 = await enrRow(e3)
  assert(Number(r3.suma) === PROMO && r3.este_reinscriere === true, 'plătitorul rămâne pe promo')

  log('\n── CAZ 4: fără scadențe pe sezon (fallback ziua 15, trecută) + neachitat → ANULAT')
  const r4 = await enrRow(e4)
  assert(Number(r4.suma) === PRET && r4.este_reinscriere === false, 'fallback-ul ziua 15 funcționează')

  log('\n── Regresie: înrolările promo REALE nu au fost atinse')
  const dupa = (await admin.from('enrollments')
    .select('id, suma, este_reinscriere').eq('este_reinscriere', true).eq('reziliat', false)).data ?? []
  const realeInainte = inainte.filter((r) => !ids.enr.includes(r.id))
  const dupaMap = new Map(dupa.map((r) => [r.id, r]))
  const atinse = realeInainte.filter((r) => !dupaMap.has(r.id))
  assert(atinse.length === 0, `${realeInainte.length} înrolări promo reale, 0 retrogradate`)

  log('\n── SMS: get_sms_recipients întoarce are_promo')
  const sms = await user.rpc('get_sms_recipients', { p_cod: 'reminder_plata' })
  if (sms.error) throw new Error('get_sms_recipients: ' + sms.error.message)
  assert(Array.isArray(sms.data) && sms.data.every((r) => 'are_promo' in r),
    `coloana are_promo prezentă (${sms.data.length} destinatari)`)
} catch (e) {
  fails++
  log('EROARE:', e.message)
} finally {
  for (const id of ids.enr) {
    await admin.from('incasari').delete().eq('inregistrare', id)
    await admin.from('enrollments').delete().eq('id', id)
  }
  for (const id of ids.clienti) await admin.from('clienti').delete().eq('id', id)
  if (ids.curs) await admin.from('cursuri').delete().eq('id', ids.curs)
  for (const id of ids.sezoane) await admin.from('sezoane').delete().eq('id', id)
  log(`\nCleanup: ${ids.enr.length} înrolări, ${ids.clienti.length} clienți, 1 curs, ${ids.sezoane.length} sezoane șterse`)
  log(fails === 0 ? '\n✅ TOATE TESTELE TRECUTE' : `\n❌ ${fails} eșecuri`)
  process.exit(fails === 0 ? 0 : 1)
}
