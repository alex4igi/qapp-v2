// Creează conturi de portal pentru TOT rosterul unei grupe, prin edge function
// `provision-client` (aceeași cale ca butonul din UI — zero logică duplicată).
//
// Reguli respectate:
//  - un cont per FAMILIE: dacă un cursant are `clienti.familia`, ținta e familia, nu clientul;
//    doi frați în aceeași grupă = o singură țintă.
//  - țintele care au deja `auth_user_id` sunt sărite (edge function-ul ar da 409 oricum).
//  - `provision-client` NU eșuează dacă notificarea nu pleacă (întoarce `emailed:false`),
//    de aceea parolele se scriu într-un CSV, ca să poată fi comunicate manual.
//  - parola trimisă e TEMPORARĂ (`mustChange`): portalul cere una nouă la prima
//    autentificare, altfel parola scrisă în CSV/email rămâne bună oricui o vede.
//
// Rulare:
//   node scripts/provision-grupa.mjs --curs <uuid> --dry-run
//   node scripts/provision-grupa.mjs --curs <uuid> --notify email --only ana@x.ro
//   node scripts/provision-grupa.mjs --curs <uuid> --notify email --out /tmp/uniq.csv
import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient, FunctionsHttpError } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)

const arg = (name, def = null) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : def
}
const CURS = arg('curs')
const NOTIFY = arg('notify', 'none')            // email | sms | none
const DRY = process.argv.includes('--dry-run')
const ONLY = (arg('only') ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
const OUT = arg('out', join(tmpdir(), `provision-grupa-${Date.now()}.csv`))

if (!CURS) { console.error('Lipsește --curs <uuid>'); process.exit(1) }
if (!['email', 'sms', 'none'].includes(NOTIFY)) { console.error('--notify: email | sms | none'); process.exit(1) }

const db = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// Parolă în același format ca `suggestPortalPassword` din src/lib/portalAccount.ts.
function suggestPassword(nameHint) {
  const base = (nameHint ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z]/g, '')
  const word = base ? base[0].toUpperCase() + base.slice(1, 10).toLowerCase() : 'Quasar'
  let pwd = `${word}-${Math.floor(1000 + Math.random() * 9000)}`
  while (pwd.length < 8) pwd += Math.floor(Math.random() * 10)
  return pwd
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const nume = (c) => `${c.nume ?? ''} ${c.prenume ?? ''}`.replace(/\s+/g, ' ').trim()

// ---- roster -----------------------------------------------------------------
const { data: sezon } = await db.from('sezoane').select('id, numele_sezonului').eq('activ', true).single()
const { data: curs } = await db.from('cursuri').select('id, numele').eq('id', CURS).single()
if (!curs) { console.error('Curs inexistent'); process.exit(1) }

const { data: inrolari } = await db.from('enrollments')
  .select('client').eq('cursul', CURS).eq('sezon_id', sezon.id).eq('activ', true).is('data_reziliere', null)
const clientIds = [...new Set((inrolari ?? []).map((e) => e.client).filter(Boolean))]

const { data: clienti } = await db.from('clienti')
  .select('id, nume, prenume, email, telefon, familia, auth_user_id').in('id', clientIds)
const familiaIds = [...new Set(clienti.map((c) => c.familia).filter(Boolean))]
const { data: familii } = familiaIds.length
  ? await db.from('familii').select('id, nume_familie, email, telefon, auth_user_id').in('id', familiaIds)
  : { data: [] }
const famById = Object.fromEntries(familii.map((f) => [f.id, f]))

// ---- ținte (agregate pe familie, nu pe cursant) ------------------------------
const targets = new Map()
for (const c of clienti) {
  const f = c.familia ? famById[c.familia] : null
  const key = f ? `familie:${f.id}` : `client:${c.id}`
  if (!targets.has(key)) {
    targets.set(key, {
      kind: f ? 'familie' : 'client',
      targetId: f ? f.id : c.id,
      label: f ? `Familia ${f.nume_familie}` : nume(c),
      passwordHint: f ? f.nume_familie : c.nume,
      email: (f?.email || c.email || '').trim().toLowerCase() || null,
      telefon: f?.telefon || c.telefon || null,
      hasAccount: !!(f ? f.auth_user_id : c.auth_user_id),
      membri: [],
    })
  }
  targets.get(key).membri.push(nume(c))
}

let list = [...targets.values()].sort((a, b) => a.label.localeCompare(b.label, 'ro'))
if (ONLY.length) list = list.filter((t) => t.email && ONLY.includes(t.email))

// motive de blocare
const emailCount = {}
for (const t of list) if (t.email) emailCount[t.email] = (emailCount[t.email] ?? 0) + 1
for (const t of list) {
  t.blocked = !t.email ? 'lipsă email'
    : emailCount[t.email] > 1 ? 'email duplicat în lot'
    : NOTIFY === 'sms' && !t.telefon ? 'lipsă telefon'
    : null
}

const deCreat = list.filter((t) => !t.hasAccount && !t.blocked)
console.log(`\nCurs: ${curs.numele}  ·  sezon: ${sezon.numele_sezonului}`)
console.log(`${clientIds.length} cursanți → ${list.length} ținte · ${deCreat.length} de creat · notify=${NOTIFY}${DRY ? ' · DRY RUN' : ''}\n`)
for (const t of list) {
  const stare = t.hasAccount ? 'are deja cont' : t.blocked ? `SĂRIT: ${t.blocked}` : 'de creat'
  console.log(`  [${t.kind === 'familie' ? 'F' : 'C'}] ${t.label.padEnd(28)} ${(t.email ?? '—').padEnd(32)} ${stare}${t.membri.length > 1 ? `  (${t.membri.join(', ')})` : ''}`)
}
if (DRY || !deCreat.length) { console.log(`\n${DRY ? 'Dry run — nimic creat.' : 'Nimic de creat.'}`); process.exit(0) }

// ---- token de staff (cont admin temporar, șters la final) --------------------
const STAFF_EMAIL = `provision_${Date.now()}@example.invalid`
const STAFF_PWD = `Prov-${Math.random().toString(36).slice(2, 12)}!`
const { data: staff, error: staffErr } = await db.auth.admin.createUser({
  email: STAFF_EMAIL, password: STAFF_PWD, email_confirm: true, app_metadata: { role: 'admin' },
})
if (staffErr) { console.error('Nu pot crea contul staff temporar:', staffErr.message); process.exit(1) }
const cli = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
await cli.auth.signInWithPassword({ email: STAFF_EMAIL, password: STAFF_PWD })

const rezultate = []
try {
  for (const t of deCreat) {
    const password = suggestPassword(t.passwordHint)
    const body = {
      action: 'create',
      email: t.email,
      password,
      ...(t.kind === 'familie' ? { familieId: t.targetId } : { clientId: t.targetId }),
      ...(NOTIFY === 'none' ? {} : { notify: NOTIFY }),
      mustChange: true,
    }
    let ok = false, mesaj = '', trimis = ''
    const { data, error } = await cli.functions.invoke('provision-client', { body })
    if (error) {
      mesaj = error instanceof FunctionsHttpError
        ? (await error.context.json().catch(() => null))?.error ?? error.message
        : error.message
    } else if (data?.error) {
      mesaj = data.error
    } else {
      ok = true
      trimis = NOTIFY === 'email' ? (data.emailed ? 'email trimis' : 'EMAIL NETRIMIS')
        : NOTIFY === 'sms' ? (data.smsSent ? 'SMS trimis' : 'SMS NETRIMIS') : 'fără notificare'
    }
    rezultate.push({ ...t, password, ok, mesaj, trimis })
    console.log(`  ${ok ? '✓' : '✗'} ${t.label.padEnd(28)} ${t.email.padEnd(32)} ${ok ? trimis : mesaj}`)
    await sleep(400)
  }
} finally {
  await db.auth.admin.deleteUser(staff.user.id)
}

const csv = ['tinta,tip,email,parola,rezultat,notificare,eroare']
  .concat(rezultate.map((r) => [r.label, r.kind, r.email, r.password, r.ok ? 'creat' : 'eșuat', r.trimis, r.mesaj]
    .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')))
  .join('\n')
writeFileSync(OUT, csv + '\n')

const create = rezultate.filter((r) => r.ok).length
const netrimise = rezultate.filter((r) => r.ok && r.trimis.includes('NETRIMIS'))
console.log(`\n${create}/${rezultate.length} conturi create · parole în ${OUT}`)
if (netrimise.length) console.log(`⚠️  ${netrimise.length} conturi fără notificare livrată — comunică datele manual din CSV.`)
