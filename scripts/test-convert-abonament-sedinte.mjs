// Test izolat pentru converteste_abonament_in_sedinte. NU lasă date în urmă.
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

const created = { enr: [], inc: [], prez: [] }
const ids = { client: null, familie: null, curs: null }
let fails = 0
const assert = (cond, msg) => { if (cond) log('  ✓', msg); else { fails++; log('  ✗ FAIL:', msg) } }

// luna curentă (RPC folosește luna abonamentului = luna curentă în UI)
const now = new Date()
const Y = now.getFullYear(), M = String(now.getMonth() + 1).padStart(2, '0')
const lunaStart = `${Y}-${M}-01`
const d1 = `${Y}-${M}-07`  // ședință prezentă 1
const d2 = `${Y}-${M}-09`  // ședință prezentă 2

async function mkAbonament(suma) {
  const e = await admin.from('enrollments').insert({
    client: ids.client, cursul: ids.curs, tip_plata: 'Per luna',
    suma, suma_baza: suma, data_incepere: lunaStart, data_final: `${Y}-${M}-28`, activ: true, reziliat: false,
  }).select('id').single()
  if (e.error) throw new Error('abonament: ' + e.error.message)
  created.enr.push(e.data.id)
  return e.data.id
}
async function mkPrezenta(enr, data, status = 'Prezent') {
  const p = await admin.from('prezente').insert({ client: ids.client, enrollment: enr, data, status }).select('id').single()
  if (p.error) throw new Error('prezenta: ' + p.error.message)
  created.prez.push(p.data.id)
  return p.data.id
}
async function mkIncasare(enr, suma) {
  const i = await admin.from('incasari').insert({
    client: ids.client, inregistrare: enr, suma, metoda: 'Cash', categorie: 'Abonament', data: lunaStart,
  }).select('id').single()
  if (i.error) throw new Error('incasare: ' + i.error.message)
  created.inc.push(i.data.id)
  return i.data.id
}
// rest din plati_inrolari pentru un enrollment
async function restOf(enr) {
  const r = (await admin.from('plati_inrolari').select('rest').eq('id_enrollment', enr)).data
  return Array.isArray(r) && r.length ? Number(r[0].rest) : null
}
// enrollments Per sedinta nereziliate ale clientului pe curs, cu suma + platit
async function sedinteRows() {
  const rows = (await admin.from('enrollments')
    .select('id, data_incepere, suma, tip_plata, reziliat')
    .eq('client', ids.client).eq('cursul', ids.curs).eq('tip_plata', 'Per sedinta').eq('reziliat', false)).data ?? []
  for (const r of rows) {
    const inc = (await admin.from('incasari').select('suma').eq('inregistrare', r.id)).data ?? []
    r.platit = inc.reduce((a, x) => a + Number(x.suma), 0)
  }
  return rows
}

try {
  const fam = await admin.from('familii').insert({ nume_familie: 'ZZTEST AbSed (de sters)' }).select('id').single()
  ids.familie = fam.data.id
  const cl = await admin.from('clienti').insert({ nume: 'ZZTEST', prenume: 'AbSed', familia: ids.familie }).select('id').single()
  ids.client = cl.data.id
  const curs = await admin.from('cursuri').insert({
    numele: 'ZZTEST Curs AbSed', zile: ['Luni'], facultativ: true, pret_sedinta: 50, pret_lunar: 200,
  }).select('id').single()
  if (curs.error) throw new Error('curs: ' + curs.error.message)
  ids.curs = curs.data.id

  const user = createClient(SB, ANON, { auth: { persistSession: false } })
  const auth = await user.auth.signInWithPassword({ email: 'claude.qa@quasardance.ro', password: 'QappTest2026!' })
  if (auth.error) throw new Error('login admin: ' + auth.error.message)

  // ── CAZ 1: abonament ACHITAT 200, 2 ședințe prezente → 2 rânduri Per sedinta, credit 100
  log('\n── CAZ 1: achitat 200 + 2 prezente → credit 100')
  const ab1 = await mkAbonament(200)
  await mkPrezenta(ab1, d1); await mkPrezenta(ab1, d2)
  await mkIncasare(ab1, 200)
  const r1 = await user.rpc('converteste_abonament_in_sedinte', { p_abonament: ab1 })
  if (r1.error) throw new Error('rpc caz1: ' + r1.error.message)
  log('  RPC →', JSON.stringify(r1.data))
  assert(r1.data.converted === true && r1.data.sedinte === 2, 'converted, 2 ședințe')
  assert(Number(r1.data.credit) === 100 && Number(r1.data.datorie) === 0, 'credit=100, datorie=0')
  const ab1After = (await admin.from('enrollments').select('reziliat, suma, suma_baza').eq('id', ab1).single()).data
  assert(ab1After.reziliat === true && Number(ab1After.suma) === 0 && Number(ab1After.suma_baza) === 0, 'abonament void curat (reziliat, 0/0)')
  assert(await restOf(ab1) === null, 'abonament dispare din plati_inrolari (fără restanță fantomă)')
  const rows1 = await sedinteRows()
  assert(rows1.length === 2, '2 rânduri Per sedinta create')
  assert(rows1.every((r) => [d1, d2].includes(r.data_incepere)), 'rândurile au datele ședințelor prezente')
  const rests1 = await Promise.all(rows1.map((r) => restOf(r.id)))
  const totalRest1 = rests1.reduce((a, x) => a + (x ?? 0), 0)
  assert(totalRest1 === -100, `sold total pe ședințe = -100 (credit); actual ${totalRest1}`)
  assert(!rests1.some((x) => (x ?? 0) > 0), `niciun rând cu restanță falsă (rests ${rests1})`)
  // prezențele s-au mutat pe rândurile noi (niciuna rămasă pe abonament)
  const prezAb1 = (await admin.from('prezente').select('id').eq('enrollment', ab1)).data ?? []
  assert(prezAb1.length === 0, 'prezențele nu mai sunt pe abonament (mutate pe ședințe)')

  // idempotență
  const r1b = await user.rpc('converteste_abonament_in_sedinte', { p_abonament: ab1 })
  assert(!r1b.error && r1b.data.already_converted === true, 'al doilea apel → already_converted=true')

  // ── CAZ 2: abonament NEACHITAT, 2 prezente → 2 rânduri cu datorie 100
  log('\n── CAZ 2: neachitat + 2 prezente → datorie 100')
  const ab2 = await mkAbonament(200)
  await mkPrezenta(ab2, d1); await mkPrezenta(ab2, d2)
  const r2 = await user.rpc('converteste_abonament_in_sedinte', { p_abonament: ab2 })
  if (r2.error) throw new Error('rpc caz2: ' + r2.error.message)
  log('  RPC →', JSON.stringify(r2.data))
  assert(r2.data.sedinte === 2 && Number(r2.data.datorie) === 100 && Number(r2.data.credit) === 0, 'datorie=100, credit=0')
  const rows2 = (await sedinteRows()).filter((r) => ![...rows1.map((x) => x.id)].includes(r.id))
  assert(rows2.length === 2, '2 rânduri Per sedinta noi')
  const rests2 = await Promise.all(rows2.map((r) => restOf(r.id)))
  assert(rests2.every((x) => x === 50), `fiecare ședință are restanță 50 (actual ${rests2})`)

  // ── CAZ 4: 0 prezente + NEACHITAT → void curat, reziliat
  // (rulat înaintea CAZ 3 ca să nu coliziune cu abonamentul non-reziliat din CAZ 3
  //  pe indexul uq_enrollment_client_curs_data — aceeași lună/curs/client)
  log('\n── CAZ 4: neachitat + 0 prezente → void curat')
  const ab4 = await mkAbonament(200)
  const r4 = await user.rpc('converteste_abonament_in_sedinte', { p_abonament: ab4 })
  if (r4.error) throw new Error('rpc caz4: ' + r4.error.message)
  const ab4After = (await admin.from('enrollments').select('reziliat, suma').eq('id', ab4).single()).data
  assert(ab4After.reziliat === true && Number(ab4After.suma) === 0, '0 ședințe + neplătit → reziliat curat')
  assert(await restOf(ab4) === null, 'nu apare în plati_inrolari (fără datorie)')

  // ── CAZ 3: 0 ședințe prezente + achitat → repriced la 0, NEreziliat (credit rămâne)
  log('\n── CAZ 3: achitat 200 + 0 prezente → credit, ne-reziliat')
  const ab3 = await mkAbonament(200)
  await mkIncasare(ab3, 200)
  const r3 = await user.rpc('converteste_abonament_in_sedinte', { p_abonament: ab3 })
  if (r3.error) throw new Error('rpc caz3: ' + r3.error.message)
  log('  RPC →', JSON.stringify(r3.data))
  assert(r3.data.sedinte === 0 && Number(r3.data.credit) === 200 && Number(r3.data.total_charged) === 0, 'sedinte=0, total=0, credit=200')
  const ab3After = (await admin.from('enrollments').select('reziliat, suma, suma_baza').eq('id', ab3).single()).data
  assert(ab3After.reziliat === false && Number(ab3After.suma) === 0, '0 ședințe + plătit → NEreziliat, suma=0')
  assert(await restOf(ab3) === -200, 'sold în favoare -200 pe abonament (credit)')

  log(fails === 0 ? '\n✅ TOATE ASSERT-URILE TREC' : `\n❌ ${fails} assert eșuat`)
} catch (e) {
  console.error('✗', e.message); fails++
} finally {
  // cleanup: toate enrollments/incasari/prezente ale clientului (inclusiv rândurile create de RPC)
  if (ids.client) {
    await admin.from('incasari').delete().eq('client', ids.client)
    await admin.from('prezente').delete().eq('client', ids.client)
    await admin.from('enrollments').delete().eq('client', ids.client)
  }
  if (ids.curs) await admin.from('cursuri').delete().eq('id', ids.curs)
  if (ids.client) await admin.from('clienti').delete().eq('id', ids.client)
  if (ids.familie) await admin.from('familii').delete().eq('id', ids.familie)
  log('✓ cleanup done')
  process.exitCode = fails === 0 ? 0 : 1
}
