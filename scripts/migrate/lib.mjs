// Liant comun pentru migrarea v1 (PocketBase) -> v2 (Supabase).
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dir = dirname(fileURLToPath(import.meta.url))
const JSON_DIR = join(__dir, '..', '..', 'v1 sources', 'pb_extract', 'json')

// --- Supabase client (service_role, bypass RLS) ---
function loadEnv() {
  const envPath = join(__dir, '..', '..', '.env.local')
  const out = {}
  try {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_]+)\s*=\s*(.*)$/)
      if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
  } catch {}
  return out
}
const env = loadEnv()
const URL = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('Lipsește VITE_SUPABASE_URL sau SUPABASE_SERVICE_ROLE_KEY în .env.local')
  process.exit(1)
}
export const sb = createClient(URL, KEY, { auth: { persistSession: false } })

// --- UUID v5 determinist din pb id (idempotent: re-rulări = aceleași uuid) ---
const NS = 'b3f7c2a4-1e6d-4c8a-9f0b-2d5e7a1c9b40' // namespace fix pentru această migrare
function nsBytes() {
  return Uint8Array.from(NS.replace(/-/g, '').match(/../g).map((h) => parseInt(h, 16)))
}
export function uuid(table, pbId) {
  if (!pbId) return null
  const h = createHash('sha1')
  h.update(Buffer.from(nsBytes()))
  h.update(table + ':' + pbId)
  const b = h.digest()
  b[6] = (b[6] & 0x0f) | 0x50 // versiune 5
  b[8] = (b[8] & 0x3f) | 0x80 // variant
  const hex = [...b.slice(0, 16)].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

// --- citire JSON dump ---
export function load(table) {
  return JSON.parse(readFileSync(join(JSON_DIR, table + '.json'), 'utf8'))
}

// --- transformări PocketBase ---
export function pbDate(v) {
  // "2017-05-31 21:00:00.000Z" -> "2017-05-31" (coloane tip date)
  if (!v) return null
  return String(v).slice(0, 10)
}
export function pbTimestamp(v) {
  if (!v) return null
  return String(v).replace(' ', 'T')
}
export function pbFirst(v) {
  // select PocketBase salvat ca '["Cash"]' -> "Cash"
  if (!v) return null
  if (Array.isArray(v)) return v[0] ?? null
  if (typeof v === 'string' && v.startsWith('[')) {
    try { const a = JSON.parse(v); return a[0] ?? null } catch { return v }
  }
  return v
}
export function pbArr(v) {
  if (!v) return []
  if (Array.isArray(v)) return v
  if (typeof v === 'string' && v.startsWith('[')) { try { return JSON.parse(v) } catch { return [] } }
  return v ? [v] : []
}
export const nz = (v) => (v === '' || v === undefined ? null : v) // empty -> null
export const bool = (v) => v === 1 || v === true || v === '1'

// --- insert în batch cu upsert pe id (idempotent) ---
export async function upsertAll(table, rows, { batch = 500 } = {}) {
  let ok = 0
  const errors = []
  for (let i = 0; i < rows.length; i += batch) {
    const chunk = rows.slice(i, i + batch)
    const { error } = await sb.from(table).upsert(chunk, { onConflict: 'id', defaultToNull: false })
    if (error) {
      errors.push({ at: i, msg: error.message, sample: chunk[0] })
      // încearcă rând cu rând ca să izolăm rândul problematic
      for (const r of chunk) {
        const { error: e2 } = await sb.from(table).upsert(r, { onConflict: 'id', defaultToNull: false })
        if (e2) errors.push({ id: r.id, msg: e2.message })
        else ok++
      }
    } else ok += chunk.length
    process.stdout.write(`\r  ${table}: ${ok}/${rows.length}`)
  }
  process.stdout.write('\n')
  if (errors.length) {
    console.warn(`  ⚠️ ${table}: ${errors.length} erori`)
    console.warn('  ' + JSON.stringify(errors.slice(0, 3), null, 2))
  }
  return { ok, errors }
}
