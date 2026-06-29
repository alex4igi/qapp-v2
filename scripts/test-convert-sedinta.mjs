// Test izolat pentru converteste_sedinta_in_abonament. NU lasă date în urmă.
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

const ids = {
  client: null, familie: null, curs: null, sesiune: null,
  enrSed: null, rez: null, enrIul: null,
  enrSedPaid: null, rezPaid: null, inc: null,
}
let fails = 0
const assert = (cond, msg) => { if (cond) log('  ✓', msg); else { fails++; log('  ✗ FAIL:', msg) } }

try {
  // 0) familie + client + curs facultativ
  const fam = await admin.from('familii').insert({ nume_familie: 'ZZTEST Convert (de sters)' }).select('id').single()
  ids.familie = fam.data.id
  const cl = await admin.from('clienti').insert({ nume: 'ZZTEST', prenume: 'Convert', familia: ids.familie }).select('id').single()
  ids.client = cl.data.id
  const curs = await admin.from('cursuri').insert({
    numele: 'ZZTEST Curs Convert', zile: ['Luni'], facultativ: true, pret_sedinta: 50, pret_lunar: 170,
  }).select('id').single()
  if (curs.error) throw new Error('curs: ' + curs.error.message)
  ids.curs = curs.data.id

  // 1) sesiune OPEN 29 iun + înrolare „Per sedinta" 50 lei NEPLĂTITĂ + rezervare (incasare null)
  const ses = await admin.from('open_sesiuni').insert({
    curs: ids.curs, data: '2026-06-29', capacitate: 20,
  }).select('id').single()
  if (ses.error) throw new Error('sesiune: ' + ses.error.message)
  ids.sesiune = ses.data.id

  const enrSed = await admin.from('enrollments').insert({
    client: ids.client, cursul: ids.curs, tip_plata: 'Per sedinta',
    suma: 50, suma_baza: 50, data_incepere: '2026-06-29', data_final: null, activ: true, reziliat: false,
  }).select('id').single()
  if (enrSed.error) throw new Error('enr sed: ' + enrSed.error.message)
  ids.enrSed = enrSed.data.id

  const rez = await admin.from('open_rezervari').insert({
    sesiune: ids.sesiune, client: ids.client, enrollment: ids.enrSed, incasare: null, status: 'platit', suma: 50,
  }).select('id').single()
  if (rez.error) throw new Error('rezervare: ' + rez.error.message)
  ids.rez = rez.data.id

  // 2) abonamentul iulie „țintă" (cum l-ar fi creat createInrolari)
  const enrIul = await admin.from('enrollments').insert({
    client: ids.client, cursul: ids.curs, tip_plata: 'Per luna',
    suma: 170, suma_baza: 170, data_incepere: '2026-07-01', data_final: '2026-07-31', activ: true, reziliat: false,
  }).select('id').single()
  ids.enrIul = enrIul.data.id
  log('✓ seed campanie: client + curs facultativ + ședință 50 NEPLĂTITĂ + rezervare + abonament iulie')

  // 3) apel RPC ca ADMIN (auth_role trece de gard)
  const user = createClient(SB, ANON, { auth: { persistSession: false } })
  const auth = await user.auth.signInWithPassword({ email: 'claude.qa@quasardance.ro', password: 'QappTest2026!' })
  if (auth.error) throw new Error('login admin: ' + auth.error.message)

  const res = await user.rpc('converteste_sedinta_in_abonament', {
    p_sedinta: ids.enrSed, p_target: ids.enrIul,
  })
  if (res.error) throw new Error('rpc: ' + res.error.message)
  log('✓ RPC →', JSON.stringify(res.data))
  assert(res.data.converted === true, 'RPC întoarce converted=true')

  // 4) asserts — ședința e void curat, fără restanță
  const sedAfter = (await admin.from('enrollments').select('suma, suma_baza, reziliat, activ, motiv_reziliere').eq('id', ids.enrSed).single()).data
  assert(Number(sedAfter.suma) === 0 && Number(sedAfter.suma_baza) === 0, 'ședință: suma=0 ȘI suma_baza=0')
  assert(sedAfter.reziliat === true && sedAfter.activ === false, 'ședință: reziliat=true, activ=false')
  assert((sedAfter.motiv_reziliere ?? '').includes('abonament'), 'motiv reziliere setat')

  // rezervarea OPEN rămâne (roster/prezență păstrate), dar prețul e 0
  const rezAfter = (await admin.from('open_rezervari').select('status, suma').eq('id', ids.rez).single()).data
  assert(rezAfter.status === 'platit', 'rezervarea OPEN rămâne activă (status platit, nu anulat)')
  assert(Number(rezAfter.suma) === 0, 'rezervarea OPEN: suma=0 (ședință gratuită)')

  // abonamentul iulie neatins
  const iulAfter = (await admin.from('enrollments').select('suma, suma_baza, reziliat').eq('id', ids.enrIul).single()).data
  assert(Number(iulAfter.suma) === 170 && iulAfter.reziliat === false, 'abonament iulie intact (170, neReziliat)')

  // „fără restanță de 50 RON": ședința nu mai apare în plati_inrolari (exclude reziliat)
  const restSed = (await admin.from('plati_inrolari').select('rest').eq('id_enrollment', ids.enrSed)).data
  assert(Array.isArray(restSed) && restSed.length === 0, 'ședința dispare din plati_inrolari (fără restanță 50 RON)')

  // 5) idempotență
  const res2 = await user.rpc('converteste_sedinta_in_abonament', { p_sedinta: ids.enrSed, p_target: ids.enrIul })
  assert(!res2.error && res2.data.already_converted === true, 'al doilea apel → already_converted=true (idempotent)')

  // 6) robustețe: ședință CU plată → încasarea se mută pe abonament
  const enrSedPaid = await admin.from('enrollments').insert({
    client: ids.client, cursul: ids.curs, tip_plata: 'Per sedinta',
    suma: 50, suma_baza: 50, data_incepere: '2026-06-30', data_final: null, activ: true, reziliat: false,
  }).select('id').single()
  if (enrSedPaid.error) throw new Error('enr sed paid: ' + enrSedPaid.error.message)
  ids.enrSedPaid = enrSedPaid.data.id
  const inc = await admin.from('incasari').insert({
    client: ids.client, inregistrare: ids.enrSedPaid, suma: 50, metoda: 'Cash', categorie: 'Abonament', data: '2026-06-29',
  }).select('id').single()
  if (inc.error) throw new Error('incasare: ' + inc.error.message)
  ids.inc = inc.data.id

  const res3 = await user.rpc('converteste_sedinta_in_abonament', { p_sedinta: ids.enrSedPaid, p_target: ids.enrIul })
  if (res3.error) throw new Error('rpc paid: ' + res3.error.message)
  const incAfter = (await admin.from('incasari').select('inregistrare').eq('id', ids.inc).single()).data
  assert(incAfter.inregistrare === ids.enrIul, 'încasarea 50 mutată pe abonamentul iulie (credit)')

  log(fails === 0 ? '\n✅ TOATE ASSERT-URILE TREC' : `\n❌ ${fails} assert eșuat`)
} catch (e) {
  console.error('✗', e.message); fails++
} finally {
  // cleanup în ordine inversă FK
  if (ids.rezPaid) await admin.from('open_rezervari').delete().eq('id', ids.rezPaid)
  if (ids.rez) await admin.from('open_rezervari').delete().eq('id', ids.rez)
  if (ids.inc) await admin.from('incasari').delete().eq('id', ids.inc)
  if (ids.enrSedPaid) await admin.from('enrollments').delete().eq('id', ids.enrSedPaid)
  if (ids.enrSed) await admin.from('enrollments').delete().eq('id', ids.enrSed)
  if (ids.enrIul) await admin.from('enrollments').delete().eq('id', ids.enrIul)
  if (ids.sesiune) await admin.from('open_sesiuni').delete().eq('id', ids.sesiune)
  if (ids.curs) await admin.from('cursuri').delete().eq('id', ids.curs)
  if (ids.client) await admin.from('clienti').delete().eq('id', ids.client)
  if (ids.familie) await admin.from('familii').delete().eq('id', ids.familie)
  log('✓ cleanup done')
  process.exitCode = fails === 0 ? 0 : 1
}
