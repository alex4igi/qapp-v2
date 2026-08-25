// Repară decalajul de -1 zi al datelor calendaristice importate din v1.
// Cauza: v1 (PocketBase) salva „miezul nopții ora României" în UTC (21:00Z vara /
// 22:00Z iarna), iar pbDate() a tăiat ziua UTC → o zi mai devreme. Data corectă =
// timestamp-ul convertit pe Europe/Bucharest. Vezi memoria
// project_import_v1_decalaj_o_zi_fus_orar.
//
// Siguranță: UPDATE doar unde valoarea live == valoarea greșită așteptată din dump
// (rândurile corectate manual după cutover și cele create nativ în v2 nu sunt atinse).
// Prezențele se mută în ordine DESCRESCĂTOARE a datei: uq_prezente_enrollment_data +
// trg_prezente_dedup (care ȘTERGE dublurile pe client/curs/zi) ar coliziona altfel
// cu rândul de a doua zi al aceleiași înrolări.
//
//   node scripts/migrate/fix-date-shift.mjs                  # DRY RUN — doar raport
//   node scripts/migrate/fix-date-shift.mjs --apply          # scrie în DB
//   node scripts/migrate/fix-date-shift.mjs --report out.json# detaliu complet pe rând

import { sb, uuid } from './lib.mjs'
import { readFileSync, writeFileSync } from 'node:fs'

const APPLY = process.argv.includes('--apply')
const reportIdx = process.argv.indexOf('--report')
const REPORT_PATH = reportIdx > -1 ? process.argv[reportIdx + 1] : null

const JSON_DIR = '/Users/alex_igi/Documents/Claude test/_archive/qapp v2/v1 sources/pb_extract/json'
const CHUNK = 100

// ---------- data corectă: ziua locală Europe/Bucharest a timestamp-ului UTC ----------
const roFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit',
})
function trueDate(v) {
  const s = String(v)
  if (s.length <= 10) return s.slice(0, 10) // dată pură, fără oră — nu e afectată
  return roFmt.format(new Date(s.replace(' ', 'T')))
}
const sliced = (v) => String(v).slice(0, 10) // ce a importat pbDate (valoarea greșită)

// Copia exactă a corecției din import.mjs: Per luna „ultima zi a lunii X" → zi 1 luna
// X+1. Acele rânduri au fost deja aduse (accidental) la data corectă — nu se re-mută.
function billingStart(iso, tip) {
  if (tip !== 'Per luna' || !iso) return iso
  const [y, m, d] = iso.split('-').map(Number)
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  if (d !== lastDay) return iso
  const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1
  return `${ny}-${String(nm).padStart(2, '0')}-01`
}

const TARGETS = [
  { table: 'clienti', col: 'data_nasterii', json: 'Clienti', field: 'Data_nasterii' },
  { table: 'teacheri', col: 'data_nasterii', json: 'Teacheri', field: 'Data_nasterii' },
  { table: 'enrollments', col: 'data_incepere', json: 'Enrollments', field: 'Data_incepere',
    expected: (r) => billingStart(sliced(r.Data_incepere), r.Tip_Plata), sezonCol: 'sezon_id' },
  { table: 'enrollments', col: 'data_final', json: 'Enrollments', field: 'Data_final' },
  { table: 'incasari', col: 'data', json: 'Incasari', field: 'Data', sezonCol: 'sezon' },
  { table: 'prezente', col: 'data', json: 'Prezente', field: 'Data', descending: true, collisions: true,
    select: 'id,data,client,enrollment' },
  { table: 'programari_leads', col: 'data_programarii', json: 'Programari_leads', field: 'Data_programarii' },
]

// ---------- sezoane (recalcul pentru rândurile care sar granița) ----------
const { data: sezoane, error: sezErr } = await sb.from('sezoane').select('id,data_incepere,data_final,activ')
if (sezErr) { console.error(sezErr); process.exit(1) }
// Aceeași preferință ca backfill-ul 20260713170000: sezonul activ, apoi cel mai recent.
function sezonForDate(d) {
  const match = sezoane
    .filter((s) => d >= s.data_incepere && d <= s.data_final)
    .sort((a, b) => (b.activ - a.activ) || b.data_incepere.localeCompare(a.data_incepere))
  return match.length ? match[0].id : null
}
const sezonById = new Map(sezoane.map((s) => [s.id, s]))

// Rețeaua/gateway-ul Supabase mai scapă „fetch failed" pe rulări lungi (constatat
// la primul apply: toate chunk-urile de prezente au picat în cascadă) → retry cu
// backoff pe orice eroare care nu e de date.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function withRetry(run, label) {
  let lastErr
  for (let attempt = 0; attempt < 6; attempt++) {
    if (attempt) await sleep(500 * 2 ** attempt) // 1s..16s
    const { data, error } = await run()
    if (!error) return data
    lastErr = error
    const transient = /fetch failed|network|timeout|ECONN|ETIMEDOUT|EAI_AGAIN|50[234]/i.test(error.message || '')
    if (!transient) throw new Error(`${label}: ${error.message}`)
  }
  throw new Error(`${label}: ${lastErr.message} (după 6 încercări)`)
}

async function fetchAll(table, select, filter) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const data = await withRetry(() => {
      let q = sb.from(table).select(select).order('id').range(from, from + 999)
      return filter ? filter(q) : q
    }, `${table} fetch @${from}`)
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

const report = {}
const detail = {}
const plans = [] // { table, col, descending, updates: [{id, old, nou, sezonOld?, sezonNou?}] }

for (const t of TARGETS) {
  const dump = JSON.parse(readFileSync(`${JSON_DIR}/${t.json}.json`, 'utf8'))
  const wanted = new Map() // id v2 -> { expected (valoarea greșită din import), target }
  let alreadyOk = 0
  for (const r of dump) {
    const v = r[t.field]
    if (!v) continue
    const id = uuid(t.json, r.id)
    const target = trueDate(v)
    // timestamp real (nu miez-de-noapte-local): ziua UTC = ziua locală, nimic de reparat
    if (target === sliced(v)) { alreadyOk++; continue }
    const expected = t.expected ? t.expected(r) : sliced(v)
    if (expected === target) { alreadyOk++; continue } // deja corect din import (billingStart)
    wanted.set(id, { expected, target })
  }

  const select = t.select || ['id', t.col, t.sezonCol].filter(Boolean).join(',')
  const live = new Map((await fetchAll(t.table, select)).map((r) => [r.id, r]))

  const updates = []
  let edited = 0, missing = 0, sezonChanges = 0, lunaCross = 0
  const editedSamples = []
  for (const [id, w] of wanted) {
    const row = live.get(id)
    if (!row) { missing++; continue }
    if (row[t.col] !== w.expected) {
      edited++
      if (editedSamples.length < 10) editedSamples.push({ id, live: row[t.col], expected: w.expected })
      continue
    }
    const u = { id, old: w.expected, nou: w.target }
    if (t.sezonCol) {
      const cur = row[t.sezonCol]
      const curSezon = cur ? sezonById.get(cur) : null
      // recalculăm doar dacă data nouă iese din intervalul sezonului curent
      if (curSezon && (w.target < curSezon.data_incepere || w.target > curSezon.data_final)) {
        u.sezonOld = cur
        u.sezonNou = sezonForDate(w.target)
        sezonChanges++
      }
    }
    if (u.old.slice(0, 7) !== u.nou.slice(0, 7)) lunaCross++
    updates.push(u)
  }

  // Coliziuni: rândul mutat ar nimeri peste un rând care NU se mută (nativ v2 sau
  // editat manual) — aceeași înrolare + zi ar încălca uq_prezente_enrollment_data,
  // iar același client/curs/zi ar face trg_prezente_dedup să ȘTEARGĂ rândul rămas
  // pe loc. Le excludem din plan și le raportăm.
  let collisions = []
  if (t.collisions && updates.length) {
    const cursByEnr = new Map((await fetchAll('enrollments', 'id,cursul')).map((e) => [e.id, e.cursul]))
    const movingIds = new Set(updates.map((u) => u.id))
    const staying = [...live.values()].filter((r) => !movingIds.has(r.id))
    const byEnrData = new Set(staying.filter((r) => r.enrollment).map((r) => `${r.enrollment}|${r.data}`))
    const byClientCursData = new Set(
      staying
        .filter((r) => r.client && r.enrollment && cursByEnr.get(r.enrollment))
        .map((r) => `${r.client}|${cursByEnr.get(r.enrollment)}|${r.data}`)
    )
    collisions = updates.filter((u) => {
      const m = live.get(u.id)
      const curs = cursByEnr.get(m.enrollment)
      return (
        (m.enrollment && byEnrData.has(`${m.enrollment}|${u.nou}`)) ||
        (m.client && curs && byClientCursData.has(`${m.client}|${curs}|${u.nou}`))
      )
    })
    if (collisions.length) {
      const collSet = new Set(collisions.map((c) => c.id))
      for (let i = updates.length - 1; i >= 0; i--) if (collSet.has(updates[i].id)) updates.splice(i, 1)
    }
  }

  const key = `${t.table}.${t.col}`
  report[key] = {
    'în dump cu valoare': [...wanted.keys()].length + alreadyOk,
    'corecte din import (nu se ating)': alreadyOk,
    'DE REPARAT (+1 zi)': updates.length,
    'editate manual după cutover (nu se ating)': edited,
    'lipsă din v2 (dedup/șterse)': missing,
    'sar în altă lună': lunaCross,
    'sezon de recalculat': sezonChanges,
    'coliziuni la granița cutover (excluse)': collisions.length,
  }
  detail[key] = { editedSamples, collisions, updates: REPORT_PATH ? updates : updates.slice(0, 5) }
  plans.push({ ...t, updates })
  console.log(`\n── ${key}`)
  for (const [k, v] of Object.entries(report[key])) console.log(`   ${k}: ${v}`)
  if (editedSamples.length) console.log('   exemple editate manual:', JSON.stringify(editedSamples.slice(0, 3)))
}

// verificare-santinelă: cazul raportat de Alex
const sofia = plans
  .find((p) => p.table === 'clienti')
  .updates.find((u) => u.id === '1bcca197-77ac-5d3b-be01-6b443a271026')
console.log(`\n🎂 Santinelă Scutelnicu Sofia: ${sofia ? `${sofia.old} → ${sofia.nou}` : '⚠️ NEGĂSITĂ în planul de corecție!'}`)

if (REPORT_PATH) {
  writeFileSync(REPORT_PATH, JSON.stringify({ report, detail }, null, 2))
  console.log(`\n📄 Detaliu complet scris în ${REPORT_PATH}`)
}

if (!APPLY) {
  console.log('\n⏸ DRY RUN — nimic scris. Rulează cu --apply ca să aplici corecțiile de mai sus.')
  process.exit(0)
}

// ---------- APPLY ----------
console.log('\n--- APPLY ---')
let totalFailed = 0
for (const p of plans) {
  if (!p.updates.length) continue
  // grupăm pe (old → nou, schimbare sezon); prezențele în ordine descrescătoare a datei
  const groups = new Map()
  for (const u of p.updates) {
    const k = `${u.old}|${u.nou}|${u.sezonNou ?? ''}|${'sezonOld' in u}`
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(u)
  }
  const ordered = [...groups.entries()].sort((a, b) =>
    p.descending ? b[0].localeCompare(a[0]) : a[0].localeCompare(b[0])
  )
  let done = 0, failed = 0, consecFails = 0
  outer: for (const [k, rows] of ordered) {
    const [old, nou, sezonNou, hasSezon] = k.split('|')
    const patch = { [p.col]: nou }
    if (hasSezon === 'true') patch[p.sezonCol] = sezonNou || null
    for (let i = 0; i < rows.length; i += CHUNK) {
      const ids = rows.slice(i, i + CHUNK).map((u) => u.id)
      try {
        // filtrul .eq(col, old) re-verifică atomic valoarea la momentul scrierii
        const data = await withRetry(
          () => sb.from(p.table).update(patch).in('id', ids).eq(p.col, old).select('id'),
          `${p.table} ${old}→${nou}`
        )
        done += data.length
        if (data.length < ids.length) failed += ids.length - data.length
        consecFails = 0
      } catch (e) {
        failed += ids.length
        consecFails++
        console.error(`\n  ⚠️ ${e.message}`)
        if (consecFails >= 5) {
          console.error(`\n  ✋ ${p.table}.${p.col}: 5 chunk-uri eșuate la rând — opresc pasul (re-rulează --apply, e idempotent).`)
          break outer
        }
      }
      process.stdout.write(`\r  ${p.table}.${p.col}: ${done}/${p.updates.length}${failed ? ` (⚠️ ${failed} eșuate)` : ''}`)
    }
  }
  console.log()
  totalFailed += failed
}
if (totalFailed) {
  console.log(`\n⚠️ Terminat cu ${totalFailed} update-uri eșuate — re-rulează --apply (idempotent) ca să le reia.`)
  process.exit(1)
}
console.log('\n✅ Aplicat integral. Re-rulează fără --apply pentru verificare (totul ar trebui să fie pe 0 la „DE REPARAT").')
