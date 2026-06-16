// Test end-to-end pentru edge function provision-client (creare/reset/unlink cont parinte).
// Creează un cont STAFF temporar ca să obțină un token real, apoi exersează funcția.
// Rulare: node scripts/test-provision.mjs  (auto-cleanup)

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const svc = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const T = 'PROV_' + Date.now()
const STAFF_EMAIL = `staff_${Date.now()}@example.invalid`
const PARENT_EMAIL = `parent_${Date.now()}@example.invalid`
const PWD = 'Test12345!'
let pass = 0, fail = 0
const check = (n, ok, d = '') => { ok ? (pass++, console.log(`  ✓ ${n}`)) : (fail++, console.log(`  ✗ ${n} ${d}`)) }
const c = { fam: null, staffId: null, parentId: null }

try {
  // staff temporar (admin)
  const { data: staff } = await svc.auth.admin.createUser({
    email: STAFF_EMAIL, password: PWD, email_confirm: true, app_metadata: { role: 'admin' },
  })
  c.staffId = staff.user.id
  const { data: fam } = await svc.from('familii').insert({ nume_familie: T, email: PARENT_EMAIL }).select('id').single()
  c.fam = fam.id

  // client staff logat
  const cli = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  await cli.auth.signInWithPassword({ email: STAFF_EMAIL, password: PWD })

  console.log('\nprovision-client (caller=admin):')

  // create
  const { data: cr, error: crErr } = await cli.functions.invoke('provision-client', {
    body: { action: 'create', familieId: fam.id, email: PARENT_EMAIL, password: PWD },
  })
  check('create → user returnat', !crErr && !cr?.error && !!cr?.user?.id, crErr?.message ?? cr?.error)
  c.parentId = cr?.user?.id

  // verifică legarea în DB
  const { data: famRow } = await svc.from('familii').select('auth_user_id').eq('id', fam.id).single()
  check('familii.auth_user_id legat', famRow?.auth_user_id === c.parentId)
  // verifică rolul parinte
  if (c.parentId) {
    const { data: pu } = await svc.auth.admin.getUserById(c.parentId)
    check("app_metadata.role = 'parinte'", pu.user?.app_metadata?.role === 'parinte')
  }

  // create duplicat → 409 (supabase-js pune non-2xx în `error`, nu în data)
  const { data: dup, error: dupErr } = await cli.functions.invoke('provision-client', {
    body: { action: 'create', familieId: fam.id, email: 'x' + PARENT_EMAIL, password: PWD },
  })
  check('create duplicat → respins', !!dupErr || !!dup?.error, '(fără eroare!)')

  // reset password
  const { data: rs } = await cli.functions.invoke('provision-client', {
    body: { action: 'reset_password', userId: c.parentId, password: 'NewPwd9999!' },
  })
  check('reset_password → ok', rs?.ok === true, rs?.error)

  // parintele se poate loga cu noua parolă
  const p = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const { error: loginErr } = await p.auth.signInWithPassword({ email: PARENT_EMAIL, password: 'NewPwd9999!' })
  check('login parinte cu parola nouă', !loginErr, loginErr?.message)
  await p.auth.signOut()

  // unlink (șterge contul)
  const { data: un } = await cli.functions.invoke('provision-client', {
    body: { action: 'unlink', familieId: fam.id },
  })
  check('unlink → ok', un?.ok === true, un?.error)
  const { data: famRow2 } = await svc.from('familii').select('auth_user_id').eq('id', fam.id).single()
  check('familii.auth_user_id curățat', famRow2?.auth_user_id == null)
  c.parentId = null // deja șters de unlink

  await cli.auth.signOut()
} catch (e) {
  console.error('EROARE:', e.message ?? e); fail++
} finally {
  console.log('\nCleanup…')
  if (c.fam) await svc.from('familii').delete().eq('id', c.fam)
  if (c.staffId) await svc.auth.admin.deleteUser(c.staffId)
  if (c.parentId) await svc.auth.admin.deleteUser(c.parentId)
  console.log('  date de test șterse')
}
console.log(`\nRezultat: ${pass} pass, ${fail} fail`)
process.exit(fail === 0 ? 0 : 1)
