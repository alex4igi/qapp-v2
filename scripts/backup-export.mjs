// Export logic complet al bazei (toate tabelele din `public`) + fișierele din bucketele
// private, într-un director local datat. Plasa de siguranță cât timp proiectul Supabase
// e pe planul Free (fără backup-uri automate). Re-rulabil; fiecare rulare = director nou.
//
//   node scripts/backup-export.mjs                 # → ~/Documents/quasar-backup/supabase/<data>/
//   node scripts/backup-export.mjs --no-storage    # doar tabelele
//   BACKUP_DIR=/alt/loc node scripts/backup-export.mjs
//
// Citește cu SUPABASE_SERVICE_ROLE_KEY din .env.local (ca scripturile din scripts/cleanup).
// Datele exportate sunt date personale reale: directorul trebuie să stea pe un disc criptat
// (FileVault) și să nu ajungă în git / cloud nesecurizat.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const URL_ = env.VITE_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY) { console.error('Lipsesc VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY în .env.local'); process.exit(1) }

const withStorage = !process.argv.includes('--no-storage')
const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
const root = process.env.BACKUP_DIR || path.join(os.homedir(), 'Documents', 'quasar-backup', 'supabase')
const dir = path.join(root, stamp)
fs.mkdirSync(path.join(dir, 'tables'), { recursive: true })

const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }
const PAGE = 1000

// Orice lucru neexportat ajunge aici. Un backup cu probleme NU are voie să pară reușit:
// manifest.complete = false + cod de ieșire 1, ca un cron/GitHub Action să pice zgomotos.
const problems = []
const problem = (msg) => { problems.push(msg); console.warn(`  ! ${msg}`) }

async function rpc(name, body = {}) {
  const r = await fetch(`${URL_}/rest/v1/rpc/${name}`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(`${name}: ${r.status} ${await r.text()}`)
  return r.json()
}

// Lista tabelelor din `public` (fără view-uri) — din OpenAPI-ul PostgREST, ca să nu depindem
// de un RPC propriu. View-urile se recalculează din tabele, nu au nevoie de export.
async function listTables() {
  const r = await fetch(`${URL_}/rest/v1/`, { headers: H })
  if (!r.ok) throw new Error(`lista de tabele: ${r.status} ${await r.text()}`)
  const spec = await r.json().catch(() => ({}))
  const names = Object.keys(spec.definitions || {})
  // Fără asta, un răspuns neașteptat ar da „0 tabele" și un backup gol raportat ca reușit.
  if (names.length === 0) throw new Error('lista de tabele a venit goală — OpenAPI neașteptat')
  // Coloanele fiecărui tabel, pentru ordonarea stabilă la paginare (vezi exportTable).
  for (const [n, def] of Object.entries(spec.definitions || {})) {
    tableColumns.set(n, Object.keys(def?.properties || {}))
  }
  // în OpenAPI, view-urile au și ele definiție; le excludem după comentariul PostgREST (nu există)
  // → folosim lista de view-uri din information_schema prin RPC-ul helper de mai jos dacă există,
  //   altfel exportăm tot (view-urile sunt doar redundante, nu dăunează).
  let views = new Set()
  try {
    const v = await rpc('backup_list_views')
    views = new Set(v)
  } catch { /* RPC opțional */ }
  return names.filter((n) => !views.has(n)).sort()
}

const tableColumns = new Map()

// Paginarea cu Range fără ORDER BY nu garantează ordinea între pagini: rânduri pot fi
// sărite sau dublate. Ordonăm după prima cheie stabilă pe care o are tabelul.
function orderParam(name) {
  const cols = tableColumns.get(name) || []
  for (const c of ['id', 'created_at', 'data']) if (cols.includes(c)) return `&order=${c}.asc`
  return cols.length ? `&order=${cols[0]}.asc` : ''
}

async function exportTable(name) {
  const file = path.join(dir, 'tables', `${name}.ndjson`)
  const out = fs.createWriteStream(file)
  let from = 0, total = 0
  for (;;) {
    const r = await fetch(`${URL_}/rest/v1/${name}?select=*${orderParam(name)}`, {
      headers: { ...H, Range: `${from}-${from + PAGE - 1}`, Prefer: 'count=exact' },
    })
    if (r.status === 416) break // range dincolo de final
    if (!r.ok) throw new Error(`${name}: ${r.status} ${await r.text()}`)
    const rows = await r.json()
    for (const row of rows) out.write(JSON.stringify(row) + '\n')
    total += rows.length
    if (rows.length < PAGE) break
    from += PAGE
  }
  await new Promise((res) => out.end(res))
  return total
}

async function exportStorage() {
  const b = await fetch(`${URL_}/storage/v1/bucket`, { headers: H })
  if (!b.ok) throw new Error(`lista de buckete: ${b.status} ${await b.text()}`)
  const buckets = await b.json()
  if (!Array.isArray(buckets)) throw new Error('lista de buckete: răspuns neașteptat')
  let files = 0, bytes = 0
  for (const bucket of buckets) {
    const bdir = path.join(dir, 'storage', bucket.id)
    fs.mkdirSync(bdir, { recursive: true })
    // listare recursivă (prefixele sunt „foldere")
    const queue = ['']
    while (queue.length) {
      const prefix = queue.shift()
      let offset = 0
      for (;;) {
        const l = await fetch(`${URL_}/storage/v1/object/list/${bucket.id}`, {
          method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefix, limit: 100, offset, sortBy: { column: 'name', order: 'asc' } }),
        })
        // O eroare de listare NU e „sfârșit de listă": altfel sărim tăcut un folder întreg.
        if (!l.ok) {
          problem(`${bucket.id}/${prefix || '(rădăcină)'}: listare ${l.status}`)
          break
        }
        const items = await l.json().catch(() => null)
        if (!Array.isArray(items)) {
          problem(`${bucket.id}/${prefix || '(rădăcină)'}: listare — răspuns neașteptat`)
          break
        }
        if (items.length === 0) break
        for (const it of items) {
          const full = prefix ? `${prefix}/${it.name}` : it.name
          if (!it.id) { queue.push(full); continue } // folder
          const f = await fetch(`${URL_}/storage/v1/object/${bucket.id}/${encodeURI(full)}`, { headers: H })
          if (!f.ok) { problem(`${bucket.id}/${full}: descărcare ${f.status}`); continue }
          const buf = Buffer.from(await f.arrayBuffer())
          const target = path.join(bdir, full)
          fs.mkdirSync(path.dirname(target), { recursive: true })
          fs.writeFileSync(target, buf)
          files++; bytes += buf.length
        }
        if (items.length < 100) break
        offset += 100
      }
    }
  }
  return { files, bytes }
}

const started = Date.now()
let tables
try {
  tables = await listTables()
} catch (e) {
  console.error(`BACKUP EȘUAT înainte de a începe: ${e.message}`)
  process.exit(1)
}
console.log(`Export în ${dir}\n${tables.length} tabele…`)
const manifest = { started_at: new Date(started).toISOString(), project: URL_, tables: {}, storage: null }
for (const t of tables) {
  try {
    const n = await exportTable(t)
    manifest.tables[t] = n
    process.stdout.write(`  ${t}: ${n}\n`)
  } catch (e) {
    manifest.tables[t] = `EROARE: ${e.message.slice(0, 200)}`
    problem(`tabel ${t}: ${e.message.slice(0, 200)}`)
  }
}
if (withStorage) {
  console.log('Storage…')
  try {
    manifest.storage = await exportStorage()
    console.log(`  ${manifest.storage.files} fișiere, ${(manifest.storage.bytes / 1e6).toFixed(1)} MB`)
  } catch (e) {
    problem(`storage: ${e.message.slice(0, 200)}`)
  }
} else {
  manifest.storage = 'sărit (--no-storage)'
}
manifest.finished_at = new Date().toISOString()
manifest.seconds = Math.round((Date.now() - started) / 1000)
manifest.complete = problems.length === 0
manifest.problems = problems
fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2))

if (manifest.complete) {
  console.log(`Gata în ${manifest.seconds}s → ${dir}`)
} else {
  console.error(`\nBACKUP INCOMPLET — ${problems.length} problem(e):`)
  for (const p of problems) console.error(`  - ${p}`)
  console.error(`\nNU folosi ${dir} ca backup valid.`)
  process.exit(1)
}
