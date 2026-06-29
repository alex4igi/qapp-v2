// Test RLS hard-delete leads: manager poate, front_desk NU. Nu lasă date în urmă.
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

const users = []
const leads = []

async function mkUser(role) {
  const email = `zztest_${role}_${Math.abs(role.length * 7 + role.charCodeAt(0))}@quasardance.test`
  // delete leftover if exists
  const { data: list } = await admin.auth.admin.listUsers()
  const existing = list?.users?.find((u) => u.email === email)
  if (existing) await admin.auth.admin.deleteUser(existing.id)
  const { data, error } = await admin.auth.admin.createUser({
    email, password: 'ZzTest!2026', email_confirm: true, app_metadata: { role },
  })
  if (error) throw error
  users.push(data.user.id)
  return email
}

async function sessionFor(email) {
  const c = createClient(SB, ANON, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email, password: 'ZzTest!2026' })
  if (error) throw error
  return c
}

async function mkLead(nume) {
  const { data, error } = await admin.from('leads').insert({ nume, status: 'nou' }).select('id').single()
  if (error) throw error
  leads.push(data.id)
  return data.id
}

try {
  log('— Setup —')
  const mgrEmail = await mkUser('manager')
  const fdEmail = await mkUser('front_desk')
  const mgr = await sessionFor(mgrEmail)
  const fd = await sessionFor(fdEmail)
  log('  manager + front_desk creați și logați')

  log('— Test 1: front_desk NU poate șterge —')
  const leadFd = await mkLead('ZZTEST_DELETE_fd')
  await fd.from('leads').delete().eq('id', leadFd)
  const { data: stillThere } = await admin.from('leads').select('id').eq('id', leadFd).maybeSingle()
  assert(stillThere != null, 'lead-ul rămâne după DELETE de la front_desk (RLS blochează)')

  log('— Test 2: manager POATE șterge —')
  const leadMgr = await mkLead('ZZTEST_DELETE_mgr')
  const { error: delErr } = await mgr.from('leads').delete().eq('id', leadMgr)
  assert(!delErr, 'DELETE de la manager fără eroare' + (delErr ? ` (${delErr.message})` : ''))
  const { data: gone } = await admin.from('leads').select('id').eq('id', leadMgr).maybeSingle()
  assert(gone == null, 'lead-ul a dispărut din DB după DELETE de la manager')
} catch (e) {
  fails++; log('EXCEPȚIE:', e.message)
} finally {
  log('— Cleanup —')
  for (const id of leads) await admin.from('leads').delete().eq('id', id)
  for (const id of users) await admin.auth.admin.deleteUser(id)
  log('  curățat:', leads.length, 'leads,', users.length, 'users')
  log(fails === 0 ? '\n✅ TOATE TRECUTE' : `\n❌ ${fails} eșuat(e)`)
  process.exit(fails === 0 ? 0 : 1)
}
