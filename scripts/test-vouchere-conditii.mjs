// Vouchere activate + condiții verificate în DB (migrațiile 20260914170000 și 20260914201500).
// Acoperă: lista pentru recepție, rezervarea OPEN cu voucher, gardurile pe enrollments/incasari,
// „o singură rată lunară per voucher”, validate_voucher_code (portal) și excepția webhook-ului.
// Nu lasă date în urmă.
// Rulează: node scripts/test-vouchere-conditii.mjs
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

const ids = { clienti: [], cursuri: [] }
const DATA_SESIUNE = '2026-09-25'

const mkClient = async (prenume) => {
  const { data, error } = await admin.from('clienti')
    .insert({ nume: 'ZZTEST', prenume }).select('id').single()
  if (error) throw new Error('client: ' + error.message)
  ids.clienti.push(data.id)
  return data.id
}

const mkCurs = async (row) => {
  const { data, error } = await admin.from('cursuri').insert(row).select('id').single()
  if (error) throw new Error('curs: ' + error.message)
  ids.cursuri.push(data.id)
  return data.id
}

try {
  const sezon = await admin.from('sezoane').select('id').eq('stare', 'activ').limit(1).single()
  if (sezon.error) throw new Error('sezon: ' + sezon.error.message)
  const locatie = await admin.from('locatii').select('id').limit(1).single()
  if (locatie.error) throw new Error('locatie: ' + locatie.error.message)

  const vouchere = Object.fromEntries(
    ((await admin.from('vouchere').select('id, cod_voucher, activ, numar_utilizari')).data ?? [])
      .map((v) => [v.cod_voucher, v]),
  )

  log('\n── Starea voucherelor după migrație')
  for (const cod of ['P50', 'P100', 'RE10', 'RE20', 'RE50', 'RE10M', 'TRUPA50']) {
    assert(vouchere[cod]?.activ === true && vouchere[cod]?.numar_utilizari == null, `${cod} activ, nelimitat`)
  }
  assert(vouchere.P10?.activ === false, 'P10 închis')
  assert(!vouchere.A10 && !vouchere.LATESTART, 'A10 și LATESTART șterse')

  const baza = { sezon: sezon.data.id, locatie: locatie.data.id, capacitate_maxima: 30 }
  const cursTrupa = await mkCurs({ ...baza, numele: 'ZZTEST Trupa', nivelul: 'Trupa', facultativ: false, pret_anual: 2900 })
  const cursOpen = await mkCurs({ ...baza, numele: 'ZZTEST Open', nivelul: 'Avansat', facultativ: true, pret_sedinta: 80 })
  const cursGrupa = await mkCurs({ ...baza, numele: 'ZZTEST Grupa', nivelul: 'Incepator', facultativ: false, pret_anual: 2700, pret_lunar_promo: 260 })

  const membru = await mkClient('Membru trupa')
  const nemembru = await mkClient('Fara trupa')
  const e = await admin.from('enrollments').insert({
    client: membru, cursul: cursTrupa, tip_plata: 'Per luna', suma: 290, suma_baza: 290,
    data_incepere: '2026-09-01', data_final: '2026-09-30', activ: true,
  })
  if (e.error) throw new Error('enrollment trupa: ' + e.error.message)

  const user = createClient(SB, ANON, { auth: { persistSession: false } })
  const auth = await user.auth.signInWithPassword({ email: 'claude.qa@quasardance.ro', password: 'QappTest2026!' })
  if (auth.error) throw new Error('login: ' + auth.error.message)

  // ── Lista de la recepție ─────────────────────────────────────────────────────
  log('\n── Lista pentru recepție (list_vouchere_aplicabile)')
  const listaMembruOpen = (await user.rpc('list_vouchere_aplicabile', { p_client: membru, p_curs: cursOpen, p_tip: 'Per sedinta' })).data ?? []
  const byCod = (l) => Object.fromEntries(l.map((v) => [v.cod_voucher, v]))
  const lm = byCod(listaMembruOpen)
  assert(lm.TRUPA50?.valid === true, 'membru + OPEN pe ședință → TRUPA50 valid')
  assert(lm.RE10M?.valid === true, 'membru + OPEN pe ședință → RE10M valid')
  assert(!lm.P50 && !lm.P10 && !lm.A10, 'pe ședință nu apar voucherele lunare/închise')

  const ln = byCod((await user.rpc('list_vouchere_aplicabile', { p_client: nemembru, p_curs: cursOpen, p_tip: 'Per sedinta' })).data ?? [])
  assert(ln.TRUPA50?.valid === false && /membrii trupelor/.test(ln.TRUPA50?.motiv ?? ''), `nemembru → TRUPA50 respins cu motiv („${ln.TRUPA50?.motiv}")`)

  const lg = byCod((await user.rpc('list_vouchere_aplicabile', { p_client: nemembru, p_curs: cursGrupa, p_tip: 'Per luna' })).data ?? [])
  assert(['P50', 'P100', 'RE10', 'RE20', 'RE50'].every((c) => lg[c]?.valid === true), 'grupă pe lună → P50, P100, RE10, RE20, RE50 valide')
  assert(!lg.P10 && !lg.LATESTART && !lg.TRUPA50, 'grupă pe lună → fără P10/LATESTART/TRUPA50')

  // ── Rezervare OPEN la recepție ───────────────────────────────────────────────
  log('\n── Rezervare OPEN cu voucher (rezerva_loc_open)')
  const rezBaza = { p_metoda: 'Cash', p_locatie: locatie.data.id, p_curs: cursOpen, p_data: DATA_SESIUNE, p_pret: 80 }
  const r1 = await user.rpc('rezerva_loc_open', { ...rezBaza, p_client: membru, p_suma: 40, p_voucher: vouchere.TRUPA50.id })
  assert(!r1.error, `membru + TRUPA50 → rezervare creată ${r1.error ? '(' + r1.error.message + ')' : ''}`)
  if (!r1.error) {
    const rez = (await admin.from('open_rezervari').select('suma, enrollment, incasare').eq('id', r1.data).single()).data
    const enr = (await admin.from('enrollments').select('suma, suma_baza, voucher').eq('id', rez.enrollment).single()).data
    assert(near(enr.suma_baza, 80) && near(enr.suma, 40), `înrolare: preț 80, datorat 40 (primit ${enr.suma_baza} / ${enr.suma})`)
    assert(enr.voucher === vouchere.TRUPA50.id, 'înrolarea poartă voucherul')
    assert(near(rez.suma, 40), `rezervarea datorează 40 (primit ${rez.suma})`)
    const red = (await admin.from('voucher_redemptions').select('id').eq('client', membru).eq('voucher', vouchere.TRUPA50.id)).data ?? []
    assert(red.length === 1, 'răscumpărare jurnalizată')
    const inc = (await admin.from('incasari').select('suma').eq('inregistrare', rez.enrollment)).data ?? []
    assert(inc.length === 1 && near(inc[0].suma, 40), 'încasare 40, fără restanță')
  }

  const r2 = await user.rpc('rezerva_loc_open', { ...rezBaza, p_client: nemembru, p_suma: 40, p_voucher: vouchere.TRUPA50.id })
  assert(/membrii trupelor/.test(r2.error?.message ?? ''), `nemembru + TRUPA50 → refuzat („${r2.error?.message}")`)

  const r3 = await user.rpc('rezerva_loc_open', { ...rezBaza, p_client: nemembru, p_suma: 80, p_voucher: vouchere.RE10M.id })
  assert(/depășește/.test(r3.error?.message ?? ''), `RE10M: încasat 80 peste datorat 70 → refuzat („${r3.error?.message}")`)

  const r4 = await user.rpc('rezerva_loc_open', { ...rezBaza, p_client: nemembru, p_suma: 80 })
  assert(!r4.error, `fără voucher → neschimbat ${r4.error ? '(' + r4.error.message + ')' : ''}`)

  // ── Gardul pe enrollments (createInrolari scrie direct) ──────────────────────
  log('\n── Gard pe enrollments')
  const rata = { client: nemembru, cursul: cursGrupa, tip_plata: 'Per luna', data_incepere: '2026-10-01', data_final: '2026-10-31', activ: true }
  const g1 = await user.from('enrollments').insert({ ...rata, suma_baza: 260, suma: 130, voucher: vouchere.P50.id, este_reinscriere: true })
  assert(/nu se combină/.test(g1.error?.message ?? ''), `voucher + preț de reînscriere → refuzat („${g1.error?.message}")`)

  const g2 = await user.from('enrollments').insert({ ...rata, suma_baza: 270, suma: 243, voucher: vouchere.P10.id })
  assert(/nu este activ/.test(g2.error?.message ?? ''), `P10 închis → refuzat („${g2.error?.message}")`)

  const g3 = await user.from('enrollments').insert({ ...rata, suma_baza: 270, suma: 135, voucher: vouchere.P50.id }).select('id').single()
  assert(!g3.error, `P50 pe rată lunară → acceptat ${g3.error ? '(' + g3.error.message + ')' : ''}`)

  if (!g3.error) {
    const g4 = await user.from('enrollments').update({ este_reinscriere: true }).eq('id', g3.data.id)
    assert(/nu se combină/.test(g4.error?.message ?? ''), `bifarea reînscrierii pe o rată cu voucher → refuzată („${g4.error?.message}")`)
  }

  const g7 = await user.from('enrollments').insert([
    { ...rata, data_incepere: '2027-02-01', data_final: '2027-02-28', suma_baza: 270, suma: 250, voucher: vouchere.RE20.id },
    { ...rata, data_incepere: '2027-03-01', data_final: '2027-03-31', suma_baza: 270, suma: 250, voucher: vouchere.RE20.id },
  ])
  assert(/o singură rată/.test(g7.error?.message ?? ''), `RE20 pe 2 rate într-o înrolare → refuzat („${g7.error?.message}")`)

  const g8 = await user.from('enrollments').insert([
    { ...rata, cursul: cursGrupa, data_incepere: '2026-12-01', data_final: '2026-12-31', suma_baza: 270, suma: 250, voucher: vouchere.RE20.id },
    { ...rata, cursul: cursGrupa, data_incepere: '2027-01-01', data_final: '2027-01-31', suma_baza: 270, suma: 270 },
  ]).select('id')
  assert(!g8.error, `RE20 doar pe prima rată, restul fără → acceptat ${g8.error ? '(' + g8.error.message + ')' : ''}`)
  if (!g8.error) {
    const g9 = await user.from('enrollments').update({ voucher: vouchere.RE50.id }).in('id', g8.data.map((r) => r.id))
    assert(/o singură rată/.test(g9.error?.message ?? ''), `RE50 pus pe 2 rate existente dintr-un update → refuzat („${g9.error?.message}")`)
  }

  const g5 = await user.from('enrollments').insert({ ...rata, cursul: cursOpen, tip_plata: 'Per sedinta', data_final: null, suma_baza: 80, suma: 40, voucher: vouchere.TRUPA50.id })
  assert(/membrii trupelor/.test(g5.error?.message ?? ''), `insert direct nemembru + TRUPA50 → refuzat („${g5.error?.message}")`)

  const g6 = await user.from('enrollments').insert({ ...rata, suma_baza: 270, suma: 135, voucher: vouchere.TRUPA50.id })
  assert(/doar pe plata/.test(g6.error?.message ?? ''), `TRUPA50 pe rată lunară → refuzat („${g6.error?.message}")`)

  const w = await admin.from('enrollments').insert({ ...rata, cursul: cursOpen, tip_plata: 'Per sedinta', data_final: null, suma_baza: 80, suma: 40, voucher: vouchere.TRUPA50.id })
  assert(!w.error, `webhook (service_role) nu e blocat după plată ${w.error ? '(' + w.error.message + ')' : ''}`)

  // ── Gardul pe incasari (plăți simple) ────────────────────────────────────────
  log('\n── Gard pe incasari')
  const i1 = await user.from('incasari').insert({ client: nemembru, suma: 50, metoda: 'Cash', categorie: 'Merch', locatie: locatie.data.id, voucher: vouchere.P50.id })
  assert(/doar la înrolări/.test(i1.error?.message ?? ''), `P50 pe o plată simplă → refuzat („${i1.error?.message}")`)

  // ── Portal ───────────────────────────────────────────────────────────────────
  log('\n── validate_voucher_code (portal)')
  const vm = (await user.rpc('validate_voucher_code', { p_cod: 'trupa50', p_client: membru, p_curs: cursOpen, p_tip: 'Per sedinta' })).data?.[0]
  assert(vm?.valid === true, 'membru → valid')
  const vn = (await user.rpc('validate_voucher_code', { p_cod: 'TRUPA50', p_client: nemembru, p_curs: cursOpen, p_tip: 'Per sedinta' })).data?.[0]
  assert(vn?.valid === false && /membrii trupelor/.test(vn.reason), `nemembru → invalid („${vn?.reason}")`)
  const vl = (await user.rpc('validate_voucher_code', { p_cod: 'TRUPA50', p_client: membru, p_curs: cursOpen, p_tip: 'Per luna' })).data?.[0]
  assert(vl?.valid === false, `pe lună → invalid („${vl?.reason}")`)
  const vp = (await user.rpc('validate_voucher_code', { p_cod: 'P10', p_client: membru })).data?.[0]
  assert(vp?.valid === false && /nu este activ/.test(vp.reason), `P10 închis → invalid („${vp?.reason}")`)
} finally {
  for (const c of ids.clienti) {
    await admin.from('voucher_redemptions').delete().eq('client', c)
    await admin.from('open_rezervari').delete().eq('client', c)
    await admin.from('incasari').delete().eq('client', c)
    await admin.from('enrollments').delete().eq('client', c)
  }
  for (const c of ids.cursuri) await admin.from('open_sesiuni').delete().eq('curs', c)
  for (const c of ids.clienti) await admin.from('clienti').delete().eq('id', c)
  for (const c of ids.cursuri) await admin.from('cursuri').delete().eq('id', c)
  log('\nCurățenie: date de test șterse.')
}

log(fails === 0 ? '\n✅ Toate verificările au trecut.' : `\n❌ ${fails} verificări eșuate.`)
process.exit(fails === 0 ? 0 : 1)
