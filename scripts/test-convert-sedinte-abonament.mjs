// Test izolat pentru converteste_sedinte_in_abonament. NU lasă date în urmă.
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

const ids = { client: null, familie: null, curs: null }
let fails = 0
const assert = (cond, msg) => { if (cond) log('  ✓', msg); else { fails++; log('  ✗ FAIL:', msg) } }

const now = new Date()
const Y = now.getFullYear(), M = now.getMonth() + 1
const pad = (n) => String(n).padStart(2, '0')
const lunaStart = `${Y}-${pad(M)}-01`
const d = (day) => `${Y}-${pad(M)}-${pad(day)}`
// luna anterioară (gardul de lună: ședințele ei NU trebuie atinse)
const prevY = M === 1 ? Y - 1 : Y, prevM = M === 1 ? 12 : M - 1
const dPrev = `${prevY}-${pad(prevM)}-15`

async function mkSedinta(data, suma = 50) {
  const e = await admin.from('enrollments').insert({
    client: ids.client, cursul: ids.curs, tip_plata: 'Per sedinta',
    suma, suma_baza: suma, data_incepere: data, activ: true, reziliat: false,
  }).select('id').single()
  if (e.error) throw new Error('sedinta: ' + e.error.message)
  return e.data.id
}
async function mkPrezenta(enr, data, status = 'Prezent') {
  const p = await admin.from('prezente').insert({ client: ids.client, enrollment: enr, data, status }).select('id').single()
  if (p.error) throw new Error('prezenta: ' + p.error.message)
  return p.data.id
}
async function mkIncasare(enr, suma, data) {
  const i = await admin.from('incasari').insert({
    client: ids.client, inregistrare: enr, suma, metoda: 'Cash', categorie: 'Abonament', data,
  }).select('id').single()
  if (i.error) throw new Error('incasare: ' + i.error.message)
  return i.data.id
}
async function restOf(enr) {
  const r = (await admin.from('plati_inrolari').select('rest').eq('id_enrollment', enr)).data
  return Array.isArray(r) && r.length ? Number(r[0].rest) : null
}
async function enrRow(id) {
  return (await admin.from('enrollments').select('suma, suma_baza, reziliat, activ, tip_plata, data_incepere').eq('id', id).single()).data
}

try {
  const fam = await admin.from('familii').insert({ nume_familie: 'ZZTEST SedAb (de sters)' }).select('id').single()
  ids.familie = fam.data.id
  const cl = await admin.from('clienti').insert({ nume: 'ZZTEST', prenume: 'SedAb', familia: ids.familie }).select('id').single()
  ids.client = cl.data.id
  const curs = await admin.from('cursuri').insert({
    numele: 'ZZTEST Curs SedAb', zile: ['Luni'], facultativ: true, pret_sedinta: 50, pret_lunar: 200,
  }).select('id').single()
  if (curs.error) throw new Error('curs: ' + curs.error.message)
  ids.curs = curs.data.id

  const user = createClient(SB, ANON, { auth: { persistSession: false } })
  const auth = await user.auth.signInWithPassword({ email: 'claude.qa@quasardance.ro', password: 'QappTest2026!' })
  if (auth.error) throw new Error('login admin: ' + auth.error.message)

  // ── CAZ 1: 3 ședințe în lună (2 plătite) + 1 în luna trecută → abonament 200, de_incasat 100
  log('\n── CAZ 1: 3 ședințe (100 plătiți) → abonament 200, de încasat 100')
  const sPrev = await mkSedinta(dPrev)
  await mkIncasare(sPrev, 50, dPrev)
  await mkPrezenta(sPrev, dPrev)

  const s1 = await mkSedinta(d(7)), s2 = await mkSedinta(d(9)), s3 = await mkSedinta(d(21))
  await mkIncasare(s1, 50, d(7)); await mkIncasare(s2, 50, d(9))
  await mkPrezenta(s1, d(7)); await mkPrezenta(s2, d(9)); await mkPrezenta(s3, d(21))

  const r1 = await user.rpc('converteste_sedinte_in_abonament', {
    p_client: ids.client, p_curs: ids.curs, p_luna: lunaStart,
  })
  if (r1.error) throw new Error('rpc caz1: ' + r1.error.message)
  log('  RPC →', JSON.stringify(r1.data))
  assert(r1.data.converted === true && r1.data.sedinte === 3, 'converted, 3 ședințe (doar luna curentă)')
  assert(Number(r1.data.pret) === 200 && Number(r1.data.platit) === 100, 'preț 200, plătit 100')
  assert(Number(r1.data.de_incasat) === 100 && Number(r1.data.credit) === 0, 'de_incasat=100, credit=0')

  const abo = r1.data.enrollment
  const aboRow = await enrRow(abo)
  assert(aboRow.tip_plata === 'Per luna' && aboRow.data_incepere === lunaStart, 'abonament „Per luna" pe ziua 1 a lunii')
  assert(await restOf(abo) === 100, 'restanța abonamentului = 100 (ședințele plătite au intrat ca avans)')

  for (const [id, nume] of [[s1, 's1'], [s2, 's2'], [s3, 's3']]) {
    const row = await enrRow(id)
    assert(row.reziliat === true && Number(row.suma) === 0 && Number(row.suma_baza) === 0, `${nume}: void curat (reziliat, 0/0)`)
    assert(await restOf(id) === null, `${nume}: dispare din plati_inrolari (fără restanță fantomă)`)
  }
  const prezAbo = (await admin.from('prezente').select('data').eq('enrollment', abo)).data ?? []
  assert(prezAbo.length === 3, '3 prezențe mutate pe abonament')
  const incAbo = (await admin.from('incasari').select('suma').eq('inregistrare', abo)).data ?? []
  assert(incAbo.reduce((a, x) => a + Number(x.suma), 0) === 100, 'încasările ședințelor sunt pe abonament')

  // gardul de lună: ședința din luna trecută rămâne intactă
  const prevRow = await enrRow(sPrev)
  assert(prevRow.reziliat === false && Number(prevRow.suma) === 50, 'ședința din luna anterioară NU e atinsă')
  assert(await restOf(sPrev) === 0, 'ședința din luna anterioară rămâne achitată în luna ei')
  const prezPrev = (await admin.from('prezente').select('id').eq('enrollment', sPrev)).data ?? []
  assert(prezPrev.length === 1, 'prezența din luna anterioară rămâne pe ședința ei')

  // ── CAZ 2: al doilea apel → refuz (abonament deja pe lună)
  log('\n── CAZ 2: al doilea apel pe aceeași lună → refuzat')
  const s4 = await mkSedinta(d(23))
  const r2 = await user.rpc('converteste_sedinte_in_abonament', {
    p_client: ids.client, p_curs: ids.curs, p_luna: lunaStart,
  })
  assert(Boolean(r2.error) && /abonament activ pe luna/i.test(r2.error?.message ?? ''), 'eroare „există deja abonament activ pe lună"')
  assert((await enrRow(s4)).reziliat === false, 'ședința nouă a rămas neatinsă după refuz')

  // ── CAZ 3: fără ședințe în lună → refuz explicit
  log('\n── CAZ 3: nicio ședință în lună → refuzat')
  await admin.from('enrollments').update({ reziliat: true, activ: false }).eq('id', s4)
  await admin.from('enrollments').delete().eq('id', abo)
  const r3 = await user.rpc('converteste_sedinte_in_abonament', {
    p_client: ids.client, p_curs: ids.curs, p_luna: lunaStart,
  })
  assert(Boolean(r3.error) && /Nicio ședință activă/i.test(r3.error?.message ?? ''), 'eroare „nicio ședință activă în lună"')

  // ── CAZ 4: ședințe plătite peste prețul lunii → credit
  log('\n── CAZ 4: 5 ședințe plătite (250) → credit 50')
  for (const day of [2, 4, 6, 8, 10]) {
    const s = await mkSedinta(d(day))
    await mkIncasare(s, 50, d(day))
  }
  const r4 = await user.rpc('converteste_sedinte_in_abonament', {
    p_client: ids.client, p_curs: ids.curs, p_luna: lunaStart,
  })
  if (r4.error) throw new Error('rpc caz4: ' + r4.error.message)
  log('  RPC →', JSON.stringify(r4.data))
  assert(Number(r4.data.platit) === 250 && Number(r4.data.credit) === 50 && Number(r4.data.de_incasat) === 0, 'credit=50, de_incasat=0')
  assert(await restOf(r4.data.enrollment) === -50, 'sold în favoare -50 pe abonament')

  log(fails === 0 ? '\n✅ TOATE ASSERT-URILE TREC' : `\n❌ ${fails} assert eșuat`)
} catch (e) {
  console.error('✗', e.message); fails++
} finally {
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
