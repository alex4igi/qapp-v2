// Importă lista curatoriată de unități de învățământ în `unitati_invatamant`.
//
// Sursa: scripts/data/unitati-invatamant.csv (nume,tip,localitate,alias — aliasurile
// separate prin ';'; liniile cu # se ignoră). Rulările următoare SINCRONIZEAZĂ
// tip/localitate/alias pentru unitățile din CSV (atenție: suprascriu editările
// făcute între timp pe acele rânduri). Intrările importate de aici pleacă cu `de_verificat = false` —
// sunt lista oficială. Cele născute din ce tastează recepția/portalul rămân
// `de_verificat = true`, ca să poată fi triate ulterior.
//
// Idempotent: unicitatea e pe numele normalizat (fără diacritice/punctuație), deci
// o a doua rulare nu dublează nimic. Dacă o școală tastată de recepție există deja
// sub același nume normalizat, i se confirmă doar numele canonic din CSV.
//
// Rulare:  node scripts/seed-unitati-invatamant.mjs [--dry-run]

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)

const dryRun = process.argv.includes('--dry-run')
const db = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// Aceeași normalizare ca `norm_unitate()` din DB (migrația 20260913140000).
const norm = (s) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

// CSV simplu: câmpuri opțional în ghilimele, fără newline în interior.
function parseLine(line) {
  const out = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') inQ = false
      else cur += c
    } else if (c === '"') inQ = true
    else if (c === ',') { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

const raw = readFileSync(new URL('./data/unitati-invatamant.csv', import.meta.url), 'utf8')
const rows = raw
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'))
  .slice(1) // antetul
  .map(parseLine)
  .filter((c) => c[0])
  .map(([nume, tip, localitate, alias]) => ({
    nume,
    tip: tip || null,
    localitate: localitate || null,
    alias: (alias ?? '')
      .split(';')
      .map((a) => a.trim())
      .filter(Boolean),
    de_verificat: false,
  }))

const dubluriCsv = new Map()
for (const r of rows) {
  const k = norm(r.nume)
  dubluriCsv.set(k, (dubluriCsv.get(k) ?? 0) + 1)
}
const colide = [...dubluriCsv.entries()].filter(([, n]) => n > 1)
if (colide.length) {
  console.error('❌ Dubluri în CSV (același nume normalizat):')
  for (const [k] of colide) console.error('   ', k)
  process.exit(1)
}

const { data: existente, error: eSel } = await db
  .from('unitati_invatamant')
  .select('id, nume, tip, localitate, alias, de_verificat')
if (eSel) throw eSel
const dupaNorm = new Map(existente.map((u) => [norm(u.nume), u]))

const deAdaugat = rows.filter((r) => !dupaNorm.has(norm(r.nume)))
// Sincronizăm și rândurile deja existente: altfel aliasurile adăugate în CSV
// după primul import n-ar ajunge niciodată în DB.
const deSincronizat = rows
  .map((r) => ({ r, ex: dupaNorm.get(norm(r.nume)) }))
  .filter(
    ({ r, ex }) =>
      ex &&
      (ex.de_verificat ||
        ex.nume !== r.nume ||
        ex.tip !== r.tip ||
        ex.localitate !== r.localitate ||
        (ex.alias ?? []).join('|') !== r.alias.join('|')),
  )

console.log(`CSV: ${rows.length} unități | în DB: ${existente.length}`)
console.log(`→ de adăugat: ${deAdaugat.length} | de sincronizat: ${deSincronizat.length}`)
for (const { r, ex } of deSincronizat)
  console.log(`   sync „${ex.nume}"${ex.nume !== r.nume ? ` → „${r.nume}"` : ''}${r.alias.length ? ` [${r.alias.join(', ')}]` : ''}`)

if (dryRun) {
  console.log('\n(dry-run — nu s-a scris nimic)')
  process.exit(0)
}

if (deAdaugat.length) {
  const { error } = await db.from('unitati_invatamant').insert(deAdaugat)
  if (error) throw error
}
for (const { r, ex } of deSincronizat) {
  const { error } = await db
    .from('unitati_invatamant')
    .update({
      nume: r.nume,
      tip: r.tip,
      localitate: r.localitate,
      alias: r.alias,
      de_verificat: false,
    })
    .eq('id', ex.id)
  if (error) throw error
}

console.log(`✅ Gata: +${deAdaugat.length} adăugate, ${deSincronizat.length} sincronizate.`)
