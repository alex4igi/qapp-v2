// Export logic complet al bazei (toate tabelele din `public`) + fișierele din bucketele
// private, într-un director local datat. Plasa de siguranță cât timp proiectul Supabase
// e pe planul Free (fără backup-uri automate). Re-rulabil; fiecare rulare = director nou.
//
//   node scripts/backup-export.mjs                 # → ~/quasar-backup/supabase/<data>/
//   node scripts/backup-export.mjs --no-storage    # doar tabelele
//   node scripts/backup-export.mjs --keep=7        # după succes, păstrează doar ultimele 7 copii complete
//
// Rularea zilnică automată: scripts/backup-programat.sh (launchd). Backup-urile NU stau în
// ~/Documents: macOS nu lasă un job launchd să scrie acolo fără o permisiune separată.
//   BACKUP_DIR=/alt/loc node scripts/backup-export.mjs
//
// Citește cu SUPABASE_SERVICE_ROLE_KEY din .env.local (ca scripturile din scripts/cleanup),
// sau din fișierul dat în BACKUP_ENV_FILE (copia jobului programat).
// Datele exportate sunt date personale reale: directorul trebuie să stea pe un disc criptat
// (FileVault) și să nu ajungă în git / cloud nesecurizat.
//
// Schema (funcții, RLS, triggere) → schema.sql, prin pg_dump local (`brew install libpq`):
// `supabase db dump` cere Docker, așa că îi luăm doar scriptul (--dry-run) și îl rulăm noi.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const env = Object.fromEntries(
  fs.readFileSync(process.env.BACKUP_ENV_FILE || fileURLToPath(new URL('../.env.local', import.meta.url)), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const URL_ = env.VITE_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY) { console.error('Lipsesc VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY în .env.local'); process.exit(1) }

const withStorage = !process.argv.includes('--no-storage')
const keep = Number(process.argv.find((a) => a.startsWith('--keep='))?.slice(7) || 0)
// Ora locală (sv-SE dă „AAAA-LL-ZZ HH:MM:SS"): numele folderului trebuie să se potrivească cu ceasul.
const stamp = new Date().toLocaleString('sv-SE').replace(/[: ]/g, '-')
const root = process.env.BACKUP_DIR || path.join(os.homedir(), 'quasar-backup', 'supabase')
const dir = path.join(root, stamp)
fs.mkdirSync(path.join(dir, 'tables'), { recursive: true })

const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }
const PAGE = 1000

// Orice lucru neexportat ajunge aici. Un backup cu probleme NU are voie să pară reușit:
// manifest.complete = false + cod de ieșire 1, ca un cron/GitHub Action să pice zgomotos.
const problems = []
const problem = (msg) => { problems.push(msg); console.warn(`  ! ${msg}`) }

// O sughițare de rețea („fetch failed") sau un 5xx trecător nu trebuie să strice o rulare
// de minute întregi. Toate cererile de aici sunt citiri, deci se pot repeta fără grijă.
async function fetchRetry(url, opts) {
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(url, opts)
      if ((r.status === 429 || r.status >= 500) && attempt < 4) throw new Error(`HTTP ${r.status}`)
      return r
    } catch (e) {
      if (attempt >= 4) throw e
      await new Promise((res) => setTimeout(res, 2000 * attempt ** 2))
    }
  }
}

async function rpc(name, body = {}) {
  const r = await fetchRetry(`${URL_}/rest/v1/rpc/${name}`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(`${name}: ${r.status} ${await r.text()}`)
  return r.json()
}

// Lista tabelelor din `public` (fără view-uri) — din OpenAPI-ul PostgREST, ca să nu depindem
// de un RPC propriu. View-urile se recalculează din tabele, nu au nevoie de export.
async function listTables() {
  const r = await fetchRetry(`${URL_}/rest/v1/`, { headers: H })
  if (!r.ok) throw new Error(`lista de tabele: ${r.status} ${await r.text()}`)
  const spec = await r.json().catch(() => ({}))
  const names = Object.keys(spec.definitions || {})
  // Fără asta, un răspuns neașteptat ar da „0 tabele" și un backup gol raportat ca reușit.
  if (names.length === 0) throw new Error('lista de tabele a venit goală — OpenAPI neașteptat')
  // Coloanele fiecărui tabel, pentru ordonarea stabilă la paginare (vezi exportTable).
  for (const [n, def] of Object.entries(spec.definitions || {})) {
    tableColumns.set(n, Object.keys(def?.properties || {}))
  }
  // În OpenAPI și view-urile au definiție. Le sărim: se recalculează din tabele, iar unele
  // (raport_incasari, raport_financiar) durează minute întregi la export paginat.
  const v = await rpc('backup_list_views')
  if (!Array.isArray(v)) throw new Error('backup_list_views: răspuns neașteptat')
  const views = new Set(v)
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
    const r = await fetchRetry(`${URL_}/rest/v1/${name}?select=*${orderParam(name)}`, {
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

// Scriptul din --dry-run conține parola unui rol temporar de login: nu se scrie pe disc și
// nu se afișează, doar se dă pe stdin lui bash.
function exportSchema() {
  const pgBin = ['/opt/homebrew/opt/libpq/bin', '/usr/local/opt/libpq/bin']
    .find((d) => fs.existsSync(path.join(d, 'pg_dump')))
  const envPath = pgBin ? `${pgBin}:${process.env.PATH}` : process.env.PATH
  if (spawnSync('pg_dump', ['--version'], { env: { ...process.env, PATH: envPath } }).status !== 0) {
    throw new Error('pg_dump lipsește — rulează `brew install libpq`')
  }
  // --project-ref în loc de --linked: jobul programat rulează din afara repo-ului. Versiune
  // fixă, altfel npx ar trage acolo ce e mai nou pe npm.
  const ref = new URL(URL_).hostname.split('.')[0]
  let dry
  for (let attempt = 1; attempt <= 3; attempt++) {
    dry = spawnSync('npx', ['--yes', 'supabase@2.117.0', 'db', 'dump', '--project-ref', ref, '--dry-run'], {
      encoding: 'utf8', maxBuffer: 10e6, timeout: 120_000,
    })
    if (dry.status === 0 && dry.stdout?.includes('pg_dump')) break
    if (attempt === 3) {
      const why = dry.error?.message || `cod ${dry.status}`
      throw new Error(`supabase db dump --dry-run (${why}): ${(dry.stderr || '').trim().slice(-200)}`)
    }
    spawnSync('sleep', [String(5 * attempt)])
  }
  // Prin pooler, conexiunea poate fi tăiată la jumătate („server closed the connection
  // unexpectedly", 2026-09-21): reîncercăm cu aceleași date de login, fișierul se rescrie.
  const file = path.join(dir, 'schema.sql')
  for (let attempt = 1; ; attempt++) {
    const out = fs.openSync(file, 'w')
    const run = spawnSync('bash', ['-s'], {
      input: dry.stdout, stdio: ['pipe', out, 'pipe'], encoding: 'utf8',
      env: { ...process.env, PATH: envPath },
    })
    fs.closeSync(out)
    if (run.status === 0) break
    if (attempt === 3) throw new Error(`pg_dump: ${(run.stderr || '').replace(/PGPASSWORD\S*/g, '').trim().slice(-200)}`)
    spawnSync('sleep', [String(10 * attempt)])
  }
  const sql = fs.readFileSync(file, 'utf8')
  const tables = (sql.match(/^CREATE TABLE /gm) || []).length
  if (tables === 0) throw new Error('schema.sql nu conține niciun tabel')
  return { bytes: sql.length, tables, functions: (sql.match(/^CREATE OR REPLACE FUNCTION /gm) || []).length }
}

// Conturile de login trăiesc în auth.users, în afara `public`, dar profilurile de staff le
// referă prin id. Fără hash-uri de parolă (API-ul nu le dă): la restaurare se re-setează.
async function exportAuthUsers() {
  const users = []
  for (let page = 1; ; page++) {
    const r = await fetchRetry(`${URL_}/auth/v1/admin/users?page=${page}&per_page=1000`, { headers: H })
    if (!r.ok) throw new Error(`auth users: ${r.status} ${await r.text()}`)
    const body = await r.json()
    if (!Array.isArray(body?.users)) throw new Error('auth users: răspuns neașteptat')
    users.push(...body.users)
    if (body.users.length < 1000) break
  }
  fs.writeFileSync(path.join(dir, 'auth-users.json'), JSON.stringify(users, null, 2))
  return users.length
}

async function exportStorage() {
  const b = await fetchRetry(`${URL_}/storage/v1/bucket`, { headers: H })
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
        const l = await fetchRetry(`${URL_}/storage/v1/object/list/${bucket.id}`, {
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
          const f = await fetchRetry(`${URL_}/storage/v1/object/${bucket.id}/${encodeURI(full)}`, { headers: H })
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
const manifest = { started_at: new Date(started).toISOString(), project: URL_, schema: null, tables: {}, storage: null }
try {
  manifest.schema = exportSchema()
  console.log(`Schema: ${manifest.schema.tables} tabele, ${manifest.schema.functions} funcții`)
} catch (e) {
  problem(`schema: ${e.message.slice(0, 200)}`)
}
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
try {
  manifest.auth_users = await exportAuthUsers()
  console.log(`Conturi de login: ${manifest.auth_users}`)
} catch (e) {
  problem(`auth users: ${e.message.slice(0, 200)}`)
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

// Rulează doar după o copie completă, deci nu rămâi niciodată fără una bună. Copiile
// incomplete sau fără storage nu ocupă locuri, se șterg; folderele fără manifest din ultima oră
// pot fi o rulare în curs și nu se ating.
function pruneOld() {
  const dirs = fs.readdirSync(root)
    .filter((n) => /^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/.test(n) && n !== stamp)
    .sort().reverse()
  let full = 1 // copia de acum
  for (const n of dirs) {
    const p = path.join(root, n)
    let m = null
    try { m = JSON.parse(fs.readFileSync(path.join(p, 'manifest.json'), 'utf8')) } catch { /* fără manifest */ }
    if (!m && Date.now() - fs.statSync(p).mtimeMs < 3600e3) continue
    const isFull = m?.complete === true && typeof m.storage === 'object' && m.storage !== null
    if (isFull && full < keep) { full++; continue }
    fs.rmSync(p, { recursive: true, force: true })
    console.log(`  șters: ${n}`)
  }
}

if (manifest.complete) {
  console.log(`Gata în ${manifest.seconds}s → ${dir}`)
  if (keep > 0 && withStorage) pruneOld()
} else {
  console.error(`\nBACKUP INCOMPLET — ${problems.length} problem(e):`)
  for (const p of problems) console.error(`  - ${p}`)
  console.error(`\nNU folosi ${dir} ca backup valid.`)
  process.exit(1)
}
