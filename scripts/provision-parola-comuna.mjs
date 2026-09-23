// ⏸ PARCAT (decizie Alex, 23 sept. 2026): rollout-ul merge pe grupe, nu pe toată comunitatea,
// iar datele de acces pleacă pe EMAIL, 1-la-1 — caz în care parola comună nu mai are niciun
// avantaj, dar păstrează riscul (cine o primește poate intra în contul altui membru al cărui
// email îl știe, și tot el îi alege parola nouă). Foloseşte `provision-grupa.mjs --curs <uuid>
// --notify email`, care dă parolă random per cont. Scriptul rămâne pentru simulări (numărul de
// membri activi fără cont) și pentru cazul în care se decide vreodată un rollout global.
//
// Creează conturi de portal cu PAROLĂ COMUNĂ TEMPORARĂ pentru membrii activi fără cont.
// La prima logare portalul cere o parolă nouă (portal_accounts.must_change_password).
// NU trimite nimic (email/SMS) — comunicarea se face separat, când se decide.
//
//   node scripts/provision-parola-comuna.mjs                       # simulare: listează țintele
//   node scripts/provision-parola-comuna.mjs --only a@x.ro,b@y.ro  # simulare doar pe câteva
//   PORTAL_PAROLA_COMUNA='…' node scripts/provision-parola-comuna.mjs --aplica [--only …] [--out rez.csv]
//
// Ținte (ca provision-grupa.mjs): clienți cu status 'Activ'; dacă au `familia`, ținta e familia
// (un cont per familie), altfel clientul. Email = familii.email, cu fallback pe clienti.email.
// Parola NU stă în cod: vine din variabila de mediu PORTAL_PAROLA_COMUNA.

import { readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const db = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const argv = process.argv.slice(2)
const arg = (name, def = null) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : def }
const APLICA = argv.includes('--aplica')
const ONLY = (arg('only') ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
const OUT = arg('out', `provision-parola-comuna-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}.csv`)
const PAROLA = process.env.PORTAL_PAROLA_COMUNA ?? ''

if (APLICA && PAROLA.length < 8) {
  console.error('Setează PORTAL_PAROLA_COMUNA (min. 8 caractere) pentru --aplica.')
  process.exit(1)
}

async function all(table, cols, filter) {
  let out = []
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(cols).range(from, from + 999)
    if (filter) q = filter(q)
    const { data, error } = await q
    if (error) throw error
    out = out.concat(data)
    if (data.length < 1000) return out
  }
}

const clienti = await all('clienti', 'id, nume, prenume, email, familia, auth_user_id', (q) => q.eq('status', 'Activ'))
const familii = await all('familii', 'id, nume_familie, email, auth_user_id')
const conturi = await all('portal_accounts', 'email')
const famById = new Map(familii.map((f) => [f.id, f]))
const emailCuCont = new Set(conturi.map((a) => String(a.email).toLowerCase()))
const nume = (c) => `${c.nume ?? ''} ${c.prenume ?? ''}`.trim()

const targets = new Map()
for (const c of clienti) {
  const f = c.familia ? famById.get(c.familia) : null
  const key = f ? `f:${f.id}` : `c:${c.id}`
  if (!targets.has(key)) {
    targets.set(key, {
      kind: f ? 'familie' : 'client',
      targetId: f ? f.id : c.id,
      label: f ? `Fam. ${f.nume_familie ?? '?'}` : nume(c),
      email: (f?.email ?? '').trim().toLowerCase() || null,
      areCont: !!f?.auth_user_id,
      membri: [],
      membriFaraCont: 0,
    })
  }
  const t = targets.get(key)
  t.membri.push(nume(c))
  if (!t.email && c.email?.trim()) t.email = c.email.trim().toLowerCase()
  // Adultul din pilotul UNIQ are cont pe client, deși stă într-o familie de un membru.
  if (!c.auth_user_id) t.membriFaraCont++
}

let list = [...targets.values()].filter((t) => !t.areCont && t.membriFaraCont > 0)
if (ONLY.length) list = list.filter((t) => t.email && ONLY.includes(t.email))
list.sort((a, b) => a.label.localeCompare(b.label, 'ro'))

const emailCount = {}
for (const t of list) if (t.email) emailCount[t.email] = (emailCount[t.email] ?? 0) + 1
for (const t of list) {
  t.blocat = !t.email ? 'lipsă email'
    : !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t.email) ? 'email invalid'
    : emailCount[t.email] > 1 ? 'email dublat în lot'
    : emailCuCont.has(t.email) ? 'email folosit deja de alt cont'
    : null
}

const deCreat = list.filter((t) => !t.blocat)
const blocate = list.filter((t) => t.blocat)
const motive = {}
for (const t of blocate) motive[t.blocat] = (motive[t.blocat] ?? 0) + 1

console.log(`Ținte fără cont (membri activi): ${list.length}`)
console.log(`  de creat: ${deCreat.length}`)
console.log(`  blocate:  ${blocate.length}`, motive)
if (ONLY.length || !APLICA) {
  for (const t of list.slice(0, ONLY.length ? list.length : 15)) {
    console.log(`  [${t.kind === 'familie' ? 'F' : 'C'}] ${t.label.padEnd(28)} ${(t.email ?? '—').padEnd(34)} ${t.blocat ?? 'de creat'}`)
  }
  if (!ONLY.length && list.length > 15) console.log(`  … încă ${list.length - 15}`)
}

if (!APLICA) {
  console.log('\nSIMULARE — nimic scris. Rulează cu --aplica (și PORTAL_PAROLA_COMUNA) ca să creezi conturile.')
  process.exit(0)
}

const rezultate = []
for (const t of deCreat) {
  const { data, error } = await db.rpc('portal_create_account_temp', {
    p_email: t.email,
    p_password: PAROLA,
    p_familie_id: t.kind === 'familie' ? t.targetId : null,
    p_client_id: t.kind === 'client' ? t.targetId : null,
  })
  const ok = !error && !!data
  rezultate.push({ ...t, ok, mesaj: error?.message ?? '' })
  console.log(`  ${ok ? '✓' : '✗'} ${t.label.padEnd(28)} ${t.email.padEnd(34)} ${ok ? 'creat' : error?.message}`)
}
for (const t of blocate) rezultate.push({ ...t, ok: false, mesaj: t.blocat })

const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
const csv = ['tinta,tip,email,membri,rezultat,motiv']
  .concat(rezultate.map((r) => [r.label, r.kind, r.email, r.membri.join('; '), r.ok ? 'creat' : 'necreat', r.mesaj].map(esc).join(',')))
  .join('\n')
writeFileSync(OUT, csv)
console.log(`\nCreate: ${rezultate.filter((r) => r.ok).length} · necreate: ${rezultate.filter((r) => !r.ok).length} · raport: ${OUT}`)
