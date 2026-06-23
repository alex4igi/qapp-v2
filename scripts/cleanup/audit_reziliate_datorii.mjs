// ============================================================================
// Audit + reconciliere: înrolări REZILIATE care încă au datorie reziduală.
// ============================================================================
//
// CONTEXT
// -------
// Regula de contract: nu se poate rezilia o înrolare cu datorie. Deci o înrolare
// reziliată cu `suma > plătit` e o ANOMALIE, nu datorie validă. Sursa principală:
// cronul auto-EXclient reziliă orice client inactiv 45z FĂRĂ să verifice datoria
// (reparat în 20260623310000), plus reziliere manuală pe luni viitoare nezerate
// (reparat în enrollments.ts). Acest script clasifică anomaliile EXISTENTE și
// propune remedierea, ca datoria reală să reintre în recuperare.
//
// CLASIFICARE (per înrolare reziliată cu rest > 0), pe baza prezenței reale:
//   • RECUPERABIL   = nu e prescris (<2 ani) ȘI are cel puțin o prezență `Prezent`
//                     pe acea înrolare → datorie reală; candidat la DEZ-REZILIERE.
//   • FANTOMĂ       = nicio prezență `Prezent` pe înrolare (sau lună viitoare) →
//                     n-a frecventat, nu se facturează → `suma=0, suma_baza=0`.
//   • PRESCRIS_VECHI= data_incepere < azi − 2 ani → oricum prescris; `suma=0` curat.
//
// UTILIZARE
// ---------
//   node scripts/cleanup/audit_reziliate_datorii.mjs                 # dry-run + raport
//   node scripts/cleanup/audit_reziliate_datorii.mjs --apply-zero    # zerează FANTOMĂ + PRESCRIS_VECHI
//   node scripts/cleanup/audit_reziliate_datorii.mjs --apply-unrezilia  # DEZ-REZILIEREA RECUPERABILILOR (sensibil!)
//
// IMPLICIT = DRY-RUN (nu scrie nimic). --apply-unrezilia se rulează DOAR după ce
// userul confirmă lista RECUPERABIL. IDEMPOTENT: re-rulabil după re-import v1.
// ============================================================================

import { writeFileSync } from 'fs'
import { sb } from '../migrate/lib.mjs'

const APPLY_ZERO = process.argv.includes('--apply-zero')
const APPLY_UNREZ = process.argv.includes('--apply-unrezilia')

const iso = (d) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
const now = new Date()
const TODAY = iso(now)
const CUT_2Y = (() => {
  const d = new Date(now)
  d.setFullYear(d.getFullYear() - 2)
  return iso(d)
})()
const EOM = (() => {
  const [y, m] = TODAY.slice(0, 7).split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`
})()

const fmt = (n) => Math.round(Number(n)).toLocaleString('ro-RO')

async function pageAll(table, columns, tweak) {
  const rows = []
  let from = 0
  for (;;) {
    let q = sb.from(table).select(columns).range(from, from + 999)
    if (tweak) q = tweak(q)
    const { data, error } = await q
    if (error) throw error
    rows.push(...data)
    if (data.length < 1000) break
    from += 1000
  }
  return rows
}

console.log(`\n=== Audit reziliate cu datorie ===`)
console.log(`Azi: ${TODAY} | prag prescriere: <${CUT_2Y} | sfârșit lună: ${EOM}`)
console.log(`Mod: ${APPLY_ZERO ? 'APPLY-ZERO ' : ''}${APPLY_UNREZ ? 'APPLY-UNREZILIA ' : ''}${!APPLY_ZERO && !APPLY_UNREZ ? 'DRY-RUN (doar raport)' : ''}\n`)

// 1. Toate înrolările + plăți + prezențe (Prezent)
const enr = await pageAll('enrollments', 'id, client, cursul, suma, data_incepere, reziliat')
const inc = await pageAll('incasari', 'inregistrare, suma')
const prez = await pageAll('prezente', 'enrollment', (q) => q.eq('status', 'Prezent'))

const paidBy = new Map()
for (const i of inc) paidBy.set(i.inregistrare, (paidBy.get(i.inregistrare) || 0) + Number(i.suma || 0))
const hasPrezent = new Set(prez.map((p) => p.enrollment))

// 2. Clasificare
const buckets = { RECUPERABIL: [], FANTOMA: [], PRESCRIS_VECHI: [] }
for (const e of enr) {
  if (!e.reziliat) continue
  const rest = Number(e.suma || 0) - (paidBy.get(e.id) || 0)
  if (rest <= 0.005) continue
  const di = e.data_incepere || ''
  if (di && di < CUT_2Y) buckets.PRESCRIS_VECHI.push({ ...e, rest })
  else if (di > EOM || !hasPrezent.has(e.id)) buckets.FANTOMA.push({ ...e, rest })
  else buckets.RECUPERABIL.push({ ...e, rest })
}
const sum = (arr) => arr.reduce((a, x) => a + x.rest, 0)

console.log('--- Clasificare reziliate cu rest > 0 ---')
for (const k of ['RECUPERABIL', 'FANTOMA', 'PRESCRIS_VECHI']) {
  console.log(`  ${k.padEnd(15)} ${String(buckets[k].length).padStart(5)} înrolări → ${fmt(sum(buckets[k])).padStart(10)} RON`)
}

// 3. Reconciliere — descompunerea „datoriei totale stil v1"
const rt = await sb.rpc('get_restante_totale')
const r = (rt.data ?? [])[0] ?? { rest_net: 0, rest_prescris: 0 }
const recuperabilRez = sum(buckets.RECUPERABIL)
const fantoma = sum(buckets.FANTOMA)
const vechiRez = sum(buckets.PRESCRIS_VECHI)
const v1Style = Number(r.rest_net) + Number(r.rest_prescris) + recuperabilRez + fantoma + vechiRez
console.log('\n--- Reconciliere v1↔v2 (descompunerea datoriei brute stil-v1) ---')
console.log(`  Net recuperabil (ne-reziliat, neprescris)     : ${fmt(r.rest_net).padStart(10)} RON  ← rămâne în recuperare`)
console.log(`  Prescris (ne-reziliat, >2 ani)                : ${fmt(r.rest_prescris).padStart(10)} RON  ← afișat separat`)
console.log(`  Reziliat RECUPERABIL (a frecventat, <2 ani)   : ${fmt(recuperabilRez).padStart(10)} RON  ← de readus în recuperare`)
console.log(`  Reziliat FANTOMĂ (n-a frecventat)             : ${fmt(fantoma).padStart(10)} RON  ← anomalie, de zerat`)
console.log(`  Reziliat PRESCRIS_VECHI (>2 ani)              : ${fmt(vechiRez).padStart(10)} RON  ← anomalie, de zerat`)
console.log(`  ${''.padEnd(46, '-')}`)
console.log(`  TOTAL brut „stil v1"                          : ${fmt(v1Style).padStart(10)} RON`)

// 4. Raport detaliat în fișier
const lines = []
lines.push(`# Audit reziliate cu datorie — ${TODAY}`)
lines.push(`# net=${fmt(r.rest_net)} prescris=${fmt(r.rest_prescris)} rezRecuperabil=${fmt(recuperabilRez)} rezFantoma=${fmt(fantoma)} rezVechi=${fmt(vechiRez)} totalV1=${fmt(v1Style)}`)
for (const k of ['RECUPERABIL', 'FANTOMA', 'PRESCRIS_VECHI']) {
  lines.push(`\n## ${k} (${buckets[k].length}, ${fmt(sum(buckets[k]))} RON)`)
  for (const e of buckets[k].sort((a, b) => b.rest - a.rest)) {
    lines.push(`${e.id}\t${e.client}\t${e.cursul}\t${e.data_incepere}\trest=${Math.round(e.rest)}`)
  }
}
const reportPath = new URL('./audit_reziliate_datorii_report.txt', import.meta.url)
writeFileSync(reportPath, lines.join('\n'))
console.log(`\nRaport detaliat: scripts/cleanup/audit_reziliate_datorii_report.txt`)

// 5. Aplicare (gated)
async function bulkUpdate(ids, patch, label) {
  let done = 0
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200)
    const { error } = await sb.from('enrollments').update(patch).in('id', chunk)
    if (error) throw error
    done += chunk.length
  }
  console.log(`  ${label}: ${done} înrolări actualizate`)
}

if (APPLY_ZERO) {
  console.log('\n>>> APPLY-ZERO: zerez suma+suma_baza pe FANTOMĂ + PRESCRIS_VECHI')
  const ids = [...buckets.FANTOMA, ...buckets.PRESCRIS_VECHI].map((e) => e.id)
  await bulkUpdate(ids, { suma: 0, suma_baza: 0 }, 'zerate')
}
if (APPLY_UNREZ) {
  console.log('\n>>> APPLY-UNREZILIA: dez-reziliez RECUPERABILII (reintră în recuperare)')
  const ids = buckets.RECUPERABIL.map((e) => e.id)
  // reziliat=false → reintră în plati_inrolari/worklist/SMS; activ=false (au plecat din grupă).
  await bulkUpdate(ids, { reziliat: false, activ: false }, 'dez-reziliate')
}

if (!APPLY_ZERO && !APPLY_UNREZ) {
  console.log('\n(DRY-RUN — nimic scris. Rulează cu --apply-zero și/sau --apply-unrezilia după confirmare.)')
}
process.exit(0)
