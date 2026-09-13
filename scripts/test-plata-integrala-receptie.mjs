// Plata integrală a sezonului (−5%) încasată la RECEPȚIE — plan + încasare + refuzuri.
// Nu lasă date în urmă. Rulează: node scripts/test-plata-integrala-receptie.mjs
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

const ids = { familii: [], clienti: [], curs: null, enr: [] }

const mkFamilie = async (nume) => {
  const { data, error } = await admin.from('familii')
    .insert({ nume_familie: `ZZTEST ${nume} (de sters)` }).select('id').single()
  if (error) throw new Error('familie: ' + error.message)
  ids.familii.push(data.id)
  return data.id
}

const mkClient = async (nume, familia) => {
  const { data, error } = await admin.from('clienti')
    .insert({ nume: 'ZZTEST', prenume: nume, familia }).select('id').single()
  if (error) throw new Error('client: ' + error.message)
  ids.clienti.push(data.id)
  return data.id
}

// 10 rate lunare, ca un contract de sezon real (sept → iunie, ziua 1).
const mkSezonComplet = async (client, rata) => {
  const luni = []
  for (let i = 0; i < 10; i++) {
    const d = new Date(Date.UTC(2026, 8 + i, 1))
    luni.push(d.toISOString().slice(0, 10))
  }
  const rows = luni.map((luna) => ({
    client, cursul: ids.curs, tip_plata: 'Per luna',
    suma: rata, suma_baza: rata, data_incepere: luna, activ: true, reziliat: false,
  }))
  const { data, error } = await admin.from('enrollments').insert(rows).select('id')
  if (error) throw new Error('enrollments: ' + error.message)
  ids.enr.push(...data.map((r) => r.id))
  return data.map((r) => r.id)
}

const incasariPe = async (client) => {
  const { data } = await admin.from('incasari').select('suma, metoda, observatii').eq('client', client)
  return data ?? []
}

try {
  const sezon = await admin.from('sezoane').select('id, numele_sezonului, scadenta_plata_integrala')
    .eq('activ', true).order('data_incepere', { ascending: false }).limit(1).single()
  if (sezon.error) throw new Error('sezon: ' + sezon.error.message)
  const locatie = await admin.from('locatii').select('id, nume').limit(1).single()
  if (locatie.error) throw new Error('locatie: ' + locatie.error.message)
  log(`Sezon activ: ${sezon.data.numele_sezonului} · termen plată integrală ${sezon.data.scadenta_plata_integrala}`)

  const curs = await admin.from('cursuri').insert({
    numele: 'ZZTEST Curs Integral', facultativ: false,
    pret_lunar: 290, pret_anual: 2900, sezon: sezon.data.id, locatie: locatie.data.id,
  }).select('id').single()
  if (curs.error) throw new Error('curs: ' + curs.error.message)
  ids.curs = curs.data.id

  const user = createClient(SB, ANON, { auth: { persistSession: false } })
  const auth = await user.auth.signInWithPassword({ email: 'claude.qa@quasardance.ro', password: 'QappTest2026!' })
  if (auth.error) throw new Error('login admin: ' + auth.error.message)

  // ── CAZ 1: planul ────────────────────────────────────────────────────────────
  log('\n── CAZ 1: planul de plată integrală (10 × 290)')
  const c1 = await mkClient('Integral', await mkFamilie('Integral'))
  await mkSezonComplet(c1, 290)
  const plan = (await user.rpc('plan_plata_integrala_staff', { p_client: c1 })).data
  assert(plan?.eligibil === true, 'eligibil')
  assert(near(plan.total_curent, 2900), `total curent 2900 (primit ${plan?.total_curent})`)
  assert(near(plan.total_plata, 2755), `de plată 2755 (primit ${plan?.total_plata})`)
  assert(near(plan.discount, 145), `discount exact 5% din contract = 145 (primit ${plan?.discount})`)
  assert(plan.luni === 10, `10 rate (primit ${plan?.luni})`)
  const plati = (plan.plan ?? []).map((p) => Number(p.pay))
  assert(near(plati[0], 280), `prima rată absoarbe rotunjirea: 280 (primit ${plati[0]})`)
  assert(plati.slice(1).every((p) => near(p, 275)), 'restul ratelor 275')
  assert(near(plati.reduce((a, b) => a + b, 0), 2755), 'suma ratelor = 2755')

  // ── CAZ 2: încasarea ─────────────────────────────────────────────────────────
  log('\n── CAZ 2: încasare Cash integral')
  const res = (await user.rpc('incaseaza_plata_integrala_sezon', {
    p_client: c1, p_tenders: [{ metoda: 'Cash', suma: 2755 }],
    p_data: new Date().toISOString().slice(0, 10), p_locatie: locatie.data.id,
  }))
  assert(!res.error, `RPC fără eroare${res.error ? ': ' + res.error.message : ''}`)
  assert(res.data?.rate === 10, `10 rate atinse (primit ${res.data?.rate})`)
  const inc = await incasariPe(c1)
  assert(near(inc.reduce((a, i) => a + Number(i.suma), 0), 2755), 'încasat exact 2755')
  assert(inc.every((i) => i.metoda === 'Cash'), 'toate încasările Cash')
  assert(inc.every((i) => (i.observatii ?? '').includes('integrală')), 'observație de plată integrală')
  const { data: enr } = await admin.from('enrollments')
    .select('suma, discount_integral').eq('client', c1)
  assert(near(enr.reduce((a, e) => a + Number(e.suma), 0), 2755), 'prețul rândurilor rescris la 2755')
  assert(enr.filter((e) => Number(e.discount_integral) > 0).length === 10, 'discount_integral scris pe toate rândurile')
  const { data: rest } = await admin.from('plati_inrolari').select('rest').in('id_enrollment', ids.enr)
  assert((rest ?? []).every((r) => near(r.rest, 0)), 'rest 0 pe toate ratele — sezonul e achitat')

  // ── CAZ 3: a doua oară ───────────────────────────────────────────────────────
  log('\n── CAZ 3: reluarea aceleiași plăți')
  const dublu = await user.rpc('incaseaza_plata_integrala_sezon', {
    p_client: c1, p_tenders: [{ metoda: 'Cash', suma: 2755 }], p_locatie: locatie.data.id,
  })
  assert(Boolean(dublu.error), 'a doua încasare e refuzată (sezonul nu mai e neatins)')
  const plan2 = (await user.rpc('plan_plata_integrala_staff', { p_client: c1 })).data
  assert(plan2?.eligibil === false, 'oferta dispare după prima plată')

  // ── CAZ 4: mixt Cash + Card ──────────────────────────────────────────────────
  log('\n── CAZ 4: mixt (1000 Cash + 1755 Card)')
  const c2 = await mkClient('IntegralMixt', await mkFamilie('Mixt'))
  await mkSezonComplet(c2, 290)
  const mix = await user.rpc('incaseaza_plata_integrala_sezon', {
    p_client: c2,
    p_tenders: [{ metoda: 'Cash', suma: 1000 }, { metoda: 'Card', suma: 1755 }],
    p_locatie: locatie.data.id,
  })
  assert(!mix.error, `mixt fără eroare${mix.error ? ': ' + mix.error.message : ''}`)
  const inc2 = await incasariPe(c2)
  assert(near(inc2.reduce((a, i) => a + Number(i.suma), 0), 2755), 'mixt: total încasat 2755')
  assert(near(inc2.filter((i) => i.metoda === 'Cash').reduce((a, i) => a + Number(i.suma), 0), 1000), 'mixt: 1000 pe Cash')
  assert(near(inc2.filter((i) => i.metoda === 'Card').reduce((a, i) => a + Number(i.suma), 0), 1755), 'mixt: 1755 pe Card')

  // ── CAZ 5: sume care nu se potrivesc + apel anonim ────────────────────────────
  log('\n── CAZ 5: garduri')
  const c3 = await mkClient('IntegralGard', await mkFamilie('Gard'))
  await mkSezonComplet(c3, 290)
  const putin = await user.rpc('incaseaza_plata_integrala_sezon', {
    p_client: c3, p_tenders: [{ metoda: 'Cash', suma: 2000 }], p_locatie: locatie.data.id,
  })
  assert(Boolean(putin.error), 'suma sub plan e refuzată')
  const faraLoc = await user.rpc('incaseaza_plata_integrala_sezon', {
    p_client: c3, p_tenders: [{ metoda: 'Cash', suma: 2755 }],
  })
  assert(Boolean(faraLoc.error), 'fără locație de lucru e refuzată')
  const anon = createClient(SB, ANON, { auth: { persistSession: false } })
  const anonRes = await anon.rpc('plan_plata_integrala_staff', { p_client: c3 })
  assert(Boolean(anonRes.error), 'apelul anonim nu are voie să vadă planul')

  // ── CAZ 6: reducerile nu se cumulează ────────────────────────────────────────
  log('\n── CAZ 6: frate cu −10% de familie — reducerile nu se cumulează')
  const famFrati = await mkFamilie('Frati')
  const f1 = await mkClient('FrateUnu', famFrati)
  await mkSezonComplet(f1, 290)
  const f2 = await mkClient('FrateDoi', famFrati)
  await mkSezonComplet(f2, 290)
  const planF1 = (await user.rpc('plan_plata_integrala_staff', { p_client: f1 })).data
  const planF2 = (await user.rpc('plan_plata_integrala_staff', { p_client: f2 })).data
  const cuFamilie = [planF1, planF2].find((p) => near(p.total_curent, 2610))
  const fara = [planF1, planF2].find((p) => near(p.total_curent, 2900))
  assert(Boolean(cuFamilie), 'un frate are deja −10% de familie (2610)')
  assert(Boolean(fara), 'celălalt rămâne la preț întreg (2900)')
  assert(cuFamilie && near(cuFamilie.total_plata, 2610) && near(cuFamilie.discount, 0),
    `fratele cu −10% NU primește și −5% (plan ${cuFamilie?.total_plata}, discount ${cuFamilie?.discount})`)
  assert(fara && near(fara.total_plata, 2755),
    `fratele fără reducere primește −5% (plan ${fara?.total_plata})`)
} finally {
  // curățenie
  for (const c of ids.clienti) {
    await admin.from('incasari').delete().eq('client', c)
  }
  if (ids.enr.length) await admin.from('enrollments').delete().in('id', ids.enr)
  for (const c of ids.clienti) await admin.from('clienti').delete().eq('id', c)
  if (ids.curs) await admin.from('cursuri').delete().eq('id', ids.curs)
  for (const f of ids.familii) await admin.from('familii').delete().eq('id', f)
  log('\nCurățenie: date de test șterse.')
}

log(fails === 0 ? '\n✅ Toate verificările au trecut.' : `\n❌ ${fails} verificări eșuate.`)
process.exit(fails === 0 ? 0 : 1)
